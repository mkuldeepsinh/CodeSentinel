# CodeSentinel Step 3 (Orchestrator & API) Implementation Plan

Plan for assembling the LangGraph state machine and hosting the FastAPI Server-Sent Events (SSE) server.

---

## 1. Graph Assembly (`graph/graph.py`)
Compile the compiled StateGraph.

### Wires
* **Nodes**: Register all 7 nodes from `nodes.py`.
* **Standard Edges**:
  * `START` → `developer_agent`
  * `developer_agent` → `e2b_execute`
  * `semgrep_scan` → `triage_agent`
  * `synthesizer_agent` → `e2b_verify`
  * `finalize` → `END`
* **Conditional Edges**:
  * From `e2b_execute` using `check_execution_success` routing to `developer_agent` or `semgrep_scan`.
  * From `triage_agent` using `check_triage_verdict` routing to `finalize` or `synthesizer_agent`.
  * From `e2b_verify` using `check_verify_result` routing to `semgrep_scan`, `synthesizer_agent`, or `finalize`.

---

## 2. API Design & Streaming Server (`main.py`)
Host FastAPI server and pipe graph execution logs to client.

### Implementation Details
* **App Lifespan**: Use `@asynccontextmanager` lifespan function to build the graph once at startup (`app.state.graph = build_graph()`).
* **CORS**: Enable `CORSMiddleware` to allow local cross-origin connections.
* **Health Check**: `GET /health` returning `{ "status": "ok", "graph_ready": bool }`.
* **Streaming Endpoint**: `POST /api/generate` returning `StreamingResponse` (media type `text/event-stream`).
* **SSE Event Generator**:
  * Invoke `app.state.graph.astream_events(initial_state, version="v2")`.
  * Track and merge state updates in a local `state_accumulator`.
  * Yield events formatted as SSE chunks:
    * `event: node_start\ndata: {"node": "name"}\n\n`
    * `event: node_end\ndata: {"node": "name", "output": {...}}\n\n`
    * `event: done\ndata: <accumulated_final_state>\n\n`
    * `event: error\ndata: {"message": "error details"}\n\n`
* **Nginx Compatibility Header**: Add `X-Accel-Buffering: no` header to streaming response.
* **Server Execution Helper**: Add Uvicorn run block on `PORT` (8000) and `HOST` (0.0.0.0).

---

## 3. Validation Plan
* Create `backend/test_step3.py`.
* Verify the graph compiles correctly (`build_graph()` executes without errors).
* Test the FastAPI router syntax and health check responses.
