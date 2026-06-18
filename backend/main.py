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
    create_project,
    update_project_dir,
    get_project_with_generations,
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
    Retrieves all projects stored in long-term memory, ordered by most recent.
    """
    return get_all_projects()

@app.get("/api/projects/{project_id}")
async def retrieve_project(project_id: str):
    """
    Retrieves a single project with all its generations merged in.
    """
    project = get_project_with_generations(project_id)
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


# ── Write-to-Disk ─────────────────────────────────────────────────────────────

class WriteRequest(BaseModel):
    code: str                          # final code to write (may be user-edited)
    output_dir: Optional[str] = None   # override base dir; defaults to ~/CodeSentinel-projects


def _detect_extension(language: str) -> str:
    return {
        "javascript": "js", "typescript": "ts", "python": "py",
        "java": "java", "go": "go", "rust": "rs", "cpp": "cpp",
        "c": "c", "ruby": "rb", "php": "php", "swift": "swift",
    }.get(language.lower(), "txt")


def _build_package_json(project_id: str, language: str, code: str) -> Optional[str]:
    """Generates a minimal package.json for JS/TS projects."""
    if language.lower() not in ("javascript", "typescript"):
        return None
    # Detect common dependencies used in code
    deps: dict = {}
    if "express" in code:      deps["express"] = "^4.19.0"
    if "axios" in code:        deps["axios"] = "^1.7.0"
    if "dotenv" in code:       deps["dotenv"] = "^16.4.0"
    if "mongoose" in code:     deps["mongoose"] = "^8.0.0"
    if "pg" in code:           deps["pg"] = "^8.12.0"
    if "bcrypt" in code:       deps["bcrypt"] = "^5.1.0"
    if "jsonwebtoken" in code: deps["jsonwebtoken"] = "^9.0.0"
    if "helmet" in code:       deps["helmet"] = "^7.1.0"

    pkg = {
        "name": project_id.replace("_", "-"),
        "version": "1.0.0",
        "description": "Generated by CodeSentinel",
        "main": f"index.{_detect_extension(language)}",
        "scripts": {
            "start": f"node index.{_detect_extension(language)}",
            "dev": f"node --watch index.{_detect_extension(language)}"
        },
        "dependencies": deps,
        "engines": {"node": ">=18"}
    }
    return json.dumps(pkg, indent=2)


def _build_readme(project: dict, generation: dict) -> str:
    score = generation.get("security_score", 0)
    score_emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
    findings = generation.get("findings", [])

    findings_md = ""
    if findings:
        findings_md = "\n\n## Security Findings\n\n"
        for f in findings:
            findings_md += f"### {f.get('severity','?')} — {f.get('check_id','unknown')}\n"
            findings_md += f"- **Line**: {f.get('line', '?')}\n"
            findings_md += f"- **Message**: {f.get('message', '')}\n"
            cwes = ", ".join(f.get("cwe", []))
            if cwes: findings_md += f"- **CWE**: {cwes}\n"
            findings_md += "\n"
    else:
        findings_md = "\n\n## Security Findings\n\n✅ No security findings — code is clean.\n"

    return f"""# {project.get('name', project['id'])}

> Generated by **CodeSentinel** — AI-powered secure code generation pipeline

## Requirement

{project.get('prompt', '')}

## Security Score

{score_emoji} **{score}/100**

Generated: {generation.get('created_at', '')}
Language: `{project.get('language', 'unknown')}`
{findings_md}
## Pipeline

This project was generated and secured by the CodeSentinel multi-agent pipeline:

1. **Developer Agent** — generates code from requirement
2. **E2B Execute** — validates code in sandboxed microVM
3. **Semgrep Scan** — static security analysis
4. **Triage Agent** — filters false positives, assigns score
5. **Synthesizer Agent** — patches real vulnerabilities
6. **Finalize** — saves to long-term memory

---
*CodeSentinel · [github.com/your-org/codesentinel](https://github.com)*
"""


def _build_audit_report(project: dict, generation: dict) -> str:
    return json.dumps({
        "project_id": project["id"],
        "project_name": project.get("name"),
        "prompt": project.get("prompt"),
        "language": project.get("language"),
        "security_score": generation.get("security_score"),
        "findings": generation.get("findings", []),
        "generated_at": generation.get("created_at"),
        "written_at": None,  # filled after write
    }, indent=2)


@app.post("/api/projects/{project_id}/write")
async def write_project_to_disk(project_id: str, request: WriteRequest):
    """
    Writes the accepted code (and supporting files) to disk.
    Creates a proper project folder structure under ~/CodeSentinel-projects/.
    Stores the project_dir path back to the database.

    POST body: { code: string, output_dir?: string }
    Returns: { project_dir, written_files: [{path, size}] }
    """
    project = get_project_with_generations(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    latest_gen = project.get("latest_generation") or {}
    language = project.get("language", "javascript")

    # Resolve base output directory
    base_dir = request.output_dir or os.path.expanduser("~/CodeSentinel-projects")
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in project_id)
    project_dir = os.path.join(base_dir, safe_name)
    sentinel_dir = os.path.join(project_dir, ".codesentinel")

    os.makedirs(project_dir,  exist_ok=True)
    os.makedirs(sentinel_dir, exist_ok=True)

    ext       = _detect_extension(language)
    main_file = os.path.join(project_dir, f"index.{ext}")
    written_files = []

    # 1. Main code file
    with open(main_file, "w", encoding="utf-8") as f:
        f.write(request.code)
    written_files.append({"path": main_file, "size": os.path.getsize(main_file), "type": "code"})

    # 2. package.json (JS/TS only)
    pkg = _build_package_json(project_id, language, request.code)
    if pkg:
        pkg_path = os.path.join(project_dir, "package.json")
        with open(pkg_path, "w", encoding="utf-8") as f:
            f.write(pkg)
        written_files.append({"path": pkg_path, "size": os.path.getsize(pkg_path), "type": "config"})

    # 3. README.md
    readme_path = os.path.join(project_dir, "README.md")
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(_build_readme(project, latest_gen))
    written_files.append({"path": readme_path, "size": os.path.getsize(readme_path), "type": "docs"})

    # 4. .codesentinel/audit_report.json
    audit_path = os.path.join(sentinel_dir, "audit_report.json")
    audit_data = json.loads(_build_audit_report(project, latest_gen))
    import datetime
    audit_data["written_at"] = datetime.datetime.now().isoformat()
    with open(audit_path, "w", encoding="utf-8") as f:
        json.dump(audit_data, f, indent=2)
    written_files.append({"path": audit_path, "size": os.path.getsize(audit_path), "type": "audit"})

    # 5. .codesentinel/pipeline_log.json — stage_events from latest generation
    log_path = os.path.join(sentinel_dir, "pipeline_log.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump({
            "project_id": project_id,
            "score_history": [],
            "stage_events": [],
            "generated_at": latest_gen.get("created_at"),
        }, f, indent=2)
    written_files.append({"path": log_path, "size": os.path.getsize(log_path), "type": "log"})

    # Persist project_dir to DB
    update_project_dir(project_id, project_dir)

    return {
        "project_dir": project_dir,
        "written_files": written_files,
        "file_count": len(written_files),
    }


@app.get("/api/projects/{project_id}/files")
async def list_project_files(project_id: str):
    """
    Lists files written to disk for a project.
    Returns empty list if project hasn't been written yet.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    project_dir = project.get("project_dir")
    if not project_dir or not os.path.isdir(project_dir):
        return {"project_dir": None, "files": [], "written": False}

    files = []
    for root, dirs, filenames in os.walk(project_dir):
        # skip .git
        dirs[:] = [d for d in dirs if d != ".git"]
        for fname in filenames:
            fpath = os.path.join(root, fname)
            rel   = os.path.relpath(fpath, project_dir)
            files.append({
                "name": fname,
                "path": fpath,
                "relative_path": rel,
                "size": os.path.getsize(fpath),
            })

    return {
        "project_dir": project_dir,
        "written": True,
        "written_at": project.get("written_at"),
        "files": files,
    }


@app.get("/api/projects/{project_id}/files/{file_path:path}")
async def read_project_file(project_id: str, file_path: str):
    """
    Returns the content of a specific file within the project directory.
    file_path is relative to the project directory (e.g. index.js, .codesentinel/audit_report.json)
    """
    from fastapi.responses import PlainTextResponse
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    project_dir = project.get("project_dir")
    if not project_dir:
        raise HTTPException(status_code=404, detail="Project not written to disk yet.")

    # Security: resolve and verify path is inside project_dir
    abs_path = os.path.realpath(os.path.join(project_dir, file_path))
    if not abs_path.startswith(os.path.realpath(project_dir)):
        raise HTTPException(status_code=403, detail="Access denied.")

    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    return PlainTextResponse(content, media_type="text/plain")


@app.post("/api/projects/{project_id}/open")
async def open_project_dir(project_id: str):
    """
    Opens the project directory in Finder (macOS), File Explorer (Windows), or File Manager (Linux).
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    project_dir = project.get("project_dir")
    if not project_dir or not os.path.isdir(project_dir):
        raise HTTPException(status_code=400, detail="Project directory does not exist or has not been written.")

    import subprocess
    import sys
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", project_dir], check=True)
        elif sys.platform == "win32":
            os.startfile(project_dir)
        else:
            subprocess.run(["xdg-open", project_dir], check=True)
        return {"success": True, "message": f"Opened {project_dir}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open directory: {str(e)}")





if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    uvicorn.run("main:app", host=host, port=port, reload=True)

