import os
import sys
import asyncio
from dotenv import load_dotenv

# Ensure import paths resolve correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from graph.graph import build_graph

async def main():
    load_dotenv()
    
    if not os.environ.get("GOOGLE_API_KEY"):
        print("Error: GOOGLE_API_KEY not set in environment.")
        sys.exit(1)
        
    prompt = "Write a Python script that sorts an array of numbers [5, 3, 8, 1, 2] and prints it."
    
    initial_state = {
        "user_prompt": prompt,
        "language": "python",
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
    print("STARTING REAL CODESENTINEL PIPELINE RUN")
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
    print("REAL PIPELINE RUN COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
