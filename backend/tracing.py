"""
tracing.py
----------
LangSmith tracing setup for the CodeSentinel pipeline.

LangChain/LangGraph auto-traces all LLM calls when:
  LANGCHAIN_TRACING_V2=true
  LANGCHAIN_API_KEY=<your key>
  LANGCHAIN_PROJECT=CodeSentinel

This module provides:
  - setup_tracing()     — call once at app startup to validate & log tracing state
  - get_run_metadata()  — returns a metadata dict to tag pipeline runs
  - trace_node          — @traceable decorator wrapper for per-node span labeling
"""

import os
import logging

logger = logging.getLogger("codesentinel.tracing")


def setup_tracing() -> bool:
    """
    Validates LangSmith configuration and logs the tracing state.
    Returns True if tracing is active, False if disabled/unconfigured.

    Call this once at application startup (e.g. in FastAPI lifespan).
    """
    tracing_enabled = os.environ.get("LANGCHAIN_TRACING_V2", "false").lower() == "true"
    api_key = os.environ.get("LANGCHAIN_API_KEY", "")
    project = os.environ.get("LANGCHAIN_PROJECT", "CodeSentinel")

    if not tracing_enabled:
        logger.info("LangSmith tracing is DISABLED. Set LANGCHAIN_TRACING_V2=true to enable.")
        return False

    if not api_key:
        logger.warning(
            "LANGCHAIN_TRACING_V2=true but LANGCHAIN_API_KEY is not set. "
            "Tracing will be silently skipped. Get your key at: https://smith.langchain.com/settings"
        )
        return False

    # Validate the client can connect
    try:
        from langsmith import Client
        client = Client(api_key=api_key)
        # Lightweight check — list projects (does not mutate state)
        _ = list(client.list_projects())
        logger.info(
            f"✅ LangSmith tracing ACTIVE | Project: '{project}' | "
            f"Dashboard: https://smith.langchain.com/projects"
        )
        return True
    except Exception as e:
        logger.warning(
            f"LangSmith connection check failed: {e}. "
            "Tracing will be attempted but may silently fail."
        )
        return False


def get_run_metadata(prompt: str, language: str) -> dict:
    """
    Returns a metadata dict to attach to each pipeline run.
    Passed as 'metadata' kwarg to graph.ainvoke() or graph.astream_events()
    so every run is tagged in the LangSmith dashboard.
    """
    return {
        "project": os.environ.get("LANGCHAIN_PROJECT", "CodeSentinel"),
        "language": language,
        "prompt_preview": prompt[:120] + ("..." if len(prompt) > 120 else ""),
        "developer_model": os.environ.get("DEVELOPER_MODEL", "gemini-2.5-flash-lite"),
        "triage_model": os.environ.get("TRIAGE_MODEL", "gemini-2.5-flash"),
        "synthesizer_model": os.environ.get("SYNTHESIZER_MODEL", "gemini-2.5-flash"),
    }


def get_run_tags(language: str) -> list:
    """
    Returns a list of tags for a pipeline run.
    Tags appear in the LangSmith run list for quick filtering.
    """
    return [
        "codesentinel",
        f"lang:{language}",
        f"dev:{os.environ.get('DEVELOPER_MODEL', 'unknown')}",
        f"triage:{os.environ.get('TRIAGE_MODEL', 'unknown')}",
        f"synthesizer:{os.environ.get('SYNTHESIZER_MODEL', 'unknown')}",
    ]
