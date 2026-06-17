import os
from e2b import Sandbox
from dotenv import load_dotenv

load_dotenv()

LANGUAGE_CONFIG = {
    "javascript": {"suffix": ".js", "cmd": "node"},
    "js": {"suffix": ".js", "cmd": "node"},
    "python": {"suffix": ".py", "cmd": "python3"},
    "py": {"suffix": ".py", "cmd": "python3"}
}

def execute_in_sandbox(code: str, language: str = "javascript") -> dict:
    """
    Executes code of any supported language inside E2B sandbox.
    Returns dict with keys: success, stdout, stderr.
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
    
    try:
        with Sandbox.create() as sandbox:
            sandbox.files.write(sandbox_path, code)
            execution = sandbox.commands.run(f"{exec_cmd} {sandbox_path}")
            
            success = execution.exit_code == 0
            return {
                "success": success,
                "stdout": execution.stdout or "",
                "stderr": execution.stderr or ""
            }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": f"E2B Execution Exception: {str(e)}"
        }
