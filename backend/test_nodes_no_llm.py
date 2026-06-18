"""
test_nodes_no_llm.py
--------------------
Tests all nodes.py functionality WITHOUT making any real LLM or API calls.
Uses unittest.mock.patch to intercept get_llm() and external tool calls.

Run with:
    python test_nodes_no_llm.py
"""

import os
import sys
import warnings
import unittest
from unittest.mock import MagicMock, patch

# Ensure the backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# ─────────────────────────────────────────────
# SECTION 1 – Warning Suppression Check
# ─────────────────────────────────────────────
class TestWarningSuppression(unittest.TestCase):
    """Verify that importing nodes.py produces zero warnings."""

    def test_no_warnings_on_import(self):
        """nodes.py must not leak any warnings when imported."""
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            import graph.nodes  # noqa: F401 (already imported, re-triggers filters)
        self.assertEqual(
            len(caught), 0,
            f"Expected 0 warnings, got {len(caught)}: {[str(w.message) for w in caught]}"
        )


# ─────────────────────────────────────────────
# SECTION 2 – extract_code() utility
# ─────────────────────────────────────────────
from graph.nodes import extract_code

class TestExtractCode(unittest.TestCase):
    """Unit tests for the extract_code() helper."""

    def test_plain_code_unchanged(self):
        code = "console.log('hello');"
        self.assertEqual(extract_code(code), code)

    def test_strips_backtick_block_with_language(self):
        raw = "```javascript\nconsole.log('hello');\n```"
        self.assertEqual(extract_code(raw), "console.log('hello');")

    def test_strips_backtick_block_no_language(self):
        raw = "```\nconsole.log('hello');\n```"
        self.assertEqual(extract_code(raw), "console.log('hello');")

    def test_strips_python_block(self):
        raw = "```python\nprint('hello')\n```"
        self.assertEqual(extract_code(raw), "print('hello')")

    def test_handles_whitespace(self):
        raw = "  ```js\nlet x = 1;\n```  "
        self.assertEqual(extract_code(raw), "let x = 1;")

    def test_multiline_code(self):
        raw = "```js\nfunction add(a, b) {\n  return a + b;\n}\n```"
        result = extract_code(raw)
        self.assertIn("function add", result)
        self.assertNotIn("```", result)

    def test_empty_string(self):
        self.assertEqual(extract_code(""), "")

    def test_code_without_closing_fence(self):
        """Code block with no closing ``` — should still strip opening."""
        raw = "```js\nlet x = 1;"
        result = extract_code(raw)
        self.assertNotIn("```js", result)


# ─────────────────────────────────────────────
# SECTION 3 – State model validation
# ─────────────────────────────────────────────
from graph.state import SemgrepFinding, TriageOutput

class TestStateModels(unittest.TestCase):
    """Verify Pydantic state models instantiate and serialize correctly."""

    def test_semgrep_finding_valid(self):
        f = SemgrepFinding(
            check_id="javascript.eval.eval-call",
            message="Dangerous eval usage",
            severity="ERROR",
            line=10,
            cwe=["CWE-94"],
            owasp=["A03:2021"]
        )
        self.assertEqual(f.severity, "ERROR")
        d = f.model_dump()
        self.assertIn("check_id", d)

    def test_triage_output_clean(self):
        t = TriageOutput(
            verdict="clean",
            security_score=100,
            findings_to_fix=[],
            reasoning="No issues found."
        )
        self.assertEqual(t.verdict, "clean")
        self.assertEqual(t.security_score, 100)

    def test_triage_output_fix(self):
        finding = SemgrepFinding(
            check_id="js.eval", message="eval usage", severity="ERROR", line=5
        )
        t = TriageOutput(
            verdict="fix",
            security_score=40,
            findings_to_fix=[finding],
            reasoning="Dangerous eval detected."
        )
        self.assertEqual(len(t.findings_to_fix), 1)
        self.assertEqual(t.findings_to_fix[0].check_id, "js.eval")


# ─────────────────────────────────────────────
# SECTION 4 – Node functions (mocked LLM + tools)
# ─────────────────────────────────────────────
from graph.nodes import (
    developer_agent, e2b_execute, semgrep_scan,
    triage_agent, synthesizer_agent, e2b_verify, finalize
)

def _make_mock_llm(response_content: str) -> MagicMock:
    """Returns a MagicMock LLM whose .invoke() returns a response with .content."""
    mock_llm = MagicMock()
    mock_resp = MagicMock()
    mock_resp.content = response_content
    mock_llm.invoke.return_value = mock_resp
    return mock_llm

def _make_mock_structured_llm(triage_output: TriageOutput) -> MagicMock:
    """Returns a MagicMock structured LLM whose .invoke() returns a TriageOutput."""
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = MagicMock(
        invoke=MagicMock(return_value=triage_output)
    )
    return mock_llm

def _base_state(**overrides) -> dict:
    """Returns a minimal valid PipelineState dict."""
    state = {
        "user_prompt": "Write a hello world script",
        "language": "javascript",
        "current_code": "console.log('Hello, World!');",
        "execution_stdout": "",
        "execution_stderr": "",
        "execution_success": False,
        "dev_retries": 0,
        "raw_semgrep_findings": [],
        "triage_output": None,
        "security_score": 0,
        "security_iterations": 0,
        "final_code": "",
        "stage_events": [],
        "score_history": [],
        "audit_trail": [],
    }
    state.update(overrides)
    return state


class TestDeveloperAgentNode(unittest.TestCase):

    @patch("graph.nodes.get_llm")
    def test_first_attempt_generates_code(self, mock_get_llm):
        mock_get_llm.return_value = _make_mock_llm("```javascript\nconsole.log('Hi');\n```")
        state = _base_state()
        result = developer_agent(state)

        self.assertEqual(result["current_code"], '{"files": {"index.js": "console.log(\'Hi\');"}}')
        self.assertEqual(result["dev_retries"], 1)
        self.assertEqual(len(result["stage_events"]), 1)
        self.assertEqual(result["stage_events"][0]["node"], "developer_agent")

    @patch("graph.nodes.get_llm")
    def test_retry_uses_stderr_in_prompt(self, mock_get_llm):
        """On retry (dev_retries>0 + stderr), developer prompt must reference error."""
        captured_prompts = []

        def capture_invoke(messages):
            captured_prompts.append(messages)
            resp = MagicMock()
            resp.content = "console.log('Fixed!');"
            return resp

        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = capture_invoke
        mock_get_llm.return_value = mock_llm

        state = _base_state(
            dev_retries=1,
            execution_stderr="ReferenceError: x is not defined",
            current_code="console.log(x);"
        )
        result = developer_agent(state)

        self.assertEqual(result["dev_retries"], 2)
        # The user-role message should reference the error
        user_msg = captured_prompts[0][1]["content"]
        self.assertIn("ReferenceError", user_msg)

    @patch("graph.nodes.get_llm")
    def test_stage_event_has_code_preview(self, mock_get_llm):
        long_code = "x" * 200
        mock_get_llm.return_value = _make_mock_llm(long_code)
        result = developer_agent(_base_state())
        preview = result["stage_events"][0]["code_preview"]
        self.assertTrue(preview.endswith("..."), "Long code preview should end with '...'")


class TestE2BExecuteNode(unittest.TestCase):

    @patch("graph.nodes.execute_in_sandbox")
    def test_success_result(self, mock_sandbox):
        mock_sandbox.return_value = {
            "success": True,
            "stdout": "Hello, World!\n",
            "stderr": ""
        }
        result = e2b_execute(_base_state())

        self.assertTrue(result["execution_success"])
        self.assertEqual(result["execution_stdout"], "Hello, World!\n")
        self.assertEqual(result["execution_stderr"], "")
        self.assertEqual(result["stage_events"][0]["node"], "e2b_execute")

    @patch("graph.nodes.execute_in_sandbox")
    def test_failure_result(self, mock_sandbox):
        mock_sandbox.return_value = {
            "success": False,
            "stdout": "",
            "stderr": "SyntaxError: Unexpected token"
        }
        result = e2b_execute(_base_state())

        self.assertFalse(result["execution_success"])
        self.assertIn("SyntaxError", result["execution_stderr"])


class TestSemgrepScanNode(unittest.TestCase):

    @patch("graph.nodes.normalize_finding")
    @patch("graph.nodes.run_semgrep")
    def test_returns_normalized_findings(self, mock_run, mock_norm):
        raw = [{"check_id": "eval-call", "extra": {"message": "bad", "severity": "ERROR"}, "start": {"line": 1}}]
        normalized = {
            "check_id": "eval-call",
            "message": "bad",
            "severity": "ERROR",
            "line": 1,
            "cwe": [],
            "owasp": []
        }
        mock_run.return_value = raw
        mock_norm.return_value = normalized

        result = semgrep_scan(_base_state())

        self.assertEqual(len(result["raw_semgrep_findings"]), 1)
        self.assertEqual(result["raw_semgrep_findings"][0]["check_id"], "eval-call")
        self.assertEqual(result["stage_events"][0]["node"], "semgrep_scan")

    @patch("graph.nodes.normalize_finding")
    @patch("graph.nodes.run_semgrep")
    def test_no_findings(self, mock_run, mock_norm):
        mock_run.return_value = []
        result = semgrep_scan(_base_state())
        self.assertEqual(result["raw_semgrep_findings"], [])


class TestTriageAgentNode(unittest.TestCase):

    @patch("graph.nodes.get_llm")
    def test_clean_verdict(self, mock_get_llm):
        triage = TriageOutput(
            verdict="clean", security_score=95,
            findings_to_fix=[], reasoning="Code looks secure."
        )
        mock_get_llm.return_value = _make_mock_structured_llm(triage)

        result = triage_agent(_base_state())

        self.assertEqual(result["triage_output"].verdict, "clean")
        self.assertEqual(result["security_score"], 95)
        self.assertEqual(len(result["score_history"]), 1)
        self.assertEqual(len(result["audit_trail"]), 1)
        self.assertEqual(result["stage_events"][0]["node"], "triage_agent")

    @patch("graph.nodes.get_llm")
    def test_fix_verdict_with_findings(self, mock_get_llm):
        finding = SemgrepFinding(
            check_id="js.eval", message="Eval is dangerous",
            severity="ERROR", line=3
        )
        triage = TriageOutput(
            verdict="fix", security_score=30,
            findings_to_fix=[finding], reasoning="Found eval usage."
        )
        mock_get_llm.return_value = _make_mock_structured_llm(triage)

        result = triage_agent(_base_state())

        self.assertEqual(result["triage_output"].verdict, "fix")
        self.assertEqual(result["security_score"], 30)
        self.assertEqual(len(result["audit_trail"][0]["findings"]), 1)

    @patch("graph.nodes.get_llm")
    def test_audit_trail_snapshot_structure(self, mock_get_llm):
        triage = TriageOutput(
            verdict="clean", security_score=100,
            findings_to_fix=[], reasoning="All good."
        )
        mock_get_llm.return_value = _make_mock_structured_llm(triage)

        state = _base_state(security_iterations=2)
        result = triage_agent(state)

        snapshot = result["audit_trail"][0]
        self.assertIn("iteration", snapshot)
        self.assertIn("code", snapshot)
        self.assertIn("score", snapshot)
        self.assertIn("findings", snapshot)
        self.assertEqual(snapshot["iteration"], 2)


class TestSynthesizerAgentNode(unittest.TestCase):

    @patch("graph.nodes.get_llm")
    def test_patches_vulnerabilities(self, mock_get_llm):
        patched = "// Safe version\nconst x = sanitize(input);"
        mock_get_llm.return_value = _make_mock_llm(f"```javascript\n{patched}\n```")

        finding = SemgrepFinding(
            check_id="js.eval", message="eval usage", severity="ERROR", line=1
        )
        triage = TriageOutput(
            verdict="fix", security_score=20,
            findings_to_fix=[finding], reasoning="eval is dangerous"
        )
        state = _base_state(triage_output=triage)
        result = synthesizer_agent(state)

        self.assertEqual(result["current_code"], '{"files": {"index.js": "// Safe version\\nconst x = sanitize(input);"}}')
        self.assertEqual(result["security_iterations"], 1)
        self.assertEqual(result["stage_events"][0]["node"], "synthesizer_agent")

    @patch("graph.nodes.get_llm")
    def test_increments_security_iterations(self, mock_get_llm):
        mock_get_llm.return_value = _make_mock_llm("const x = 1;")

        finding = SemgrepFinding(
            check_id="js.eval", message="eval", severity="ERROR", line=1
        )
        triage = TriageOutput(
            verdict="fix", security_score=20,
            findings_to_fix=[finding], reasoning="fix it"
        )
        state = _base_state(triage_output=triage, security_iterations=1)
        result = synthesizer_agent(state)

        self.assertEqual(result["security_iterations"], 2)


class TestE2BVerifyNode(unittest.TestCase):

    @patch("graph.nodes.execute_in_sandbox")
    def test_verify_success(self, mock_sandbox):
        mock_sandbox.return_value = {
            "success": True, "stdout": "Done\n", "stderr": ""
        }
        result = e2b_verify(_base_state())

        self.assertTrue(result["execution_success"])
        self.assertEqual(result["stage_events"][0]["node"], "e2b_verify")

    @patch("graph.nodes.execute_in_sandbox")
    def test_verify_failure(self, mock_sandbox):
        mock_sandbox.return_value = {
            "success": False, "stdout": "", "stderr": "Error!"
        }
        result = e2b_verify(_base_state())

        self.assertFalse(result["execution_success"])


class TestFinalizeNode(unittest.TestCase):

    def test_sets_final_code(self):
        state = _base_state(current_code="const answer = 42;")
        result = finalize(state)

        self.assertEqual(result["final_code"], "const answer = 42;")
        self.assertEqual(result["stage_events"][0]["node"], "finalize")
        self.assertIn("Pipeline completed", result["stage_events"][0]["message"])

    def test_final_code_matches_current(self):
        code = "function greet(name) { return 'Hello ' + name; }"
        result = finalize(_base_state(current_code=code))
        self.assertEqual(result["final_code"], code)


# ─────────────────────────────────────────────
# SECTION 5 – Graph Compilation
# ─────────────────────────────────────────────
class TestGraphCompilation(unittest.TestCase):
    """Verify LangGraph compiles without errors."""

    def test_build_graph_succeeds(self):
        from graph.graph import build_graph
        graph = build_graph()
        self.assertIsNotNone(graph)

    def test_graph_has_expected_nodes(self):
        from graph.graph import build_graph
        graph = build_graph()
        # LangGraph compiled graph exposes nodes via get_graph()
        node_names = set(graph.get_graph().nodes.keys())
        expected = {
            "developer_agent", "e2b_execute", "semgrep_scan",
            "triage_agent", "synthesizer_agent", "e2b_verify", "finalize"
        }
        for node in expected:
            self.assertIn(node, node_names, f"Node '{node}' missing from compiled graph")


# ─────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  CodeSentinel — No-LLM Node Test Suite")
    print("  (All LLM/API calls are mocked — no real calls made)")
    print("=" * 60)
    unittest.main(verbosity=2)
