import os
import sys
from dotenv import load_dotenv, find_dotenv

# Ensure import paths resolve correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from tools.code_utils import execute_nodejs_in_sandbox
from tools.semgrep_tool import run_semgrep, normalize_finding

def test_e2b():
    print("Testing E2B sandbox...")
    code = "console.log('Hello from E2B sandbox!');"
    res = execute_nodejs_in_sandbox(code)
    print("Result:", res)
    assert res["success"] is True, "E2B run failed"
    assert "Hello from E2B sandbox!" in res["stdout"], "Expected stdout not found"
    print("E2B test passed!")

def test_semgrep():
    print("Testing Semgrep scan...")
    # Vulnerable JS code (dangerous eval)
    code = """
    const express = require('express');
    const app = express();
    app.get('/run', (req, res) => {
        eval(req.query.code);
        res.send('Done');
    });
    """
    raw_findings = run_semgrep(code)
    print(f"Found {len(raw_findings)} raw findings.")
    assert len(raw_findings) > 0, "Semgrep found no findings on vulnerable code"
    for f in raw_findings:
        norm = normalize_finding(f)
        print("Normalized Finding:", norm)
    print("Semgrep test passed!")

if __name__ == "__main__":
    load_dotenv(find_dotenv())
    try:
        test_e2b()
        print("-" * 40)
        test_semgrep()
        print("-" * 40)
        print("All Step 1 tests passed successfully!")
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
