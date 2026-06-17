# CodeSentinel Step 1 (Foundations) Implementation Plan

Plan for building the core data models and tool definitions.

---

## 1. State Definition (`graph/state.py`)
Define variables shared across nodes and structured data returned by LLM agents.

### Data Models
* **`SemgrepFinding` (Pydantic Model)**:
  * `check_id` (str)
  * `message` (str)
  * `severity` (str: `ERROR`, `WARNING`, `INFO`)
  * `line` (int)
  * `cwe` (list[str])
  * `owasp` (list[str])
* **`TriageOutput` (Pydantic Model)**:
  * `verdict` (str: `fix` or `clean`)
  * `security_score` (int: 0–100)
  * `findings_to_fix` (list[SemgrepFinding])
  * `reasoning` (str)
* **`PipelineState` (TypedDict)**:
  * `user_prompt` (str)
  * `language` (str)
  * `current_code` (str)
  * `execution_stdout` (str)
  * `execution_stderr` (str)
  * `execution_success` (bool)
  * `dev_retries` (int)
  * `raw_semgrep_findings` (list[dict])
  * `triage_output` (TriageOutput)
  * `security_score` (int)
  * `security_iterations` (int)
  * `final_code` (str)
  * **Accumulators** (using `operator.add` reducer):
    * `stage_events` (list[dict])
    * `score_history` (list[int])
    * `audit_trail` (list[dict])

---

## 2. Sandbox VM Execution (`tools/e2b_tool.py`)
Run code in isolated environments.

### Implementation Details
* Use factory `Sandbox.create()`.
* Write target code to `/home/user/index.js` inside VM.
* Run command: `node /home/user/index.js`.
* Parse exit code (exit code `0` = success).
* Wrap with `try/finally` block to call `sandbox.close()` to prevent memory leaks.
* Return payload: `{"success": bool, "stdout": str, "stderr": str}`.

---

## 3. Host Static Analysis (`tools/semgrep_tool.py`)
Run local host scans.

### Implementation Details
* Write code to local temp file (with `.js` extension).
* Run shell command: `backend/.venv/bin/semgrep scan --config=auto --json <tempfile_path>`.
* Parse JSON results to fetch findings.
* Cleanup temp file using `try/finally`.
* Normalize raw findings to match `SemgrepFinding` Pydantic schema (including parsing `cwe` and `owasp` from metadata).

---

## 4. Validation Plan
* **E2B Test**: Run simple console script (`console.log('test')`) to confirm VM connection.
* **Semgrep Test**: Scan snippet with vulnerability (e.g. `eval(x)`) to confirm scanner detection works.
