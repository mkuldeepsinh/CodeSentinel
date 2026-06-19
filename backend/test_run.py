import os
import sys
import asyncio
from unittest.mock import MagicMock
from dotenv import load_dotenv, find_dotenv

# Ensure import paths resolve correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from graph.state import PipelineState, TriageOutput, SemgrepFinding

# Setup mock LLMs to prevent hitting daily free tier API limits
class MockResponse:
    def __init__(self, content):
        self.content = content

mock_code = """
def sort_array(arr):
    # Simple sorting algorithm
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr

numbers = [5, 3, 8, 1, 2]
print("Sorted array:", sort_array(numbers))
"""

mock_llm = MagicMock()
mock_llm.invoke.return_value = MockResponse(f"```python\n{mock_code}\n```")

mock_structured_llm = MagicMock()
mock_structured_llm.invoke.return_value = TriageOutput(
    verdict="clean",
    security_score=100,
    findings_to_fix=[],
    reasoning="Mock analysis: Python sorting logic contains no security vulnerabilities."
)

# Apply mocks to graph.nodes module before importing other components
import graph.nodes

# Override the factory function itself so it doesn't build real Gemini/OpenAI objects
def mock_get_llm(model_env_var, default_model):
    if "TRIAGE" in model_env_var:
        return mock_structured_llm
    return mock_llm

graph.nodes.get_llm = mock_get_llm

from graph.graph import build_graph

async def main():
    load_dotenv(find_dotenv())
    
    prompt = "Write a Python script that sorts an array of numbers [5, 3, 8, 1, 2] and prints it."
    
    initial_state = {
        "user_prompt": prompt,
        "language": "python", # Set language to Python
        "current_code": "",
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
        "audit_trail": []
    }
    
    # Build the state machine
    graph = build_graph()
    
    print("=" * 60)
    print("STARTING CODESENTINEL PIPELINE RUN")
    print(f"Target Language: Python")
    print(f"Prompt: {prompt}")
    print("=" * 60)
    
    # Run graph and print state transitions
    async for event in graph.astream(initial_state):
        for node_name, state_update in event.items():
            print(f"\n[Node Transition: {node_name}]")
            print("-" * 40)
            
            for key, val in state_update.items():
                if key == "current_code":
                    print(f"-> current_code:\n{val}")
                elif key == "stage_events":
                    print(f"-> stage_events (new event): {val[-1] if val else []}")
                elif key == "execution_stdout" and val:
                    print(f"-> execution_stdout: {repr(val)}")
                elif key == "execution_stderr" and val:
                    print(f"-> execution_stderr: {repr(val)}")
                elif key == "execution_success":
                    print(f"-> execution_success: {val}")
                elif key == "security_score":
                    print(f"-> security_score: {val}")
                elif key == "triage_output" and val:
                    print(f"-> triage verdict: {val.verdict}")
                    print(f"-> triage reasoning: {val.reasoning}")
            print("-" * 40)
            
    print("\n" + "=" * 60)
    print("PIPELINE RUN COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
