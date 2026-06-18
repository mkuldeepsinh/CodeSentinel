import os
import tempfile
import shutil
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
    Writes the given code or multiple files map to a temporary location,
    runs Semgrep on it, and returns the raw findings list.
    """
    files_map = None
    try:
        if code and (code.strip().startswith("{") or code.strip().startswith("[")):
            data = json.loads(code)
            if isinstance(data, dict) and "files" in data:
                files_map = data["files"]
    except Exception:
        pass

    temp_path = None
    temp_dir = None

    if files_map:
        temp_dir = tempfile.mkdtemp()
        for filepath, content in files_map.items():
            if filepath == "security_report.md" or filepath.startswith(".sentinel/"):
                continue
            full_path = os.path.join(temp_dir, filepath)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)
        scan_target = temp_dir
    else:
        lang = str(language).lower()
        suffix = LANGUAGE_CONFIG.get(lang, ".js")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode='w', encoding='utf-8') as temp:
            temp.write(code)
            temp_path = temp.name
        scan_target = temp_path

    try:
        # Resolve the semgrep path inside backend/.venv/bin/semgrep
        current_dir = os.path.dirname(os.path.abspath(__file__))
        semgrep_bin = os.path.abspath(os.path.join(current_dir, "..", ".venv", "bin", "semgrep"))
        
        if not os.path.exists(semgrep_bin):
            semgrep_bin = "semgrep"
            
        cmd = [semgrep_bin, "scan", "--config=auto", "--json", scan_target]
        
        # Run semgrep command
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Parse JSON output
        if result.stdout:
            try:
                data = json.loads(result.stdout)
                results = data.get("results", [])
                
                # If we scanned a single temp file, fix paths to be cleaner
                if temp_path:
                    for r in results:
                        r["path"] = get_default_filename(language)
                else:
                    # Strip temp_dir prefix from filepath to keep paths relative to the project root
                    for r in results:
                        p = r.get("path", "")
                        if p.startswith(temp_dir):
                            r["path"] = os.path.relpath(p, temp_dir)
                return results
            except json.JSONDecodeError:
                return []
        return []
    finally:
        # Ensure temporary file and folder are deleted
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

def get_default_filename(language: str) -> str:
    lang = str(language).lower()
    if lang == "python":
        return "main.py"
    elif lang in ["typescript", "ts"]:
        return "index.ts"
    elif lang in ["go", "golang"]:
        return "main.go"
    elif lang == "rust":
        return "main.rs"
    else:
        return "index.js"

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
    path = raw.get("path", "")

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
        "path": path,
        "cwe": cwe,
        "owasp": owasp
    }

