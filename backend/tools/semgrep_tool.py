import os
import tempfile
import subprocess
import json
from typing import List, Dict, Any

LANGUAGE_CONFIG = {
    "javascript": ".js",
    "js": ".js",
    "python": ".py",
    "py": ".py"
}

def run_semgrep(code: str, language: str = "javascript") -> List[dict]:
    """
    Writes the given code to a temporary file of correct extension,
    runs Semgrep on it, and returns the raw findings list.
    """
    lang = str(language).lower()
    suffix = LANGUAGE_CONFIG.get(lang, ".js")
    
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode='w', encoding='utf-8') as temp:
        temp.write(code)
        temp_path = temp.name

    try:
        # Resolve the semgrep path inside backend/.venv/bin/semgrep
        current_dir = os.path.dirname(os.path.abspath(__file__))
        semgrep_bin = os.path.abspath(os.path.join(current_dir, "..", ".venv", "bin", "semgrep"))
        
        if not os.path.exists(semgrep_bin):
            semgrep_bin = "semgrep"
            
        cmd = [semgrep_bin, "scan", "--config=auto", "--json", temp_path]
        
        # Run semgrep command
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Parse JSON output
        if result.stdout:
            try:
                data = json.loads(result.stdout)
                return data.get("results", [])
            except json.JSONDecodeError:
                return []
        return []
    finally:
        # Ensure temporary file is deleted
        if os.path.exists(temp_path):
            os.remove(temp_path)

def normalize_finding(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes a raw Semgrep finding dictionary into the format matching SemgrepFinding model.
    """
    check_id = raw.get("check_id", "unknown_rule")
    extra = raw.get("extra", {})
    message = extra.get("message", "No description provided")
    
    # Normalize severity to ERROR, WARNING, or INFO
    raw_severity = str(extra.get("severity", "WARNING")).upper()
    if raw_severity not in ["ERROR", "WARNING", "INFO"]:
        # Default fallback mapping
        if "ERR" in raw_severity:
            severity = "ERROR"
        elif "WARN" in raw_severity:
            severity = "WARNING"
        else:
            severity = "INFO"
    else:
        severity = raw_severity

    start = raw.get("start", {})
    line = start.get("line", 1)

    metadata = extra.get("metadata", {})
    
    # Extract CWE list from metadata
    raw_cwe = metadata.get("cwe", [])
    cwe = []
    if isinstance(raw_cwe, list):
        cwe = [str(c) for c in raw_cwe]
    elif isinstance(raw_cwe, str):
        cwe = [raw_cwe]
        
    # Extract OWASP list from metadata
    raw_owasp = metadata.get("owasp", [])
    owasp = []
    if isinstance(raw_owasp, list):
        owasp = [str(o) for o in raw_owasp]
    elif isinstance(raw_owasp, str):
        owasp = [raw_owasp]
        
    return {
        "check_id": check_id,
        "message": message,
        "severity": severity,
        "line": line,
        "cwe": cwe,
        "owasp": owasp
    }
