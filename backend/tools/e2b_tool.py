import os
from e2b import Sandbox
from dotenv import load_dotenv

load_dotenv()

def execute_nodejs_in_sandbox(code: str) -> dict:
    """
    Executes Node.js code inside an E2B sandbox.
    Returns a dict with keys: success (bool), stdout (str), stderr (str)
    """
    if not os.environ.get("E2B_API_KEY"):
        return {
            "success": False,
            "stdout": "",
            "stderr": "Error: E2B_API_KEY environment variable is not set."
        }
    
    try:
        # Create a sandbox using the context manager
        with Sandbox.create() as sandbox:
            # Write the javascript code to the sandbox
            sandbox.files.write("/home/user/index.js", code)
            
            # Run the code via node command
            execution = sandbox.commands.run("node /home/user/index.js")
            
            # success if exit code is 0
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
