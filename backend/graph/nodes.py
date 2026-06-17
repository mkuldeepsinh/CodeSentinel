import os
import json
from typing import List, Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from graph.state import PipelineState, TriageOutput, SemgrepFinding
from tools.e2b_tool import execute_nodejs_in_sandbox
from tools.semgrep_tool import run_semgrep, normalize_finding

# Initialize LLM with Gemini 2.0 Flash
llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0)
structured_llm = llm.with_structured_output(TriageOutput)

def extract_code(text: str) -> str:
    """
    Strips markdown code block markers (like ```javascript or ```) from LLM outputs.
    """
    text = text.strip()
    if text.startswith("```"):
        # Find the end of the first line (e.g. ```javascript\n)
        first_line_end = text.find("\n")
        if first_line_end != -1:
            text = text[first_line_end:].strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    return text

def developer_agent(state: PipelineState) -> dict:
    """
    Writes Node.js code based on the user requirement.
    If execution fails, it uses stderr feedback to fix runtime errors.
    """
    retries = state.get("dev_retries", 0) + 1
    user_prompt = state["user_prompt"]
    current_code = state.get("current_code", "")
    execution_stderr = state.get("execution_stderr", "")
    
    if retries > 1 and execution_stderr:
        prompt = (
            f"The previous execution failed with the following error:\n"
            f"```\n{execution_stderr}\n```\n\n"
            f"Here is the code that failed:\n"
            f"```javascript\n{current_code}\n```\n\n"
            f"Please fix the bugs and provide the complete corrected Node.js code. "
            f"Return ONLY the code without explanations."
        )
    else:
        prompt = (
            f"Generate modern Node.js code that satisfies the following requirements:\n"
            f"```\n{user_prompt}\n```\n\n"
            f"Return ONLY the code without explanations."
        )
        
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert Node.js developer. Your goal is to write clean, "
                "syntactically valid, self-contained JavaScript code. "
                "Return ONLY the executable Node.js code inside or outside a markdown "
                "javascript block. Do not include explanation text."
            )
        },
        {"role": "user", "content": prompt}
    ]
    
    response = llm.invoke(messages)
    code = extract_code(response.content)
    
    event = {
        "node": "developer_agent",
        "message": f"Developer Agent generated code (attempt {retries})",
        "code_preview": code[:150] + "..." if len(code) > 150 else code
    }
    
    return {
        "current_code": code,
        "dev_retries": retries,
        "stage_events": [event]
    }

def e2b_execute(state: PipelineState) -> dict:
    """
    Executes the current code inside an E2B Sandbox microVM to test functionality.
    """
    code = state["current_code"]
    res = execute_nodejs_in_sandbox(code)
    
    event = {
        "node": "e2b_execute",
        "message": f"E2B sandbox execution completed. Success: {res['success']}",
        "stdout": res["stdout"],
        "stderr": res["stderr"]
    }
    
    return {
        "execution_stdout": res["stdout"],
        "execution_stderr": res["stderr"],
        "execution_success": res["success"],
        "stage_events": [event]
    }

def semgrep_scan(state: PipelineState) -> dict:
    """
    Runs local Semgrep static analysis scanning on the current code.
    """
    code = state["current_code"]
    raw_findings = run_semgrep(code)
    normalized = [normalize_finding(f) for f in raw_findings]
    
    event = {
        "node": "semgrep_scan",
        "message": f"Semgrep scan completed. Found {len(normalized)} issue(s).",
        "findings": normalized
    }
    
    return {
        "raw_semgrep_findings": normalized,
        "stage_events": [event]
    }

def triage_agent(state: PipelineState) -> dict:
    """
    Evaluates Semgrep findings to filter false positives and assign a security score.
    Returns structured TriageOutput.
    """
    code = state["current_code"]
    findings = state.get("raw_semgrep_findings", [])
    user_prompt = state["user_prompt"]
    
    findings_str = json.dumps(findings, indent=2)
    
    prompt = f"""You are a DevSecOps Triage Agent. Analyze the following Node.js code written to fulfill this requirement:
Requirement: {user_prompt}

Code:
```javascript
{code}
```

The automated Semgrep scanner found the following potential vulnerabilities:
{findings_str}

Evaluate the findings:
1. Filter out false positives. A finding is a false positive if it does not apply to the context of this script or represents a safe usage.
2. Select only real vulnerabilities that must be fixed.
3. Assign a security score from 0 (very insecure, critical bugs) to 100 (fully secure, no issues). If there are no real vulnerabilities, the score should be 100 and the verdict should be 'clean'.
4. Provide a detailed reasoning for your verdict.
"""
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are a professional security triage engineer. Analyze code and security scanner findings. "
                "Filter out false positives, assess real security risks, and decide on a verdict ('fix' or 'clean') "
                "and security score (0-100)."
            )
        },
        {"role": "user", "content": prompt}
    ]
    
    triage_output = structured_llm.invoke(messages)
    score = triage_output.security_score
    
    event = {
        "node": "triage_agent",
        "message": f"Triage verdict: {triage_output.verdict}. Security Score: {score}.",
        "reasoning": triage_output.reasoning,
        "score": score
    }
    
    # Record snapshot for the audit trail
    snapshot = {
        "iteration": state.get("security_iterations", 0),
        "code": code,
        "score": score,
        "findings": [f.model_dump() for f in triage_output.findings_to_fix]
    }
    
    return {
        "triage_output": triage_output,
        "security_score": score,
        "score_history": [score],
        "audit_trail": [snapshot],
        "stage_events": [event]
    }

def synthesizer_agent(state: PipelineState) -> dict:
    """
    Patches vulnerabilities reported by the Triage agent.
    """
    iterations = state.get("security_iterations", 0) + 1
    code = state["current_code"]
    triage = state["triage_output"]
    findings = triage.findings_to_fix if triage else []
    reasoning = triage.reasoning if triage else ""
    
    findings_str = json.dumps([f.model_dump() for f in findings], indent=2)
    
    prompt = f"""You are a security patch synthesizer agent. Your task is to secure the following Node.js code:
```javascript
{code}
```

The Triage Agent identified the following real security vulnerabilities that you must fix:
{findings_str}

Triage Agent Reasoning:
{reasoning}

Instructions:
1. Fix all identified vulnerabilities.
2. Ensure you DO NOT break the functionality or requirements of the original code.
3. Write clean, idiomatic Node.js.
4. Return ONLY the updated code inside a javascript code block or as raw code. No explanations.
"""

    messages = [
        {
            "role": "system",
            "content": (
                "You are a senior security patch engineer. Patch security vulnerabilities "
                "in Node.js code while strictly preserving functionality. Return ONLY the code."
            )
        },
        {"role": "user", "content": prompt}
    ]
    
    response = llm.invoke(messages)
    patched_code = extract_code(response.content)
    
    event = {
        "node": "synthesizer_agent",
        "message": f"Synthesizer patched vulnerabilities (iteration {iterations})",
        "code_preview": patched_code[:150] + "..." if len(patched_code) > 150 else patched_code
    }
    
    return {
        "current_code": patched_code,
        "security_iterations": iterations,
        "stage_events": [event]
    }

def e2b_verify(state: PipelineState) -> dict:
    """
    Executes patched code in E2B to confirm the fix didn't break functionality.
    """
    code = state["current_code"]
    res = execute_nodejs_in_sandbox(code)
    
    event = {
        "node": "e2b_verify",
        "message": f"Verification run: execution success is {res['success']}",
        "stdout": res["stdout"],
        "stderr": res["stderr"]
    }
    
    return {
        "execution_stdout": res["stdout"],
        "execution_stderr": res["stderr"],
        "execution_success": res["success"],
        "stage_events": [event]
    }

def finalize(state: PipelineState) -> dict:
    """
    Sets the final code and logs pipeline completion.
    """
    final_code = state["current_code"]
    
    event = {
        "node": "finalize",
        "message": "Pipeline completed successfully. Code is clean and functional."
    }
    
    return {
        "final_code": final_code,
        "stage_events": [event]
    }
