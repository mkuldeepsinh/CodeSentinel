from langgraph.graph import StateGraph, START, END
from graph.state import PipelineState
from graph.nodes import (
    developer_agent,
    sandbox_execute,
    semgrep_scan,
    triage_agent,
    synthesizer_agent,
    sandbox_verify,
    finalize
)
from graph.edges import (
    route_start,
    check_execution_success,
    check_triage_verdict,
    check_verify_result
)

def build_graph(checkpointer=None):
    """
    Constructs and compiles the CodeSentinel LangGraph workflow.
    """
    # Create the state graph using PipelineState
    workflow = StateGraph(PipelineState)
    
    # Register all nodes
    workflow.add_node("developer_agent",   developer_agent)
    workflow.add_node("sandbox_execute",    sandbox_execute)
    workflow.add_node("semgrep_scan",       semgrep_scan)
    workflow.add_node("triage_agent",       triage_agent)
    workflow.add_node("synthesizer_agent",  synthesizer_agent)
    workflow.add_node("sandbox_verify",     sandbox_verify)
    workflow.add_node("finalize",           finalize)
    
    # Entry point: conditional — skip developer_agent if user provided their own code
    workflow.add_conditional_edges(
        START,
        route_start,
        {
            "developer_agent": "developer_agent",
            "semgrep_scan":    "semgrep_scan"
        }
    )
    workflow.add_edge("developer_agent", "sandbox_execute")
    
    # Wire conditional edge after initial sandbox execution
    workflow.add_conditional_edges(
        "sandbox_execute",
        check_execution_success,
        {
            "developer_agent": "developer_agent",
            "semgrep_scan":    "semgrep_scan"
        }
    )
    
    # Semgrep scan moves to triage
    workflow.add_edge("semgrep_scan", "triage_agent")
    
    # Wire conditional edge after triage evaluation
    workflow.add_conditional_edges(
        "triage_agent",
        check_triage_verdict,
        {
            "finalize":          "finalize",
            "synthesizer_agent": "synthesizer_agent"
        }
    )
    
    # Synthesizer moves to Docker sandbox verification
    workflow.add_edge("synthesizer_agent", "sandbox_verify")
    
    # Wire conditional edge after verification
    workflow.add_conditional_edges(
        "sandbox_verify",
        check_verify_result,
        {
            "semgrep_scan":      "semgrep_scan",
            "synthesizer_agent": "synthesizer_agent",
            "finalize":          "finalize"
        }
    )
    
    # Finalize to END
    workflow.add_edge("finalize", END)
    
    # Compile and return graph
    return workflow.compile(checkpointer=checkpointer)
