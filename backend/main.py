import os
import json
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
from dotenv import load_dotenv, find_dotenv

from graph.graph import build_graph
from tracing import setup_tracing, get_run_metadata, get_run_tags

# Database and embeddings imports
from database import (
    init_db,
    get_project,
    get_all_projects,
    get_project_generations,
    find_similar_generation,
    create_project,
    create_generation,
    delete_project,
    rename_project,
    create_user,
    get_user_by_email
)
from embeddings import get_embedding

# Load environment variables first so tracing vars are available
load_dotenv(find_dotenv())

# Auth security scheme
security_scheme = HTTPBearer(auto_error=False)

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication token required")
    token = credentials.credentials
    from auth import decode_access_token
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")
    return payload

# Setup Auth Request models
class SignupRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class SSORequest(BaseModel):
    email: str
    provider: str
    name: Optional[str] = ""

# Setup request model
class GenerateRequest(BaseModel):
    project_id: Optional[str] = None
    prompt: Optional[str] = None
    language: str = "javascript"
    code: Optional[str] = None  # user-provided code to analyse (skips developer_agent)
    skip_developer: Optional[bool] = None

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

@app.post("/api/auth/signup")
async def auth_signup(request: SignupRequest):
    email = request.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email format.")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    
    existing = get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
        
    from auth import hash_password, create_access_token
    import uuid
    
    hashed = hash_password(request.password)
    user_id = f"user_{str(uuid.uuid4())[:8]}"
    try:
        user = create_user(user_id=user_id, email=email, hashed_password=hashed, provider="email")
        token = create_access_token({"sub": user["id"], "email": user["email"]})
        return {
            "token": token,
            "user": {
                "id": user["id"],
                "email": user["email"],
                "provider": user["provider"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/login")
async def auth_login(request: LoginRequest):
    email = request.email.strip().lower()
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if user["provider"] != "email":
        raise HTTPException(status_code=400, detail=f"Please sign in using {user['provider'].capitalize()} instead.")
        
    from auth import verify_password, create_access_token
    if not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
        
    token = create_access_token({"sub": user["id"], "email": user["email"]})
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "provider": user["provider"]
        }
    }

@app.post("/api/auth/sso")
async def auth_sso(request: SSORequest):
    email = request.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email format.")
    if request.provider not in ("google", "github"):
        raise HTTPException(status_code=400, detail="Invalid SSO provider.")
        
    user = get_user_by_email(email)
    from auth import create_access_token
    
    if not user:
        import uuid
        user_id = f"user_{str(uuid.uuid4())[:8]}"
        user = create_user(user_id=user_id, email=email, hashed_password=None, provider=request.provider)
    elif user["provider"] != request.provider:
        raise HTTPException(
            status_code=400,
            detail=f"This email is already registered via {user['provider'].capitalize()}. Please use that option."
        )
        
    token = create_access_token({"sub": user["id"], "email": user["email"]})
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "provider": user["provider"]
        }
    }

async def event_generator(prompt: str, language: str, project_id: str, code: str = "", skip_developer: Optional[bool] = None):
    """
    Executes the compiled LangGraph and yields SSE events.
    When `code` is provided the developer_agent is skipped and the pipeline
    starts directly at semgrep_scan (security-only mode).
    """
    user_provided_code = bool(code and code.strip())
    should_skip = skip_developer if skip_developer is not None else user_provided_code
    
    initial_state = {
        "project_id": project_id,
        "user_prompt": prompt,
        "language": language,
        "current_code": code if user_provided_code else "",
        "skip_developer": should_skip,
        "execution_stdout": "",
        "execution_stderr": "",
        # Mark execution as successful so check_execution_success skips to semgrep_scan
        # when the user provides their own code (they are responsible for it running).
        "execution_success": should_skip,
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
    
    # final_state accumulates node outputs to build the authoritative done payload
    final_state = dict(initial_state)

    def _serialize(v):
        """Serialize Pydantic models / lists of models to plain dicts."""
        if hasattr(v, "model_dump"):
            return v.model_dump()
        if isinstance(v, list):
            return [x.model_dump() if hasattr(x, "model_dump") else x for x in v]
        return v

    ADDITIVE_KEYS = ("stage_events", "score_history", "audit_trail")

    try:
        # astream(stream_mode="updates") yields {node_name: node_output_dict} per step.
        # This is more reliable than astream_events because it does not depend on
        # LangGraph internal event-type strings (on_chain_start vs on_node_start etc.)
        async for chunk in app.state.graph.astream(
            initial_state,
            config=run_config,
            stream_mode="updates",
        ):
            for node_name, node_output in chunk.items():
                if not isinstance(node_output, dict):
                    continue  # skip non-dict outputs (e.g. interrupt signals)

                # ── node_start ───────────────────────────────────────────────
                yield f"event: node_start\ndata: {json.dumps({'node': node_name})}\n\n"
                await asyncio.sleep(0.05)

                # Serialize output (Pydantic models → plain dicts)
                serialized_output = {k: _serialize(v) for k, v in node_output.items()}

                # Accumulate into final_state
                for k, v in node_output.items():
                    if k in ADDITIVE_KEYS:
                        items = v if isinstance(v, list) else [v]
                        ser   = [x.model_dump() if hasattr(x, "model_dump") else x for x in items]
                        final_state[k] = final_state.get(k, []) + ser
                    else:
                        final_state[k] = _serialize(v)

                # ── node_end ─────────────────────────────────────────────────
                payload = {"node": node_name, "output": serialized_output}
                yield f"event: node_end\ndata: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.05)

        # ── done ─────────────────────────────────────────────────────────────
        # final_state now contains the fully-accumulated pipeline output
        yield f"event: done\ndata: {json.dumps(final_state)}\n\n"

    except Exception as e:
        import traceback
        traceback.print_exc()
        payload = {"message": f"Execution Error: {str(e)}"}
        yield f"event: error\ndata: {json.dumps(payload)}\n\n"

@app.post("/api/generate")
async def generate(request: GenerateRequest, current_user: dict = Depends(get_current_user)):
    """
    Submits user prompt to security pipeline and yields live Server-Sent Events (SSE).
    Performs prompt validation, project context retrieval, and semantic deduplication.
    """
    if not hasattr(app.state, "graph") or app.state.graph is None:
        raise HTTPException(status_code=500, detail="State graph is not initialized.")
        
    resolved_project_id = request.project_id
    resolved_prompt = request.prompt
    resolved_language = request.language
    
    # Check ownership if project_id is provided
    if resolved_project_id:
        existing_proj = get_project(resolved_project_id)
        if existing_proj and existing_proj.get("user_id") != current_user["sub"]:
            raise HTTPException(status_code=403, detail="Access denied to this project.")
    
    # 1. If project_id is given but prompt is empty, load existing prompt from db
    if resolved_project_id and not resolved_prompt:
        project_data = get_project(resolved_project_id, user_id=current_user["sub"])
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
            language=resolved_language,
            user_id=current_user["sub"]
        )
    except Exception as e:
        print(f"main.py WARNING: Failed to write initial project to database: {e}")
        
    return StreamingResponse(
        event_generator(resolved_prompt, resolved_language, resolved_project_id, code=request.code or "", skip_developer=request.skip_developer),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"}
    )

@app.get("/api/projects")
async def list_projects(current_user: dict = Depends(get_current_user)):
    """
    Retrieves all projects stored in long-term memory.
    """
    return get_all_projects(user_id=current_user["sub"])

@app.get("/api/projects/{project_id}")
async def retrieve_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves a single project by ID.
    """
    project = get_project(project_id, user_id=current_user["sub"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project

@app.delete("/api/projects/{project_id}")
async def remove_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    Deletes a project and its code generations from the database.
    """
    project = get_project(project_id, user_id=current_user["sub"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    
    try:
        delete_project(project_id, user_id=current_user["sub"])
        return {"status": "success", "message": f"Project {project_id} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}/generations")
async def project_history(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves all generations associated with a project.
    """
    project = get_project(project_id, user_id=current_user["sub"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    generations = get_project_generations(project_id)
    return generations

class CreateProjectRequest(BaseModel):
    id: str
    name: str
    language: str
    prompt: Optional[str] = ""

@app.post("/api/projects")
async def api_create_project(request: CreateProjectRequest, current_user: dict = Depends(get_current_user)):
    """
    Creates a new project and initializes it with a README.md.
    """
    existing = get_project(request.id)
    if existing:
        raise HTTPException(status_code=400, detail="Project ID already exists.")
        
    try:
        create_project(
            project_id=request.id,
            name=request.name,
            prompt=request.prompt or "Manually created project folder",
            language=request.language,
            user_id=current_user["sub"]
        )
        
        # Initialize with a default README.md file mapping
        initial_code = json.dumps({
            "files": {
                "README.md": f"# {request.name}\n\nThis project folder was manually created.\nDefault language: {request.language}\n"
            }
        })
        
        create_generation(
            project_id=request.id,
            code=initial_code,
            security_score=100,
            findings=[],
            embedding=[]
        )
        
        return {"status": "success", "project_id": request.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class SaveCodeRequest(BaseModel):
    code: str
    security_score: Optional[int] = 100
    findings: Optional[List[Any]] = []

@app.post("/api/projects/{project_id}/code")
async def save_project_code(project_id: str, request: SaveCodeRequest, current_user: dict = Depends(get_current_user)):
    """
    Saves manually edited code or file structures to the database as a new generation.
    """
    project = get_project(project_id, user_id=current_user["sub"])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
        
    try:
        create_generation(
            project_id=project_id,
            code=request.code,
            security_score=request.security_score,
            findings=request.findings,
            embedding=[]
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RunRequest(BaseModel):
    code: str
    language: str

@app.post("/api/run")
async def run_code(request: RunRequest, current_user: dict = Depends(get_current_user)):
    """
    Executes code inside an E2B Sandbox on demand.
    """
    from tools.e2b_tool import execute_in_sandbox
    try:
        res = execute_in_sandbox(request.code, request.language)
        return res
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Error running code: {str(e)}"
        }


class RenameProjectRequest(BaseModel):
    new_id: str

@app.post("/api/projects/{project_id}/rename")
async def rename_project_api(project_id: str, request: RenameProjectRequest, current_user: dict = Depends(get_current_user)):
    if not request.new_id.strip():
        raise HTTPException(status_code=400, detail="New name cannot be empty.")
    
    new_id = request.new_id.strip()
    if not new_id.startswith("project_") and project_id.startswith("project_"):
        new_id = f"project_{new_id}"

    existing = get_project(new_id)
    if existing:
        raise HTTPException(status_code=400, detail="A project with this name already exists.")

    from database import rename_project
    success = rename_project(project_id, new_id, user_id=current_user["sub"])
    if not success:
        raise HTTPException(status_code=404, detail="Project not found or rename failed.")
    return {"status": "success", "new_project_id": new_id}


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    project_id: str
    message: str
    history: Optional[List[ChatMessage]] = None

@app.post("/api/chat")
async def chat(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    """
    Handles normal chat with CodeSentinel without running the main multi-agent security pipeline.
    """
    # Verify ownership of project
    project = get_project(request.project_id, user_id=current_user["sub"])
    if not project:
        raise HTTPException(status_code=403, detail="Access denied to this project.")

    try:
        from graph.nodes import get_llm
        llm = get_llm("DEVELOPER_MODEL", "gemini-2.5-flash-lite")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load LLM: {str(e)}")

    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    messages = []
    system_prompt = (
        "You are CodeSentinel, a helpful AI assistant built to help developers with security, debugging, and code development. "
        "Provide clear, concise, and professional answers."
    )
    messages.append(SystemMessage(content=system_prompt))

    if request.history:
        for msg in request.history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            else:
                messages.append(AIMessage(content=msg.content))

    messages.append(HumanMessage(content=request.message))

    try:
        response = await llm.ainvoke(messages)
        return {"response": response.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM invocation failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    uvicorn.run("main:app", host=host, port=port, reload=True)
