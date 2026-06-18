/**
 * CodeSentinel API client — typed wrappers for all backend endpoints.
 * Backend: FastAPI at http://localhost:8000
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types matching backend Pydantic models ────────────────────────────────────
export interface SemgrepFinding {
  check_id: string;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO";
  line: number;
  cwe: string[];
  owasp: string[];
}

export interface TriageOutput {
  verdict: "fix" | "clean";
  security_score: number;
  findings_to_fix: SemgrepFinding[];
  reasoning: string;
}

export interface Project {
  id: string;
  name: string;
  prompt: string;
  language: string;
  created_at: string;
  updated_at: string;
  project_dir?: string | null;
  written_at?: string | null;
}

export interface Generation {
  id: string;
  project_id: string;
  code: string;
  security_score: number;
  findings: SemgrepFinding[];
  created_at: string;
}

export interface HealthResponse {
  status: string;
  graph_ready: boolean;
  checkpointer: string;
  langsmith_tracing: boolean;
  langsmith_project: string;
}

export interface PipelineState {
  project_id: string;
  user_prompt: string;
  language: string;
  current_code: string;
  execution_stdout: string;
  execution_stderr: string;
  execution_success: boolean;
  dev_retries: number;
  raw_semgrep_findings: SemgrepFinding[];
  triage_output: TriageOutput | null;
  security_score: number;
  security_iterations: number;
  final_code: string;
  stage_events: Array<{ node: string; message: string }>;
  score_history: number[];
  audit_trail: Array<Record<string, unknown>>;
}

// ── SSE Event Types ───────────────────────────────────────────────────────────
export interface SSENodeStart { node: string }
export interface SSENodeEnd   { node: string; output: Partial<PipelineState> }
export type    SSEDone        = PipelineState;
export interface SSEError     { message: string }

export type SSEEvent =
  | { type: "node_start"; data: SSENodeStart }
  | { type: "node_end";   data: SSENodeEnd }
  | { type: "done";       data: SSEDone }
  | { type: "error";      data: SSEError };

// ── GenerateRequest ───────────────────────────────────────────────────────────
export interface GenerateRequest {
  prompt?: string;
  project_id?: string;
  language?: string;
}

// ── API functions ─────────────────────────────────────────────────────────────
export async function fetchHealth(): Promise<HealthResponse> {
  const r = await fetch(`${BASE}/health`);
  if (!r.ok) throw new Error(`Health check failed: ${r.status}`);
  return r.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const r = await fetch(`${BASE}/api/projects`);
  if (!r.ok) throw new Error(`Projects fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchProject(projectId: string): Promise<Project> {
  const r = await fetch(`${BASE}/api/projects/${projectId}`);
  if (!r.ok) throw new Error(`Project ${projectId} not found`);
  return r.json();
}

export async function fetchGenerations(projectId: string): Promise<Generation[]> {
  const r = await fetch(`${BASE}/api/projects/${projectId}/generations`);
  if (!r.ok) throw new Error(`Generations fetch failed: ${r.status}`);
  return r.json();
}

/**
 * Streams the generate endpoint, parsing SSE lines and calling onEvent per event.
 * Returns a cleanup function (aborts fetch).
 */
export function streamGenerate(
  request: GenerateRequest,
  onEvent: (evt: SSEEvent) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const resp = await fetch(`${BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => `HTTP ${resp.status}`);
        onError(`Backend error ${resp.status}: ${text}`);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              switch (currentEventType) {
                case "node_start":
                  onEvent({ type: "node_start", data: parsed as SSENodeStart });
                  break;
                case "node_end":
                  onEvent({ type: "node_end", data: parsed as SSENodeEnd });
                  break;
                case "done":
                  onEvent({ type: "done", data: parsed as SSEDone });
                  break;
                case "error":
                  onEvent({ type: "error", data: parsed as SSEError });
                  break;
                default:
                  // Fallback: try to detect type from payload shape
                  if (parsed.node && !parsed.output) {
                    onEvent({ type: "node_start", data: parsed });
                  } else if (parsed.node && parsed.output) {
                    onEvent({ type: "node_end", data: parsed });
                  } else if (parsed.final_code !== undefined) {
                    onEvent({ type: "done", data: parsed });
                  } else if (parsed.message) {
                    onEvent({ type: "error", data: parsed });
                  }
              }
              currentEventType = "";
            } catch {
              // skip malformed JSON
            }
          }
        }
      }

      onDone();
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      onError(err instanceof Error ? err.message : String(err));
    }
  })();

  return () => controller.abort();
}

// ── On-Disk Operations ────────────────────────────────────────────────────────
export interface WrittenFile {
  name: string;
  path: string;
  relative_path: string;
  size: number;
}

export interface ProjectFilesResponse {
  project_dir: string | null;
  files: WrittenFile[];
  written: boolean;
  written_at: string | null;
}

export interface WriteProjectResponse {
  project_dir: string;
  written_files: Array<{ path: string; size: number; type: string }>;
  file_count: number;
}

export async function writeProjectToDisk(
  projectId: string,
  code: string,
  outputDir?: string
): Promise<WriteProjectResponse> {
  const r = await fetch(`${BASE}/api/projects/${projectId}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, output_dir: outputDir }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Write failed: ${text}`);
  }
  return r.json();
}

export async function fetchProjectFiles(projectId: string): Promise<ProjectFilesResponse> {
  const r = await fetch(`${BASE}/api/projects/${projectId}/files`);
  if (!r.ok) throw new Error(`Fetch files failed: ${r.status}`);
  return r.json();
}

export async function fetchProjectFileContent(projectId: string, filePath: string): Promise<string> {
  const r = await fetch(`${BASE}/api/projects/${projectId}/files/${encodeURIComponent(filePath)}`);
  if (!r.ok) throw new Error(`Fetch file content failed: ${r.status}`);
  return r.text();
}

export async function openProjectInFinder(projectId: string): Promise<{ success: boolean; message: string }> {
  const r = await fetch(`${BASE}/api/projects/${projectId}/open`, {
    method: "POST",
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Open in Finder failed: ${text}`);
  }
  return r.json();
}

