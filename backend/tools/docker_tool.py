"""
docker_tool.py — Docker-based code execution engine (Plan C replacement for E2B).

Runs user code in isolated Docker containers with:
  - Full npm / pip ecosystem (no module-not-found errors)
  - Proper stdin-free non-interactive execution for pipeline use
  - Resource limits (CPU + RAM) for safety
  - Auto container cleanup after each run
  - PTY session support for interactive terminal (WebSocket)
"""

import os
import json
import base64
import threading
from typing import Optional

# Lazy-import docker so the module can be imported even if docker-py is not yet
# installed (import will only fail when a function is actually called).
try:
    import docker as _docker
    _docker_client = _docker.from_env()
except Exception:
    _docker_client = None  # type: ignore

# ── Constants ──────────────────────────────────────────────────────────────────

DOCKER_IMAGE = "node:20-alpine"   # ships with node + npm out of the box
PYTHON_IMAGE = "python:3.12-alpine"

RESOURCE_LIMITS = {
    "cpu_quota": 50000,   # 0.5 CPU core (out of 100000 = 1 core)
    "mem_limit": "256m",
}

DEFAULT_TIMEOUT = 60  # seconds for pipeline runs

# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_client():
    """Return docker client, raising a clear error if docker-py is unavailable."""
    if _docker_client is None:
        raise RuntimeError(
            "Docker SDK not available. Install it with: pip install docker"
        )
    return _docker_client


def _write_file_to_container(container, path: str, content: str):
    """
    Write a text file into a running container.
    Uses base64-encode → exec sh -c 'echo <b64> | base64 -d > <path>'
    to avoid shell quoting issues with arbitrary content.
    """
    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    # Split into 60-char chunks to stay well within ARG_MAX
    chunks = [encoded[i:i+60] for i in range(0, len(encoded), 60)]
    
    # Write first chunk (overwrite), append remaining chunks
    first = chunks[0] if chunks else ""
    container.exec_run(f"sh -c 'printf \"%s\" \"{first}\" | base64 -d > {path}'")
    for chunk in chunks[1:]:
        container.exec_run(f"sh -c 'printf \"%s\" \"{chunk}\" | base64 -d >> {path}'")


def _ensure_parent_dir(container, filepath: str):
    """mkdir -p the parent directory of filepath inside the container."""
    parent = os.path.dirname(filepath)
    if parent and parent != "/":
        container.exec_run(f"mkdir -p {parent}")


def _image_for_language(lang: str) -> str:
    if lang in ("python", "py"):
        return PYTHON_IMAGE
    return DOCKER_IMAGE  # node:20-alpine handles JS / TS


def _exec_cmd_for_language(lang: str) -> str:
    if lang in ("python", "py"):
        return "python3"
    return "node"


def _entry_candidates_for_language(lang: str) -> list:
    if lang in ("python", "py"):
        return ["main.py", "app.py", "index.py", "run.py"]
    return ["index.js", "server.js", "app.js", "main.js", "index.ts"]


def _suffix_for_language(lang: str) -> str:
    if lang in ("python", "py"):
        return ".py"
    if lang in ("typescript", "ts"):
        return ".ts"
    return ".js"

# ── Main executor ──────────────────────────────────────────────────────────────

def run_code_in_container(
    code: str,
    language: str = "javascript",
    timeout: int = DEFAULT_TIMEOUT,
) -> dict:
    """
    Execute code in a fresh, isolated Docker container.

    Accepts either:
      - A plain code string (single file)
      - A JSON string {"files": {"filename": "content", ...}} (multi-file project)

    Returns:
      {"success": bool, "stdout": str, "stderr": str}
    """
    client = _get_client()
    lang   = language.lower().strip()
    image  = _image_for_language(lang)
    exec_cmd = _exec_cmd_for_language(lang)
    candidates = _entry_candidates_for_language(lang)
    suffix = _suffix_for_language(lang)

    # ── Parse multi-file JSON or treat as single file ──────────────────────────
    files_map: Optional[dict] = None
    try:
        if code and (code.strip().startswith("{") or code.strip().startswith("[")):
            parsed = json.loads(code)
            if isinstance(parsed, dict) and "files" in parsed:
                files_map = parsed["files"]
    except Exception:
        pass

    # ── Determine entry point ──────────────────────────────────────────────────
    if files_map:
        entry_file = None
        for candidate in candidates:
            if candidate in files_map:
                entry_file = candidate
                break
        if not entry_file:
            for fname in files_map:
                if fname.endswith(suffix):
                    entry_file = fname
                    break
        if not entry_file and files_map:
            entry_file = list(files_map.keys())[0]
    else:
        entry_file = f"index{suffix}"

    # ── Spin up container ──────────────────────────────────────────────────────
    container = None
    try:
        container = client.containers.run(
            image,
            command="sh",       # keep alive for exec calls
            detach=True,
            stdin_open=True,
            tty=False,
            working_dir="/workspace",
            **RESOURCE_LIMITS,
        )

        # ── Write source files ─────────────────────────────────────────────────
        container.exec_run("mkdir -p /workspace")

        if files_map:
            for filepath, content in files_map.items():
                # Skip sentinel metadata
                if filepath == "security_report.md" or filepath.startswith(".sentinel/"):
                    continue
                full_path = f"/workspace/{filepath}"
                _ensure_parent_dir(container, full_path)
                _write_file_to_container(container, full_path, content)
        else:
            _write_file_to_container(container, f"/workspace/{entry_file}", code)

        # ── npm install for JS packages ────────────────────────────────────────
        if lang in ("javascript", "js", "typescript", "ts"):
            from tools.code_utils import extract_npm_packages
            all_code = "\n".join(files_map.values()) if files_map else code
            pkgs = extract_npm_packages(all_code)
            if pkgs:
                install_result = container.exec_run(
                    f"npm install --no-audit --no-fund {' '.join(pkgs)}",
                    workdir="/workspace",
                )
                if install_result.exit_code != 0:
                    err_out = (install_result.output or b"").decode("utf-8", errors="replace")
                    print(f"[docker_tool] npm install warning: {err_out[:200]}")

        # ── pip install for Python packages ────────────────────────────────────
        if lang in ("python", "py"):
            from tools.code_utils import extract_python_packages
            all_code_py = "\n".join(files_map.values()) if files_map else code
            py_pkgs = extract_python_packages(all_code_py)
            if py_pkgs:
                pip_result = container.exec_run(
                    f"pip install --quiet {' '.join(py_pkgs)}",
                    workdir="/workspace",
                )
                if pip_result.exit_code != 0:
                    err_out = (pip_result.output or b"").decode("utf-8", errors="replace")
                    print(f"[docker_tool] pip install warning: {err_out[:200]}")

        # ── Execute ────────────────────────────────────────────────────────────
        # Wrap execution in BusyBox timeout command to prevent infinite hanging (e.g. servers)
        exec_result = container.exec_run(
            f"timeout {timeout} {exec_cmd} /workspace/{entry_file}",
            workdir="/workspace",
            demux=True,   # separate stdout and stderr streams
        )

        stdout_bytes, stderr_bytes = exec_result.output if exec_result.output else (b"", b"")
        stdout = (stdout_bytes or b"").decode("utf-8", errors="replace")
        stderr = (stderr_bytes or b"").decode("utf-8", errors="replace")

        # If the command timed out (exit status 143 or 124), append feedback warning
        if exec_result.exit_code in (124, 143):
            stderr += f"\n[CodeSentinel] Execution timed out after {timeout} seconds."

        return {
            "success": exec_result.exit_code == 0,
            "stdout": stdout,
            "stderr": stderr,
        }

    except Exception as exc:
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Docker execution error: {str(exc)}",
        }
    finally:
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass


# ── Interactive PTY session ────────────────────────────────────────────────────

class DockerTerminalSession:
    """
    Manages a long-lived Docker container + PTY exec session for the interactive
    terminal tab.  Used by the WebSocket endpoint in main.py.
    """

    def __init__(self, session_id: str, image: str = DOCKER_IMAGE, project_id: Optional[str] = None):
        self.session_id = session_id
        self.image = image
        self.project_id = project_id
        self._client = _get_client()
        self.container = None
        self._exec_id = None
        self._sock = None

    def start(self):
        """Start the container and open a PTY exec session."""
        workdir = "/workspace"
        if self.project_id:
            workdir = f"/codesentinel/{self.project_id}"

        self.container = self._client.containers.run(
            self.image,
            command="/bin/sh",
            detach=True,
            stdin_open=True,
            tty=True,
            working_dir=workdir,
            **RESOURCE_LIMITS,
        )
        self._client.api.exec_create  # ensure api is accessible

        exec_resp = self._client.api.exec_create(
            self.container.id,
            "/bin/sh",
            stdin=True,
            tty=True,
            stdout=True,
            stderr=True,
        )
        self._exec_id = exec_resp["Id"]
        self._sock = self._client.api.exec_start(
            self._exec_id, tty=True, socket=True
        )
        self._sock._sock.setblocking(False)
        return self

    def read(self, size: int = 1024) -> bytes:
        """Non-blocking read from PTY."""
        try:
            return self._sock._sock.recv(size)
        except BlockingIOError:
            return b""

    def write(self, data: bytes):
        """Write bytes to PTY stdin."""
        self._sock._sock.sendall(data)

    def load_files(self, files: dict):
        """Write files into container workspace."""
        if not self.container:
            return
        workdir = f"/codesentinel/{self.project_id}" if self.project_id else "/workspace"
        self.container.exec_run(f"mkdir -p {workdir}")
        for filepath, content in files.items():
            if filepath == "security_report.md" or filepath.startswith(".sentinel/"):
                continue
            full_path = f"{workdir}/{filepath}"
            _ensure_parent_dir(self.container, full_path)
            _write_file_to_container(self.container, full_path, content)

    def resize(self, cols: int, rows: int):
        """Resize the PTY."""
        try:
            self._client.api.exec_resize(self._exec_id, height=rows, width=cols)
        except Exception:
            pass

    def stop(self):
        """Kill and remove the container."""
        try:
            if self.container:
                self.container.remove(force=True)
        except Exception:
            pass
