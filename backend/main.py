import os
import json
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from graph.graph import build_graph
from tracing import setup_tracing, get_run_metadata, get_run_tags

# Database and embeddings imports
from database import (
    init_db,
    get_project,
    get_all_projects,
    get_project_generations,
    find_similar_generation,
    create_project
)
from embeddings import get_embedding

# Load environment variables first so tracing vars are available
load_dotenv()

# Setup request model
class GenerateRequest(BaseModel):
    project_id: Optional[str] = None
    prompt: Optional[str] = None
    language: str = "javascript"

# Lifespan manager to compile the graph once at startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise the memory database tables (Postgres or SQLite fallback)
    init_db()
    
    # Initialise LangSmith tracing (validates key, logs status)
    app.state.tracing_active = setup_tracing()
    
    # Initialise LangGraph checkpointer
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DATABASE_URL")
    if db_url:
        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            app.state.checkpointer_ctx = AsyncPostgresSaver.from_conn_string(db_url)
            app.state.checkpointer = await app.state.checkpointer_ctx.__aenter__()
            await app.state.checkpointer.setup()
            print("FastAPI Lifespan: Postgres checkpointer initialized successfully.")
        except Exception as e:
            print(f"FastAPI Lifespan WARNING: Failed to initialize Postgres checkpointer: {e}")
            from langgraph.checkpoint.memory import MemorySaver
            app.state.checkpointer = MemorySaver()
    else:
        from langgraph.checkpoint.memory import MemorySaver
        app.state.checkpointer = MemorySaver()
        print("FastAPI Lifespan: Using MemorySaver for state checkpointing.")

    # Compile graph once at startup with the checkpointer
    app.state.graph = build_graph(app.state.checkpointer)
    yield
    
    # Clean up checkpointer context
    if hasattr(app.state, "checkpointer_ctx"):
        await app.state.checkpointer_ctx.__aexit__(None, None, None)
        print("FastAPI Lifespan: Postgres checkpointer connection pool closed.")

app = FastAPI(
    title="CodeSentinel Backend",
    description="Multi-agent DevSecOps pipeline orchestrator with Dual-Layer Memory",
    version="1.1.0",
    lifespan=lifespan
)

# Enable CORS for cross-origin frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    """
    Health check endpoint returning state of application.
    """
    graph_ready = hasattr(app.state, "graph") and app.state.graph is not None
    tracing_active = getattr(app.state, "tracing_active", False)
    checkpointer_type = type(getattr(app.state, "checkpointer", None)).__name__
    return {
        "status": "ok",
        "graph_ready": graph_ready,
        "checkpointer": checkpointer_type,
        "langsmith_tracing": tracing_active,
        "langsmith_project": os.environ.get("LANGCHAIN_PROJECT", "CodeSentinel"),
    }

async def event_generator(prompt: str, language: str, project_id: str):
    """
    Executes the compiled LangGraph and yields SSE events:
    node_start, node_end, done, error.
    Each run is tagged with LangSmith metadata and configured with thread_id memory.
    """
    initial_state = {
        "project_id": project_id,
        "user_prompt": prompt,
        "language": language,
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

    # Build LangSmith run config with thread_id configuration for checkpointing
    run_config = {
        "tags": get_run_tags(language),
        "metadata": get_run_metadata(prompt, language),
        "configurable": {"thread_id": project_id}
    }
    
    state_accumulator = dict(initial_state)

    try:
        # Stream events using LangGraph's astream_events API
        async for event in app.state.graph.astream_events(initial_state, version="v2", config=run_config):
            event_type = event.get("event")
            name = event.get("name")
            data = event.get("data", {})
            
            # Filter for LangGraph node starts
            if event_type == "on_node_start":
                payload = {"node": name}
                yield f"event: node_start\ndata: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.1)
                
            # Filter for LangGraph node completions
            elif event_type == "on_node_end":
                output = data.get("output", {})
                
                # Normalize Pydantic models to dicts in output
                serialized_output = {}
                if isinstance(output, dict):
                    for k, v in output.items():
                        if hasattr(v, "model_dump"):
                            serialized_output[k] = v.model_dump()
                        elif isinstance(v, list):
                            serialized_output[k] = [
                                item.model_dump() if hasattr(item, "model_dump") else item 
                                for item in v
                            ]
                        else:
                            serialized_output[k] = v
                else:
                    serialized_output = output
                
                # Merge current node output updates into state_accumulator
                if isinstance(output, dict):
                    for k, v in output.items():
                        if k in ["stage_events", "score_history", "audit_trail"]:
                            val_list = v if isinstance(v, list) else [v]
                            serialized_list = [
                                item.model_dump() if hasattr(item, "model_dump") else item 
                                for item in val_list
                            ]
                            state_accumulator[k] = state_accumulator[k] + serialized_list
                        else:
                            if hasattr(v, "model_dump"):
                                state_accumulator[k] = v.model_dump()
                            else:
                                state_accumulator[k] = v
                
                payload = {"node": name, "output": serialized_output}
                yield f"event: node_end\ndata: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.1)
                
        # Emit final completed event containing state accumulator data
        yield f"event: done\ndata: {json.dumps(state_accumulator)}\n\n"
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        payload = {"message": f"Execution Error: {str(e)}"}
        yield f"event: error\ndata: {json.dumps(payload)}\n\n"

@app.post("/api/generate")
async def generate(request: GenerateRequest):
    """
    Submits user prompt to security pipeline and yields live Server-Sent Events (SSE).
    Performs prompt validation, project context retrieval, and semantic deduplication.
    """
    if not hasattr(app.state, "graph") or app.state.graph is None:
        raise HTTPException(status_code=500, detail="State graph is not initialized.")
        
    resolved_project_id = request.project_id
    resolved_prompt = request.prompt
    resolved_language = request.language
    
    # 1. If project_id is given but prompt is empty, load existing prompt from db
    if resolved_project_id and not resolved_prompt:
        project_data = get_project(resolved_project_id)
        if not project_data:
            raise HTTPException(status_code=404, detail="Project not found.")
        resolved_prompt = project_data["prompt"]
        resolved_language = project_data["language"]
        
    # 2. Semantic cache lookup: only for new runs (project_id is None)
    if not request.project_id and resolved_prompt:
        try:
            emb = get_embedding(resolved_prompt)
            similar = find_similar_generation(emb, threshold=0.95)
            if similar:
                print(f"main.py: Semantic cache hit! Similarity={similar['similarity']:.4f}")
                
                # Stream cached results as simulated SSE events
                async def cache_hit_generator():
                    # node_start
                    yield f"event: node_start\ndata: {json.dumps({'node': 'semantic_cache_hit'})}\n\n"
                    await asyncio.sleep(0.1)
                    
                    # node_end
                    output_payload = {
                        "final_code": similar["code"],
                        "security_score": similar["security_score"],
                        "triage_output": {
                            "verdict": "clean" if similar["security_score"] == 100 else "fix",
                            "security_score": similar["security_score"],
                            "findings_to_fix": similar["findings"],
                            "reasoning": "Retrieved from semantic cache hit of past identical run."
                        }
                    }
                    yield f"event: node_end\ndata: {json.dumps({'node': 'semantic_cache_hit', 'output': output_payload})}\n\n"
                    await asyncio.sleep(0.1)
                    
                    # done
                    done_state = {
                        "project_id": similar["project_id"],
                        "user_prompt": resolved_prompt,
                        "language": resolved_language,
                        "current_code": similar["code"],
                        "execution_stdout": "Cached run bypasses execution.",
                        "execution_stderr": "",
                        "execution_success": True,
                        "dev_retries": 0,
                        "raw_semgrep_findings": [],
                        "triage_output": output_payload["triage_output"],
                        "security_score": similar["security_score"],
                        "security_iterations": 0,
                        "final_code": similar["code"],
                        "stage_events": [{
                            "node": "semantic_cache_hit",
                            "message": f"Retrieved cached result (Similarity: {similar['similarity']:.4f})"
                        }],
                        "score_history": [similar["security_score"]],
                        "audit_trail": []
                    }
                    yield f"event: done\ndata: {json.dumps(done_state)}\n\n"
                    
                return StreamingResponse(
                    cache_hit_generator(),
                    media_type="text/event-stream",
                    headers={"X-Accel-Buffering": "no"}
                )
        except Exception as e:
            print(f"main.py WARNING: Semantic cache lookup failed: {e}")
            
    # Fallback to standard execution stream
    if not resolved_prompt:
        raise HTTPException(status_code=400, detail="Prompt must be supplied for new runs.")
        
    if not resolved_project_id:
        import uuid
        resolved_project_id = f"project_{str(uuid.uuid4())[:8]}"
        
    # Ensure project record exists/is updated
    try:
        create_project(
            project_id=resolved_project_id,
            name=f"Project {resolved_project_id[:8]}",
            prompt=resolved_prompt,
            language=resolved_language
        )
    except Exception as e:
        print(f"main.py WARNING: Failed to write initial project to database: {e}")
        
    return StreamingResponse(
        event_generator(resolved_prompt, resolved_language, resolved_project_id),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"}
    )

@app.get("/api/projects")
async def list_projects():
    """
    Retrieves all projects stored in long-term memory.
    """
    return get_all_projects()

@app.get("/api/projects/{project_id}")
async def retrieve_project(project_id: str):
    """
    Retrieves a single project by ID.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project

@app.get("/api/projects/{project_id}/generations")
async def project_history(project_id: str):
    """
    Retrieves all generations associated with a project.
    """
    generations = get_project_generations(project_id)
    return generations

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    uvicorn.run("main:app", host=host, port=port, reload=True)
