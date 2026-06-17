# CodeSentinel — Agentic Code Security Pipeline

## Project Idea

CodeSentinel is a multi-agent DevSecOps pipeline that takes a natural language coding requirement, generates Node.js code, validates it executes correctly, scans it for security vulnerabilities, patches them autonomously, and streams every step live to the client.

The pipeline is orchestrated as a LangGraph state machine with six nodes. Three of those nodes are LLM agents (Developer, Triage, Synthesizer). Two are tool nodes (E2B sandbox executor, Semgrep scanner). One is a finalizer. The agents collaborate in a feedback loop: after patching, the code is re-executed and re-scanned until it is clean or the iteration cap is reached.

The system emits real-time Server-Sent Events (SSE) as LangGraph transitions between nodes, so the frontend can display live pipeline progress.

---

## Graph Topology

```
START
  └─► developer_agent
        └─► e2b_execute ──── (error + retries < 3) ──► developer_agent
                    │
              (success or max retries)
                    │
                    ▼
              semgrep_scan
                    │
                    ▼
              triage_agent ──── (verdict = clean) ──► finalize ──► END
                    │
              (verdict = fix)
                    │
                    ▼
           synthesizer_agent
                    │
                    ▼
              e2b_verify ──── (broke execution) ──► synthesizer_agent
                    │
              (still runs)
                    │
                    ▼
              semgrep_scan   ← re-audit loop (max 3 iterations)
```

---

## Node Responsibilities

| Node | Type | Responsibility |
|---|---|---|
| `developer_agent` | LLM Agent | Writes Node.js code from user prompt. On retry, fixes execution errors. |
| `e2b_execute` | Tool | Runs the generated code in an E2B microVM to catch runtime errors. |
| `semgrep_scan` | Tool | Scans code locally on the host for vulnerabilities. |
| `triage_agent` | LLM Agent | Filters false positives, assigns security score 0–100, returns structured verdict. |
| `synthesizer_agent` | LLM Agent | Patches all real vulnerabilities without breaking functionality. |
| `e2b_verify` | Tool | Re-runs patched code in E2B to confirm the fix didn't break execution. |
| `finalize` | Logic | Assembles final code, score history, and audit trail. |

---

## LangGraph State Fields

| Field | Type | Description |
|---|---|---|
| `user_prompt` | str | Raw user requirement |
| `language` | str | Target language, default "javascript" |
| `current_code` | str | Latest version of the code (mutated each iteration) |
| `execution_stdout` | str | E2B stdout |
| `execution_stderr` | str | E2B stderr |
| `execution_success` | bool | Whether E2B exit code was 0 |
| `dev_retries` | int | Dev agent retry counter (max 3) |
| `raw_semgrep_findings` | list[dict] | Raw Semgrep JSON results |
| `triage_output` | TriageOutput | Structured triage result (Pydantic model) |
| `security_score` | int | Latest score 0–100 |
| `security_iterations` | int | Synthesizer loop counter (max 3) |
| `final_code` | str | Final secure code |
| `stage_events` | Annotated[list, add] | SSE event log — accumulates across all nodes |
| `score_history` | Annotated[list, add] | Score per iteration e.g. [45, 72, 100] |
| `audit_trail` | Annotated[list, add] | Per-iteration snapshots for the final report |

---

## Pydantic Output Models

**SemgrepFinding** — fields: `check_id`, `message`, `severity` (ERROR/WARNING/INFO), `line`, `cwe: list[str]`, `owasp: list[str]`

**TriageOutput** — fields: `verdict` (fix/clean), `security_score` (0–100), `findings_to_fix: list[SemgrepFinding]`, `reasoning`

Triage Agent uses `.with_structured_output(TriageOutput)` — no manual JSON parsing.

---

## Tech Stack

### Backend Framework
- **FastAPI** — REST API, SSE streaming via `StreamingResponse`
- **Uvicorn** — ASGI server

### AI / Orchestration
- **LangGraph** — state machine orchestration, conditional edges, `astream_events` for SSE
- **langchain-google-genai** — `ChatGoogleGenerativeAI` wrapping Gemini
- **Gemini 2.0 Flash** — all three LLM agents (free tier via Google AI Studio)

### Sandbox Execution
- **e2b** (base package, NOT `e2b_code_interpreter`) — `e2b.Sandbox` for Node.js execution in microVM

### Static Analysis
- **Semgrep** — runs locally on the host, NOT inside E2B
- Command: `semgrep scan --config=auto --json <tempfile>` (NOT `semgrep ci`)

### Utilities
- **pydantic** — structured LLM outputs, request models
- **python-dotenv** — environment variable management
- **httpx** — async HTTP client

---

## API Design

### `POST /api/generate`
- Request body: `{ "prompt": string, "language": string }`
- Response: `StreamingResponse` with `media-type: text/event-stream`
- Emits SSE events: `node_start`, `node_end`, `done`, `error`
- Graph is compiled once at startup using FastAPI `lifespan` context

### `GET /health`
- Returns: `{ "status": "ok", "graph_ready": bool }`

---

## Project Structure

```
codesentinel-backend/
├── main.py                  # FastAPI app, lifespan, SSE endpoint
├── requirements.txt
├── .env.example
├── graph/
│   ├── state.py             # PipelineState TypedDict + Pydantic models
│   ├── nodes.py             # All 7 node functions
│   ├── edges.py             # All conditional routing functions
│   └── graph.py             # build_graph() — wires nodes and edges
└── tools/
    ├── e2b_tool.py          # execute_nodejs_in_sandbox()
    └── semgrep_tool.py      # run_semgrep() + normalize_finding()
```

---

## Environment Variables

```
GOOGLE_API_KEY=      # Google AI Studio — free tier, 1500 req/day
E2B_API_KEY=         # E2B dashboard — free tier, 100 hrs/month
MAX_DEV_RETRIES=3
MAX_SEC_ITERATIONS=3
```

---

## Key Constraints

- Semgrep must run on the host, not inside E2B
- E2B Sandbox is for Node.js execution only (use base `e2b` package)
- Gemini model string: `gemini-2.0-flash`
- Triage Agent must use `.with_structured_output()`, not raw JSON parsing
- LangGraph graph compiled once at startup via `lifespan`, not per request
- SSE uses `astream_events(initial_state, version="v2")`
- Add `X-Accel-Buffering: no` header for nginx SSE compatibility