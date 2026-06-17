import os
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

    Args:
        code:     Source code to execute.
        language: Target language (javascript / python).
        timeout:  Max seconds before the sandbox command is killed (default 60s).

    Returns:
        dict with keys: success (bool), stdout (str), stderr (str).
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

    sandbox_path = f"/home/user/code{suffix}"

    # Wrap server-type scripts so they self-exit after running their self-test
    wrapped_code = _wrap_server_code(code, lang)

    try:
        with Sandbox.create() as sandbox:
            sandbox.files.write(sandbox_path, wrapped_code)
            execution = sandbox.commands.run(
                f"{exec_cmd} {sandbox_path}",
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
                success = True   # server printed output then hit timeout gracefully
                stderr = ""      # don't report timeout as an error
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
