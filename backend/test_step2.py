import os
import sys
from unittest.mock import MagicMock

# Ensure import paths resolve correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import state and Pydantic models
from graph.state import PipelineState, TriageOutput, SemgrepFinding

# Before importing nodes, prepare mock LLM structures so we don't hit Gemini API rate limits
class MockResponse:
    def __init__(self, content):
        self.content = content

mock_llm = MagicMock()
mock_llm.invoke.return_value = MockResponse("```javascript\nconsole.log('Mocked generated code!');\n```")

mock_structured_llm = MagicMock()
mock_structured_llm.invoke.return_value = TriageOutput(
    verdict="clean",
    security_score=100,
    findings_to_fix=[],
    reasoning="Mocked secure analysis. No issues found."
)

mock_llm.with_structured_output.return_value = mock_structured_llm

# Mock get_llm to return our mocked llm instance
def mock_get_llm(model_env_var: str, default_model: str):
    return mock_llm

# Apply mocks to graph.nodes module
import graph.nodes
graph.nodes.get_llm = mock_get_llm
graph.nodes.llm = mock_llm
graph.nodes.structured_llm = mock_structured_llm

# Import nodes to test
from graph.nodes import developer_agent, triage_agent

def test_llm_connection():
    print("Testing basic LLM connection (Mocked)...")
    res = graph.nodes.llm.invoke("Say hello in one word.")
    print("LLM Response:", res.content.strip())
    assert len(res.content.strip()) > 0
    print("LLM connection test passed!")

def test_structured_output():
    print("Testing structured LLM output (TriageOutput - Mocked)...")
    test_state = {
        "user_prompt": "Create a secure random token generator in Node.js",
        "current_code": "const crypto = require('crypto');\nfunction gen() { return crypto.randomBytes(32).toString('hex'); }\nconsole.log(gen());",
        "raw_semgrep_findings": []
    }
    
    # Run triage node
    res = triage_agent(test_state)
    print("Triage verdict:", res["triage_output"].verdict)
    print("Triage score:", res["triage_output"].security_score)
    print("Triage reasoning:", res["triage_output"].reasoning)
    print("Triage event log added:", res["stage_events"])
    print("Triage audit snapshot added:", res["audit_trail"])
    
    assert res["triage_output"].verdict == "clean"
    assert res["triage_output"].security_score == 100
    print("Structured output test passed!")

def test_developer_node():
    print("Testing Developer Agent node (Mocked)...")
    test_state = {
        "user_prompt": "Write a Node.js console app that prints the current date and time",
        "language": "javascript"
    }
    
    res = developer_agent(test_state)
    print("Generated code:\n", res["current_code"])
    print("Developer event log added:", res["stage_events"])
    assert len(res["current_code"]) > 0
    print("Developer Agent node test passed!")

if __name__ == "__main__":
    try:
        test_llm_connection()
        print("-" * 40)
        test_developer_node()
        print("-" * 40)
        test_structured_output()
        print("-" * 40)
        print("All Step 2 node tests passed successfully (offline mock mode)!")
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
