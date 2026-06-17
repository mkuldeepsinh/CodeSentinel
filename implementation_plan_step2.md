# CodeSentinel Step 2 (Core Logic) Implementation Plan

Plan for building the agents, task nodes, and routing edges.

---

## 1. Node Implementation (`graph/nodes.py`)
Implement node functions that mutate state. All LLM agents will use `gemini-2.0-flash` with temperature `0`.

### Nodes
* **`developer_agent`**:
  * Input: `user_prompt`, `language`, `dev_retries`, `execution_stderr`, `current_code`.
  * Logic: Generates Node.js code. If `dev_retries > 0` and error exists, instructs LLM to fix the bug. Strips markdown block wrappers using helper.
* **`e2b_execute`**:
  * Input: `current_code`.
  * Logic: Calls `execute_nodejs_in_sandbox()`. Stores `stdout`, `stderr`, and `success`.
* **`semgrep_scan`**:
  * Input: `current_code`.
  * Logic: Calls `run_semgrep()`. Normalizes and stores findings.
* **`triage_agent`**:
  * Input: `user_prompt`, `current_code`, `raw_semgrep_findings`.
  * Logic: Uses `llm.with_structured_output(TriageOutput)`. Evaluates findings, filters false positives, assigns security score, appends snapshot to `audit_trail`.
* **`synthesizer_agent`**:
  * Input: `current_code`, `triage_output`.
  * Logic: Patches vulnerabilities using LLM instructions. Preserves functionality.
* **`e2b_verify`**:
  * Input: `current_code`.
  * Logic: Re-runs patched code to check for regressions.
* **`finalize`**:
  * Input: `current_code`.
  * Logic: Assigns final secure code, emits pipeline done logs.

---

## 2. Edge Routing (`graph/edges.py`)
Define conditional routers between nodes.

### Routers
* **`check_execution_success`**:
  * `execution_success == False` and `dev_retries < MAX_DEV_RETRIES` (3) → retry `developer_agent`.
  * Otherwise → `semgrep_scan`.
* **`check_triage_verdict`**:
  * Verdict is `clean` or `security_iterations >= MAX_SEC_ITERATIONS` (3) → `finalize`.
  * Otherwise → `synthesizer_agent`.
* **`check_verify_result`**:
  * Patched code runs successfully (`execution_success == True`) → `semgrep_scan` (re-audit).
  * Runs broke and `security_iterations < MAX_SEC_ITERATIONS` → retry `synthesizer_agent`.
  * Otherwise → `finalize`.

---

## 3. Validation Plan
* Create [backend/test_step2.py](file:///Users/kuldeepsinh/Desktop/CodeSentinel/backend/test_step2.py).
* Test LLM connection with Gemini using a dummy question.
* Test structured output parsing using a mock prompt.
* Test individual nodes in isolation (e.g. run `developer_agent` node directly with state, assert code generated).
