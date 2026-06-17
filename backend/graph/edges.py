import os
from graph.state import PipelineState

def check_execution_success(state: PipelineState) -> str:
    """
    Decides whether to retry code generation (on runtime error) or move to scanning.
    """
    success = state.get("execution_success", False)
    retries = state.get("dev_retries", 0)
    max_retries = int(os.environ.get("MAX_DEV_RETRIES", 3))
    
    if not success and retries < max_retries:
        return "developer_agent"
    return "semgrep_scan"

def check_triage_verdict(state: PipelineState) -> str:
    """
    Decides whether to fix vulnerabilities or finalize the pipeline.
    """
    triage = state.get("triage_output")
    iterations = state.get("security_iterations", 0)
    max_iterations = int(os.environ.get("MAX_SEC_ITERATIONS", 3))
    
    # Clean code or reached max security iterations -> finalize
    if (triage and triage.verdict == "clean") or iterations >= max_iterations:
        return "finalize"
    
    # Otherwise, patch vulnerabilities
    return "synthesizer_agent"

def check_verify_result(state: PipelineState) -> str:
    """
    Decides whether to re-scan the patched code or try synthesizing again if execution broke.
    """
    success = state.get("execution_success", False)
    iterations = state.get("security_iterations", 0)
    max_iterations = int(os.environ.get("MAX_SEC_ITERATIONS", 3))
    
    if success:
        return "semgrep_scan"
        
    if iterations < max_iterations:
        return "synthesizer_agent"
        
    return "finalize"
