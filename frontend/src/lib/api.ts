/**
 * CodeSentinel API Client
 *
 * - Typed wrappers for all backend REST endpoints
 * - Proper SSE parser: reads `event:` + `data:` as pairs (fixing the
 *   previous bug where only `data:` lines were consumed)
 */

import { API_BASE } from "./config";

// ── Shared types (mirroring backend Pydantic models) ─────────────────────────

export interface SemgrepFinding {
  check_id: string;
  message:  string;
  severity: string;
  line:     number;
  cwe:      string[];
  owasp:    string[];
}

export interface TriageOutput {
  verdict:          string;
  security_score:   number;
  findings_to_fix:  SemgrepFinding[];
  reasoning:        string;
}

export interface Project {
  id:         string;
  name:       string;
  prompt:     string;
  language:   string;
  created_at: string;
  updated_at: string;
}

export interface Generation {
  id:             string;
  project_id:     string;
  code:           string;
  security_score: number;
  findings:       SemgrepFinding[];
  created_at:     string;
}

// ── SSE types ────────────────────────────────────────────────────────────────

export type SSEEventType =
  | "node_start"
  | "node_end"
  | "done"
  | "error"
  | string;

export interface ParsedSSE {
  eventType: SSEEventType;
  data:      Record<string, unknown>;
}

// ── SSE Stream ───────────────────────────────────────────────────────────────

/**
 * Streams the pipeline SSE events from the backend.
 *
 * The backend uses the standard `text/event-stream` format:
 *   event: node_start
 *   data: {"node": "developer_agent"}
 *
 *   event: node_end
 *   data: {"node": "developer_agent", "output": {...}}
 *
 *   event: done
 *   data: {...full accumulated state...}
 *
 * We correctly parse `event:` and `data:` as pairs.
 */
export async function* streamGenerate(
  prompt:     string,
  language:   string,
  projectId?: string,
  code?:      string,        // user-provided code → skips developer_agent on the backend
): AsyncGenerator<ParsedSSE> {
  const resp = await fetch(`${API_BASE}/api/generate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      language,
      project_id: projectId ?? null,
      code:       code      ?? null,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }

  if (!resp.body) throw new Error("No response body");

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer       = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";       // last incomplete line stays in buffer

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const data = JSON.parse(raw) as Record<string, unknown>;
          yield { eventType: currentEvent || "unknown", data };
          currentEvent = "";           // consume after pair
        } catch {
          // skip malformed JSON — continue stream
        }
      }
      // blank lines and comment lines (`:`) are ignored
    }
  }
}

// ── REST endpoints ────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const resp = await fetch(`${API_BASE}/api/projects`);
  if (!resp.ok) throw new Error(`fetchProjects: HTTP ${resp.status}`);
  return resp.json();
}

export async function fetchProject(id: string): Promise<Project> {
  const resp = await fetch(`${API_BASE}/api/projects/${id}`);
  if (!resp.ok) throw new Error(`fetchProject: HTTP ${resp.status}`);
  return resp.json();
}

export async function fetchGenerations(projectId: string): Promise<Generation[]> {
  const resp = await fetch(`${API_BASE}/api/projects/${projectId}/generations`);
  if (!resp.ok) throw new Error(`fetchGenerations: HTTP ${resp.status}`);
  return resp.json();
}

export async function checkHealth(): Promise<{
  status:             string;
  graph_ready:        boolean;
  checkpointer:       string;
  langsmith_tracing:  boolean;
}> {
  const resp = await fetch(`${API_BASE}/health`);
  if (!resp.ok) throw new Error(`checkHealth: HTTP ${resp.status}`);
  return resp.json();
}
