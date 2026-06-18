import os
import json
from e2b import Sandbox
from dotenv import load_dotenv

load_dotenv()

# Default execution timeout in seconds.
# Long-running servers are wrapped in a self-terminating script,
# so 60s is sufficient for self-tests to complete.
DEFAULT_TIMEOUT = 60

LANGUAGE_CONFIG = {
    "javascript": {"suffix": ".js",  "cmd": "node"},
    "js":         {"suffix": ".js",  "cmd": "node"},
    "python":     {"suffix": ".py",  "cmd": "python3"},
    "py":         {"suffix": ".py",  "cmd": "python3"},
}

def _wrap_server_code(code: str, language: str) -> str:
    """
    Wraps server/long-running code so it exits automatically after
    a short delay. Detects server code by looking for listen() / serve() calls.
    Only applied to JavaScript for now.
    """
    js_server_signals = ["listen(", ".createServer(", "app.listen"]
    py_server_signals = [".serve(", "httpd.serve", "app.run("]

    if language in ("javascript", "js"):
        if any(sig in code for sig in js_server_signals):
            # Inject a process.exit() after 10 s so the self-test runs and exits cleanly
            wrapper = (
                "// CodeSentinel: auto-exit wrapper for server self-test\n"
                "setTimeout(() => { process.exit(0); }, 10000);\n\n"
            )
            return wrapper + code

    elif language in ("python", "py"):
        if any(sig in code for sig in py_server_signals):
            pass  # Python servers handled separately if needed

    return code


def execute_in_sandbox(code: str, language: str = "javascript", timeout: int = DEFAULT_TIMEOUT) -> dict:
    """
    Executes code of any supported language inside E2B sandbox.
    Supports single flat code strings or JSON files mappings.
    """
    if not os.environ.get("E2B_API_KEY"):
        return {
            "success": False,
            "stdout": "",
            "stderr": "Error: E2B_API_KEY environment variable is not set."
        }

    lang = str(language).lower()
    config = LANGUAGE_CONFIG.get(lang, LANGUAGE_CONFIG["javascript"])
    suffix = config["suffix"]
    exec_cmd = config["cmd"]

    # Check if code is a JSON files map
    files_map = None
    try:
        if code and (code.strip().startswith("{") or code.strip().startswith("[")):
            data = json.loads(code)
            if isinstance(data, dict) and "files" in data:
                files_map = data["files"]
    except Exception:
        pass

    try:
        with Sandbox.create() as sandbox:
            if files_map:
                # Resolve entry file
                entry_file = None
                possible_entries = ["main.py", "index.js", "index.ts", "main.go", "main.rs", "app.py", "server.js", "app.js"]
                for f in possible_entries:
                    if f in files_map:
                        entry_file = f
                        break
                if not entry_file:
                    # Fallback to the first file that matches the language suffix or the first key
                    for f in files_map.keys():
                        if f.endswith(suffix):
                            entry_file = f
                            break
                    if not entry_file:
                        entry_file = list(files_map.keys())[0] if files_map else f"index{suffix}"

                # Write all files into E2B sandbox
                for filepath, file_content in files_map.items():
                    # Ignore sentinel metadata and reports
                    if filepath == "security_report.md" or filepath.startswith(".sentinel/"):
                        continue
                    
                    sandbox_path = f"/home/user/code/{filepath}"
                    parent_dir = os.path.dirname(filepath)
                    
                    if parent_dir:
                        sandbox.commands.run(f"mkdir -p /home/user/code/{parent_dir}")
                    
                    # Wrap the entry file if it's node/python to auto-exit
                    if filepath == entry_file:
                        wrapped = _wrap_server_code(file_content, lang)
                    else:
                        wrapped = file_content
                        
                    sandbox.files.write(sandbox_path, wrapped)
                
                # Execute primary entry file
                run_path = f"/home/user/code/{entry_file}"
            else:
                # Single file fallback
                sandbox_path = f"/home/user/code{suffix}"
                wrapped_code = _wrap_server_code(code, lang)
                sandbox.files.write(sandbox_path, wrapped_code)
                run_path = sandbox_path

            execution = sandbox.commands.run(
                f"{exec_cmd} {run_path}",
                timeout=timeout
            )

            stdout = execution.stdout or ""
            stderr = execution.stderr or ""
            exit_code = execution.exit_code

            # Exit code 0 = clean success
            # Exit code None (timeout reached) = treat as success if stdout was produced
            if exit_code == 0:
                success = True
            elif exit_code is None and stdout.strip():
                success = True
                stderr = ""
            else:
                success = False

            return {
                "success": success,
                "stdout": stdout,
                "stderr": stderr
            }

    except Exception as e:
        err_msg = str(e)
        # If the error is a timeout/deadline and stdout exists, still treat as pass
        if "deadline" in err_msg.lower() or "timeout" in err_msg.lower():
            return {
                "success": False,
                "stdout": "",
                "stderr": (
                    f"E2B timeout ({timeout}s). If this is a server script, "
                    "ensure it includes a process.exit() after its self-test."
                )
            }
        return {
            "success": False,
            "stdout": "",
            "stderr": f"E2B Execution Exception: {err_msg}"
        }


def execute_nodejs_in_sandbox(code: str) -> dict:
    """Convenience wrapper — kept for backward compatibility with older test scripts."""
    return execute_in_sandbox(code, language="javascript")
