import os
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from graph.graph import build_graph
from tracing import setup_tracing, get_run_metadata, get_run_tags

# Load environment variables first so tracing vars are available
load_dotenv()

# Setup request model
class GenerateRequest(BaseModel):
    prompt: str
    language: str = "javascript"

# Lifespan manager to compile the graph once at startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise LangSmith tracing (validates key, logs status)
    app.state.tracing_active = setup_tracing()
    # Compile graph once at startup
    app.state.graph = build_graph()
    yield

app = FastAPI(
    title="CodeSentinel Backend",
    description="Multi-agent DevSecOps pipeline orchestrator",
    version="1.0.0",
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
    return {
        "status": "ok",
        "graph_ready": graph_ready,
        "langsmith_tracing": tracing_active,
        "langsmith_project": os.environ.get("LANGCHAIN_PROJECT", "CodeSentinel"),
    }

async def event_generator(prompt: str, language: str):
    """
    Executes the compiled LangGraph and yields SSE events:
    node_start, node_end, done, error.
    Each run is tagged with LangSmith metadata for dashboard visibility.
    """
    initial_state = {
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

    # Build LangSmith run config — tags + metadata show up in the dashboard
    run_config = {
        "tags": get_run_tags(language),
        "metadata": get_run_metadata(prompt, language),
    }
    
    state_accumulator = dict(initial_state)

    try:
        # Stream events using LangGraph's astream_events API
        # run_config injects LangSmith tags + metadata into every trace
        async for event in app.state.graph.astream_events(initial_state, version="v2", config=run_config):
            event_type = event.get("event")
            name = event.get("name")
            data = event.get("data", {})
            
            # Filter for LangGraph node starts
            if event_type == "on_node_start":
                payload = {"node": name}
                yield f"event: node_start\ndata: {json.dumps(payload)}\n\n"
                # Give a small pause to allow client rendering and order consistency
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
                            # Serialize items inside list if they are Pydantic objects
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
    """
    if not hasattr(app.state, "graph") or app.state.graph is None:
        raise HTTPException(status_code=500, detail="State graph is not initialized.")
        
    return StreamingResponse(
        event_generator(request.prompt, request.language),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"}
    )

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    uvicorn.run("main:app", host=host, port=port, reload=True)
