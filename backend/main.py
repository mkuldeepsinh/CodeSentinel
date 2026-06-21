import os
import re
import json
import asyncio
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, Security, WebSocket, WebSocketDisconnect, Request, Response
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
    get_project as db_get_project,
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

def get_project(project_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if project_id == "default" and user_id:
        proj = db_get_project("default", user_id=user_id)
        if not proj:
            try:
                create_project(
                    project_id="default",
                    name="Default Workspace",
                    prompt="Default general workspace.",
                    language="javascript",
                    user_id=user_id
                )
                proj = db_get_project("default", user_id=user_id)
            except Exception as e:
                print(f"main.py WARNING: Failed to auto-create default project: {e}")
        return proj
    return db_get_project(project_id, user_id=user_id)

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

class GoogleVerifyRequest(BaseModel):
    id_token: str

class GitHubVerifyRequest(BaseModel):
    code: str

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
        # Supabase free tier drops idle connections aggressively.
        # Add keepalive + connection timeout params to prevent mid-pipeline drops.
        keepalive_params = (
            "keepalives=1"
            "&keepalives_idle=10"
            "&keepalives_interval=5"
            "&keepalives_count=3"
            "&connect_timeout=10"
        )
        if "?" in db_url:
            db_url_with_ka = f"{db_url}&{keepalive_params}"
        else:
            db_url_with_ka = f"{db_url}?{keepalive_params}"

        try:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            app.state.checkpointer_ctx = AsyncPostgresSaver.from_conn_string(db_url_with_ka)
            app.state.checkpointer = await app.state.checkpointer_ctx.__aenter__()
            
            # Disable psycopg prepared statements for compatibility with PgBouncer/Supabase transaction mode poolers
            if hasattr(app.state.checkpointer, "conn") and hasattr(app.state.checkpointer.conn, "prepare_threshold"):
                app.state.checkpointer.conn.prepare_threshold = None
                print("FastAPI Lifespan: Disabled prepare_threshold on Postgres checkpointer connection.")
                
            await app.state.checkpointer.setup()
            print("FastAPI Lifespan: Postgres checkpointer initialized successfully (with keepalive).")
        except Exception as e:
            print(f"FastAPI Lifespan WARNING: Failed to initialize Postgres checkpointer: {e}")
            print("FastAPI Lifespan: Falling back to MemorySaver.")
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

@app.post("/api/auth/google/verify")
async def verify_google_token(request: GoogleVerifyRequest):
    import httpx
    import uuid
    from database import get_user_by_email, create_user
    from auth import create_access_token
    
    google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if not google_client_id:
        raise HTTPException(
            status_code=500,
            detail="Google Client ID is not configured on the server. Please set GOOGLE_CLIENT_ID in the environment."
        )
        
    async with httpx.AsyncClient() as client:
        # Call Google TokenInfo endpoint to verify the ID token
        resp = await client.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={request.id_token}")
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid Google authentication token.")
        payload = resp.json()
        
    # Verify the target audience matches our Client ID
    aud = payload.get("aud")
    if aud != google_client_id:
        raise HTTPException(status_code=401, detail="Google authentication token audience mismatch.")
        
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google identity profile does not expose a verified email address.")
        
    user = get_user_by_email(email)
    if not user:
        user_id = f"user_{str(uuid.uuid4())[:8]}"
        user = create_user(user_id=user_id, email=email, hashed_password=None, provider="google")
    elif user["provider"] != "google":
        raise HTTPException(
            status_code=400,
            detail=f"This email is registered via {user['provider'].capitalize()}. Please use that method."
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

@app.post("/api/auth/github/verify")
async def verify_github_code(request: GitHubVerifyRequest):
    import httpx
    import uuid
    from database import get_user_by_email, create_user
    from auth import create_access_token
    
    client_id = os.environ.get("GITHUB_CLIENT_ID")
    client_secret = os.environ.get("GITHUB_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail="GitHub Client ID or Client Secret is not configured on the server. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET."
        )
        
    async with httpx.AsyncClient() as client:
        # 1. Exchange OAuth code for Access Token
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": request.code,
            }
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to complete token exchange with GitHub.")
            
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            error_desc = token_data.get("error_description", "Invalid authorization code.")
            raise HTTPException(status_code=400, detail=error_desc)
            
        # 2. Retrieve user identity profile
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "User-Agent": "CodeSentinel"}
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch user profile from GitHub.")
        user_profile = user_resp.json()
        
        # 3. Retrieve user email listings (to search primary verified email)
        emails_resp = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access_token}", "User-Agent": "CodeSentinel"}
        )
        email = None
        if emails_resp.status_code == 200:
            emails = emails_resp.json()
            for email_info in emails:
                if email_info.get("primary") and email_info.get("verified"):
                    email = email_info.get("email")
                    break
            if not email and emails:
                email = emails[0].get("email")
                
        if not email:
            email = user_profile.get("email")
        if not email:
            username = user_profile.get("login", "github_user")
            email = f"{username}@users.noreply.github.com"
            
    user = get_user_by_email(email)
    if not user:
        user_id = f"user_{str(uuid.uuid4())[:8]}"
        user = create_user(user_id=user_id, email=email, hashed_password=None, provider="github")
    elif user["provider"] != "github":
        raise HTTPException(
            status_code=400,
            detail=f"This email is registered via {user['provider'].capitalize()}. Please use that method."
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
        err_str = str(e)

        # Detect Supabase / PostgreSQL connection drop mid-pipeline
        is_db_drop = any(phrase in err_str.lower() for phrase in [
            "consuming input failed",
            "server closed the connection unexpectedly",
            "connection was closed",
            "ssl connection has been closed",
            "terminating connection due to administrator command",
        ])

        if is_db_drop:
            # Swap checkpointer to MemorySaver so next request works without restart
            try:
                from langgraph.checkpoint.memory import MemorySaver
                from graph.graph import build_graph
                app.state.checkpointer = MemorySaver()
                app.state.graph = build_graph(app.state.checkpointer)
                print("main.py: Supabase drop detected — switched checkpointer to MemorySaver and rebuilt graph.")
            except Exception as rebuild_err:
                print(f"main.py: Failed to rebuild graph after DB drop: {rebuild_err}")

            payload = {
                "message": (
                    "Database connection dropped (Supabase free tier idle timeout). "
                    "The pipeline has automatically switched to in-memory mode. "
                    "Please retry your request — it will work now."
                )
            }
        else:
            payload = {"message": f"Execution Error: {err_str}"}

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
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    if resolved_project_id:
        existing_proj = get_project(resolved_project_id)
        if existing_proj and not is_admin and existing_proj.get("user_id") != current_user["sub"]:
            raise HTTPException(status_code=403, detail="Access denied to this project.")
    
    # 1. If project_id is given but prompt is empty, load existing prompt from db
    if resolved_project_id and not resolved_prompt:
        user_id = None if is_admin else current_user["sub"]
        project_data = get_project(resolved_project_id, user_id=user_id)
        if not project_data:
            raise HTTPException(status_code=404, detail="Project not found.")
        resolved_prompt = project_data["prompt"]
        resolved_language = project_data["language"]

    # 1.5. Resolve @agent.md prompt mention if project_id is provided
    if resolved_project_id and resolved_prompt:
        pattern = r"(@filename\s*\[agent\.md\]|@agent\.md)"
        if re.search(pattern, resolved_prompt, re.IGNORECASE):
            from database import get_latest_generation
            latest_gen = get_latest_generation(resolved_project_id)
            agent_md_content = None
            if latest_gen and latest_gen.get("code"):
                try:
                    code_data = json.loads(latest_gen["code"])
                    if isinstance(code_data, dict) and "files" in code_data:
                        agent_md_content = code_data["files"].get("agent.md")
                except Exception as e:
                    print(f"Error parsing project files for agent.md prompt injection: {e}")
            if agent_md_content:
                resolved_prompt = re.sub(pattern, agent_md_content, resolved_prompt, flags=re.IGNORECASE)
        
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
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    user_id = None if is_admin else current_user["sub"]
    return get_all_projects(user_id=user_id)

@app.get("/api/projects/{project_id}")
async def retrieve_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves a single project by ID.
    """
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    user_id = None if is_admin else current_user["sub"]
    project = get_project(project_id, user_id=user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project

@app.delete("/api/projects/{project_id}")
async def remove_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    Deletes a project and its code generations from the database.
    """
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    user_id = None if is_admin else current_user["sub"]
    project = get_project(project_id, user_id=user_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    
    try:
        delete_project(project_id, user_id=user_id)
        return {"status": "success", "message": f"Project {project_id} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}/generations")
async def project_history(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves all generations associated with a project.
    """
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    user_id = None if is_admin else current_user["sub"]
    project = get_project(project_id, user_id=user_id)
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
    Creates a new project and initializes it with a agent.md.
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
        
        # Initialize with a default agent.md file mapping
        initial_code = json.dumps({
            "files": {
                "agent.md": f"# {request.name}\n\nThis project folder was manually created.\nDefault language: {request.language}\n"
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
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    user_id = None if is_admin else current_user["sub"]
    project = get_project(project_id, user_id=user_id)
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

# ── Active Docker PTY sessions: session_id -> DockerTerminalSession ────────────
_terminal_sessions: Dict[str, Any] = {}
_cpr_regex = re.compile(r'\x1b\[\d+;\d+R')


@app.websocket("/ws/terminal/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str, image: Optional[str] = None, projectId: Optional[str] = None):
    """
    WebSocket endpoint that exposes a full interactive PTY inside a Docker
    container.  The frontend TerminalTab component connects here.

    Protocol:
      - Text frames from client  → written to container PTY stdin
      - Text frames from server  ← container PTY stdout/stderr
      - Special frame "__RESIZE__:cols,rows"  → PTY resize
      - Special frame "__LOAD_FILES__:<b64json>"  → load files into workspace
    """
    await websocket.accept()

    from tools.docker_tool import DockerTerminalSession

    # Close any existing session with the same session_id to prevent phantom connections
    existing = _terminal_sessions.pop(session_id, None)
    if existing:
        try:
            existing.stop()
        except Exception:
            pass

    kwargs = {}
    if image:
        kwargs["image"] = image
    if projectId:
        kwargs["project_id"] = projectId
    session = DockerTerminalSession(session_id, **kwargs)
    try:
        session.start()
    except Exception as exc:
        await websocket.send_text(f"\r\n\x1b[31m[CodeSentinel] Failed to start Docker terminal: {exc}\x1b[0m\r\n")
        await websocket.close()
        return

    _terminal_sessions[session_id] = session
    
    ready_msg = "\r\n\x1b[32m● Docker terminal ready. Type commands below.\x1b[0m"
    if session.port_mappings:
        mappings_str = ", ".join([f"container {k.split('/')[0]} → host {v}" for k, v in session.port_mappings.items()])
        ready_msg += f"\r\n\x1b[34m● Port forwarding active: {mappings_str}\x1b[0m"
    ready_msg += "\r\n"
    await websocket.send_text(ready_msg)

    loop = asyncio.get_event_loop()

    async def _read_container():
        """Continuously read PTY output and forward to WebSocket."""
        while True:
            data = await loop.run_in_executor(None, session.read, 1024)
            if data:
                await websocket.send_text(data.decode("utf-8", errors="replace"))
            else:
                await asyncio.sleep(0.02)

    async def _write_container():
        """Read WebSocket messages and write to PTY stdin."""
        try:
            while True:
                msg = await websocket.receive_text()
                if msg.startswith("__RESIZE__:"):
                    _, dims = msg.split(":", 1)
                    try:
                        cols, rows = map(int, dims.split(","))
                        session.resize(cols, rows)
                    except ValueError:
                        pass
                elif msg.startswith("__LOAD_FILES__:"):
                    _, payload = msg.split(":", 1)
                    try:
                        import base64
                        decoded = base64.b64decode(payload).decode("utf-8")
                        data = json.loads(decoded)
                        files = data.get("files", {})
                        command = data.get("command", None)

                        def _load_and_run():
                            try:
                                if _terminal_sessions.get(session_id) is not session:
                                    print(f"DEBUG: Session {session_id} is no longer active. Aborting _load_and_run.")
                                    return
                                print(f"DEBUG: _load_and_run started. Command: {command}")
                                if files:
                                    print(f"DEBUG: loading {len(files)} files into container workspace...")
                                    session.load_files(files)
                                if _terminal_sessions.get(session_id) is not session:
                                    print(f"DEBUG: Session {session_id} is no longer active. Aborting before writing command.")
                                    return
                                if command:
                                    print(f"DEBUG: writing command to PTY stdin: {command}")
                                    session.write(f"{command}\n".encode("utf-8"))
                                print("DEBUG: _load_and_run completed successfully!")
                            except Exception as e:
                                if _terminal_sessions.get(session_id) is not session:
                                    print(f"DEBUG: Suppressing error in inactive session {session_id}: {e}")
                                    return
                                import traceback
                                print("DEBUG: Exception in _load_and_run:")
                                traceback.print_exc()
                                raise e

                        await loop.run_in_executor(None, _load_and_run)
                        if _terminal_sessions.get(session_id) is session:
                            await websocket.send_text("\r\n\x1b[32m● Loaded workspace files into container.\x1b[0m\r\n")
                    except Exception as exc:
                        await websocket.send_text(f"\r\n\x1b[31m[CodeSentinel] Failed to load files: {exc}\x1b[0m\r\n")
                else:
                    # Strip ANSI Cursor Position Report (CPR) responses (e.g. \x1b[3;14R)
                    # sent by terminal emulators, which can corrupt python input() read buffers.
                    processed = _cpr_regex.sub('', msg)

                    # Translate raw carriage returns (\r or \r\n) to standard newlines (\n)
                    # to prevent Python's input() from retaining trailing \r in the PTY.
                    processed = processed.replace("\r\n", "\n").replace("\r", "\n")

                    if processed:
                        session.write(processed.encode("utf-8"))
        except WebSocketDisconnect:
            pass

    try:
        await asyncio.gather(_read_container(), _write_container())
    except Exception:
        pass
    finally:
        session.stop()
        _terminal_sessions.pop(session_id, None)


class RunRequest(BaseModel):
    code: str
    language: str


@app.post("/api/run")
async def run_code(request: RunRequest, current_user: dict = Depends(get_current_user)):
    """
    Executes code inside a Docker container on demand.
    Replaces the old E2B-based execution endpoint.
    """
    from tools.docker_tool import run_code_in_container
    try:
        res = await asyncio.get_event_loop().run_in_executor(
            None,
            run_code_in_container,
            request.code,
            request.language,
            60,
        )
        return res
    except Exception as exc:
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Error running code: {str(exc)}"
        }


@app.get("/api/terminal/{session_id}/ports")
async def get_terminal_ports(session_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns active port mappings for a given interactive Docker PTY terminal session.
    """
    session = _terminal_sessions.get(session_id)
    if not session:
        return {"port_mappings": {}}
    return {"port_mappings": session.port_mappings}


@app.api_route("/api/terminal/{session_id}/proxy", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
@app.api_route("/api/terminal/{session_id}/proxy/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def terminal_proxy(session_id: str, request: Request, path: str = ""):
    """
    Proxies requests from the IDE's Web Preview tab to the running Docker PTY terminal.
    Strips security headers like X-Frame-Options and Content-Security-Policy to allow framing
    inside the IDE, and modifies cookie paths to enable session cookie persistence.
    """
    import httpx
    
    session = _terminal_sessions.get(session_id)
    if not session:
        return Response(content="Terminal session not found or inactive", status_code=404)
        
    host_port = session.port_mappings.get("3000/tcp")
    if not host_port:
        return Response(content="No active port mapping found for port 3000", status_code=404)
        
    target_url = f"http://localhost:{host_port}/{path}"
    # Forward query parameters
    query_params = dict(request.query_params)
    if query_params:
        from urllib.parse import urlencode
        target_url += f"?{urlencode(query_params)}"
        
    # Read headers and modify host
    headers = dict(request.headers)
    headers["host"] = f"localhost:{host_port}"
    
    # Exclude connection headers
    exclude_req_headers = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"]
    for key in exclude_req_headers:
        headers.pop(key, None)
        
    # Read body
    body = await request.body()
    
    # Send request using httpx
    async with httpx.AsyncClient() as client:
        try:
            req = client.build_request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                timeout=10.0
            )
            resp = await client.send(req)
        except Exception as e:
            return Response(content=f"Error proxying request to container: {str(e)}", status_code=502)
            
    # Build response headers
    exclude_resp_headers = [
        "content-length", "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade",
        "x-frame-options", "content-security-policy"
    ]
    
    headers_list = []
    for k, v in resp.headers.raw:
        k_str = k.decode("utf-8").lower()
        if k_str not in exclude_resp_headers:
            if k_str == "set-cookie":
                v_str = v.decode("utf-8")
                v_str = re.sub(r'(?i)path=\s*/', f'Path=/api/terminal/{session_id}/proxy', v_str)
                headers_list.append((k_str, v_str))
            else:
                headers_list.append((k_str, v.decode("utf-8")))

    content_type = resp.headers.get("content-type", "")
    content = resp.content
    if "text/html" in content_type:
        html_str = content.decode("utf-8", errors="replace")
        base_tag = f'<base href="/api/terminal/{session_id}/proxy/" />'
        if "<head>" in html_str:
            html_str = html_str.replace("<head>", f"<head>{base_tag}", 1)
        elif "<HEAD>" in html_str:
            html_str = html_str.replace("<HEAD>", f"<HEAD>{base_tag}", 1)
        else:
            html_str = base_tag + html_str
        content = html_str.encode("utf-8")
        
    return Response(
        content=content,
        status_code=resp.status_code,
        headers=dict(headers_list)
    )




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
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    user_id = None if is_admin else current_user["sub"]
    success = rename_project(project_id, new_id, user_id=user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found or rename failed.")
        
    # Update active PTY terminal session project IDs and container directory paths
    for session in list(_terminal_sessions.values()):
        if session.project_id == project_id:
            session.project_id = new_id
            if session.container:
                try:
                    session.container.exec_run(f"mv /codesentinel/{project_id} /codesentinel/{new_id}")
                except Exception as e:
                    print(f"main.py WARNING: Failed to rename container workspace directory: {e}")

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
    is_admin = current_user.get("email") == "admin@codesentinel.com"
    user_id = None if is_admin else current_user["sub"]
    project = get_project(request.project_id, user_id=user_id)
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

    resolved_message = request.message
    pattern = r"(@filename\s*\[agent\.md\]|@agent\.md)"
    if re.search(pattern, resolved_message, re.IGNORECASE):
        from database import get_latest_generation
        latest_gen = get_latest_generation(request.project_id)
        agent_md_content = None
        if latest_gen and latest_gen.get("code"):
            try:
                code_data = json.loads(latest_gen["code"])
                if isinstance(code_data, dict) and "files" in code_data:
                    agent_md_content = code_data["files"].get("agent.md")
            except Exception as e:
                print(f"Error parsing project files for agent.md chat injection: {e}")
        if agent_md_content:
            resolved_message = re.sub(pattern, agent_md_content, resolved_message, flags=re.IGNORECASE)

    messages.append(HumanMessage(content=resolved_message))

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
