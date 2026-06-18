"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Project,
  Generation,
  TriageOutput,
  SemgrepFinding,
  PipelineState,
} from "@/lib/api";

// ── File Tree ─────────────────────────────────────────────────────────────────
export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  content?: string;
  children?: FileNode[];
}

// ── Tab ───────────────────────────────────────────────────────────────────────
export interface Tab {
  id: string;
  fileId: string;
  fileName: string;
  language: string;
  content: string;
  isDirty?: boolean;
}

// ── Chat message (one message in a session) ───────────────────────────────────
export type ChatRole = "user" | "agent" | "system" | "node_start" | "node_end" | "done" | "error" | "cache";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  node?: string;
  timestamp: string; // ISO
  nodeStatus?: "running" | "done" | "error";
  codeBlock?: string;
  scoreHistory?: number[];
}

// ── Chat Session (= one pipeline run, tied to a project) ─────────────────────
export interface ChatSession {
  id: string;                    // project_id
  projectName: string;
  prompt: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  finalCode?: string;
  finalScore?: number;
  scoreHistory?: number[];
  triageOutput?: TriageOutput;
  findings?: SemgrepFinding[];
  executionStdout?: string;
  executionStderr?: string;
  executionSuccess?: boolean;
  devRetries?: number;
  securityIterations?: number;
  auditTrail?: Array<Record<string, unknown>>;
  // From backend Project record (loaded from API)
  backendProject?: Project;
  generations?: Generation[];
}

// ── Node status ───────────────────────────────────────────────────────────────
export type NodeStatus = "idle" | "running" | "done" | "error";

// ── Panel / view types ────────────────────────────────────────────────────────
export type PanelTab     = "codesentinel" | "terminal" | "output" | "findings";
export type ActivityView = "explorer" | "history" | "git" | "settings";

// ── Backend health ────────────────────────────────────────────────────────────
export interface BackendHealth {
  status: string;
  graph_ready: boolean;
  checkpointer: string;
  langsmith_tracing: boolean;
  langsmith_project: string;
}

// ── Store interface ───────────────────────────────────────────────────────────
interface IDEStore {
  // Sidebar
  sidebarOpen: boolean;
  activeView: ActivityView;
  fileTree: FileNode[];
  selectedFileId: string | null;
  expandedFolders: Set<string>;

  // Tabs
  tabs: Tab[];
  activeTabId: string | null;

  // Panel
  panelOpen: boolean;
  activePanelTab: PanelTab;
  panelHeight: number;

  // ── Chat sessions (persisted) ──
  sessions: ChatSession[];
  activeSessionId: string | null;

  // ── Active pipeline run state (transient) ──
  isStreaming: boolean;
  nodeStatuses: Record<string, NodeStatus>;
  currentPrompt: string;
  currentLanguage: string;

  // Backend health
  backendHealth: BackendHealth | null;
  backendOnline: boolean;

  // Status bar
  gitBranch: string;
  cursorLine: number;
  cursorCol: number;
  language: string;
  errors: number;
  warnings: number;

  // ── Actions ──
  toggleSidebar: () => void;
  setActiveView: (v: ActivityView) => void;
  toggleFolder: (id: string) => void;
  openFile: (node: FileNode) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  openGeneratedCodeTab: (code: string, language: string, projectId: string) => void;

  setPanelOpen: (v: boolean) => void;
  setActivePanelTab: (t: PanelTab) => void;
  setPanelHeight: (h: number) => void;

  // Session / history
  createSession: (prompt: string, language: string) => ChatSession;
  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  loadSessionFromBackend: (project: Project, generations?: Generation[]) => void;
  deleteSession: (sessionId: string) => void;

  // Pipeline
  setStreaming: (v: boolean) => void;
  setNodeStatus: (node: string, status: NodeStatus) => void;
  resetNodeStatuses: () => void;
  setCurrentPrompt: (p: string) => void;
  setCurrentLanguage: (l: string) => void;
  applyDoneState: (sessionId: string, state: PipelineState) => void;

  // Status bar
  setCursor: (line: number, col: number) => void;
  setLanguage: (l: string) => void;

  // Health
  setBackendHealth: (h: BackendHealth | null) => void;
  setBackendOnline: (v: boolean) => void;
}

// ── Mock file tree (CodeSentinel project structure) ───────────────────────────
const MOCK_FILE_TREE: FileNode[] = [
  {
    id: "backend",
    name: "backend",
    type: "folder",
    children: [
      {
        id: "graph",
        name: "graph",
        type: "folder",
        children: [
          { id: "state.py",  name: "state.py",  type: "file", language: "python", content: `from typing import TypedDict, List, Optional
from typing_extensions import Annotated
import operator
from pydantic import BaseModel, Field

class SemgrepFinding(BaseModel):
    check_id: str
    message: str
    severity: str
    line: int
    cwe: List[str] = []
    owasp: List[str] = []

class TriageOutput(BaseModel):
    verdict: str
    security_score: int
    findings_to_fix: List[SemgrepFinding] = []
    reasoning: str

class PipelineState(TypedDict):
    project_id: Optional[str]
    user_prompt: str
    language: str
    current_code: str
    execution_stdout: str
    execution_stderr: str
    execution_success: bool
    dev_retries: int
    raw_semgrep_findings: List[dict]
    triage_output: Optional[TriageOutput]
    security_score: int
    security_iterations: int
    final_code: str
    stage_events: Annotated[List[dict], operator.add]
    score_history: Annotated[List[int], operator.add]
    audit_trail: Annotated[List[dict], operator.add]
` },
          { id: "nodes.py",  name: "nodes.py",  type: "file", language: "python", content: `# LangGraph node implementations
# developer_agent → e2b_execute → semgrep_scan
# → triage_agent → synthesizer_agent → e2b_verify → finalize` },
          { id: "edges.py",  name: "edges.py",  type: "file", language: "python", content: `def route_after_dev_execute(state):
    if state["execution_success"] or state["dev_retries"] >= 3:
        return "semgrep_scan"
    return "developer_agent"

def route_after_triage(state):
    triage = state.get("triage_output")
    if triage and triage.verdict == "clean":
        return "finalize"
    return "synthesizer_agent"` },
          { id: "graph.py",  name: "graph.py",  type: "file", language: "python", content: `from langgraph.graph import StateGraph
from .state import PipelineState

def build_graph(checkpointer=None):
    g = StateGraph(PipelineState)
    # Add nodes and conditional edges
    return g.compile(checkpointer=checkpointer)` },
        ],
      },
      {
        id: "tools",
        name: "tools",
        type: "folder",
        children: [
          { id: "e2b_tool.py",     name: "e2b_tool.py",     type: "file", language: "python", content: "# E2B sandbox executor\nasync def execute_nodejs_in_sandbox(code: str) -> dict: ..." },
          { id: "semgrep_tool.py", name: "semgrep_tool.py", type: "file", language: "python", content: "# Semgrep static analysis runner\ndef run_semgrep(code: str) -> list[dict]: ..." },
        ],
      },
      { id: "main.py",          name: "main.py",          type: "file", language: "python", content: "# FastAPI app — POST /api/generate (SSE)\n# GET /api/projects, /api/projects/{id}, /api/projects/{id}/generations" },
      { id: "database.py",      name: "database.py",      type: "file", language: "python", content: "# SQLite / Postgres dual-layer memory\n# Tables: projects, generations (with embedding vectors)" },
      { id: "embeddings.py",    name: "embeddings.py",    type: "file", language: "python", content: "# Text-embedding-3-large for semantic cache" },
      { id: "requirements.txt", name: "requirements.txt", type: "file", language: "plaintext", content: "fastapi\nuvicorn\nlanggraph\nlangchain-google-genai\ne2b\npydantic\npython-dotenv\nhttpx\npsycopg[binary]" },
    ],
  },
  {
    id: "frontend",
    name: "frontend",
    type: "folder",
    children: [
      {
        id: "src",
        name: "src",
        type: "folder",
        children: [
          { id: "ideStore.ts", name: "ideStore.ts", type: "file", language: "typescript", content: "// Zustand IDE store — sessions, tabs, pipeline state" },
          { id: "api.ts",      name: "api.ts",      type: "file", language: "typescript", content: "// Typed API client for all backend endpoints" },
        ],
      },
      { id: "package.json", name: "package.json", type: "file", language: "json", content: '{\n  "name": "codesentinel-frontend",\n  "version": "0.2.0"\n}' },
    ],
  },
  { id: "agent.md",    name: "agent.md",    type: "file", language: "markdown", content: "# CodeSentinel — Agentic Code Security Pipeline" },
  { id: ".gitignore",  name: ".gitignore",  type: "file", language: "plaintext", content: "node_modules/\n.next/\n.env\n__pycache__/" },
];

// ── Helper ────────────────────────────────────────────────────────────────────
function langLabel(lang: string): string {
  const m: Record<string, string> = {
    python: "Python", typescript: "TypeScript", javascript: "JavaScript",
    json: "JSON", css: "CSS", html: "HTML", markdown: "Markdown", plaintext: "Plain Text",
  };
  return m[lang] ?? lang;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useIDEStore = create<IDEStore>()(
  persist(
    (set, get) => ({
      // ── Sidebar ──
      sidebarOpen: true,
      activeView: "explorer",
      fileTree: MOCK_FILE_TREE,
      selectedFileId: null,
      expandedFolders: new Set(["backend", "graph", "frontend"]),

      // ── Tabs ──
      tabs: [],
      activeTabId: null,

      // ── Panel ──
      panelOpen: true,
      activePanelTab: "codesentinel",
      panelHeight: 340,

      // ── Sessions (chat history) ──
      sessions: [],
      activeSessionId: null,

      // ── Pipeline transient ──
      isStreaming: false,
      nodeStatuses: {},
      currentPrompt: "",
      currentLanguage: "javascript",

      // ── Health ──
      backendHealth: null,
      backendOnline: false,

      // ── Status bar ──
      gitBranch: "main",
      cursorLine: 1,
      cursorCol: 1,
      language: "Python",
      errors: 0,
      warnings: 0,

      // ── Sidebar actions ──
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      setActiveView: (view) =>
        set(s => ({
          activeView: view,
          sidebarOpen: s.activeView === view ? !s.sidebarOpen : true,
        })),
      toggleFolder: (id) =>
        set(s => {
          const next = new Set(s.expandedFolders);
          next.has(id) ? next.delete(id) : next.add(id);
          return { expandedFolders: next };
        }),

      openFile: (node) => {
        const { tabs } = get();
        const existing = tabs.find(t => t.fileId === node.id);
        if (existing) {
          set({ activeTabId: existing.id, selectedFileId: node.id });
          return;
        }
        const newTab: Tab = {
          id: `tab-${node.id}`,
          fileId: node.id,
          fileName: node.name,
          language: node.language ?? "plaintext",
          content: node.content ?? "",
        };
        set({
          tabs: [...tabs, newTab],
          activeTabId: newTab.id,
          selectedFileId: node.id,
          language: langLabel(node.language ?? "plaintext"),
        });
      },

      closeTab: (tabId) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex(t => t.id === tabId);
        const newTabs = tabs.filter(t => t.id !== tabId);
        let newActive = activeTabId;
        if (activeTabId === tabId) {
          newActive = newTabs[Math.max(0, idx - 1)]?.id ?? null;
        }
        set({ tabs: newTabs, activeTabId: newActive });
      },

      setActiveTab: (tabId) => {
        const { tabs } = get();
        const tab = tabs.find(t => t.id === tabId);
        if (tab) set({ activeTabId: tabId, selectedFileId: tab.fileId, language: langLabel(tab.language) });
      },

      updateTabContent: (tabId, content) =>
        set(s => ({
          tabs: s.tabs.map(t => t.id === tabId ? { ...t, content, isDirty: true } : t),
        })),

      // Opens / updates a "generated code" tab with the result from the pipeline
      openGeneratedCodeTab: (code, language, projectId) => {
        const { tabs } = get();
        const tabId = `tab-gen-${projectId}`;
        const fileName = `generated.${language === "javascript" ? "js" : language === "python" ? "py" : "ts"}`;
        const existing = tabs.find(t => t.id === tabId);
        if (existing) {
          set({
            tabs: tabs.map(t => t.id === tabId ? { ...t, content: code, isDirty: false } : t),
            activeTabId: tabId,
          });
        } else {
          const newTab: Tab = { id: tabId, fileId: tabId, fileName, language, content: code };
          set({ tabs: [...tabs, newTab], activeTabId: tabId, language: langLabel(language) });
        }
      },

      // ── Panel ──
      setPanelOpen: (v) => set({ panelOpen: v }),
      setActivePanelTab: (t) => set({ activePanelTab: t }),
      setPanelHeight: (h) => set({ panelHeight: h }),

      // ── Sessions ──
      createSession: (prompt, language) => {
        const id = `project_${makeId()}`;
        const session: ChatSession = {
          id,
          projectName: `Project ${id.slice(-6)}`,
          prompt,
          language,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            {
              id: makeId(),
              role: "system",
              content: "CodeSentinel pipeline started.",
              timestamp: new Date().toISOString(),
            },
          ],
        };
        set(s => ({ sessions: [session, ...s.sessions], activeSessionId: id }));
        return session;
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id, activePanelTab: "codesentinel" });
        // If session has final code, open it
        const { sessions, openGeneratedCodeTab } = get();
        const session = sessions.find(s => s.id === id);
        if (session?.finalCode) {
          openGeneratedCodeTab(session.finalCode, session.language, id);
        }
      },

      addMessage: (sessionId, msg) => {
        const full: ChatMessage = {
          ...msg,
          id: makeId(),
          timestamp: new Date().toISOString(),
        };
        set(s => ({
          sessions: s.sessions.map(sess =>
            sess.id === sessionId
              ? { ...sess, messages: [...sess.messages, full], updatedAt: new Date().toISOString() }
              : sess
          ),
        }));
      },

      updateSession: (sessionId, updates) =>
        set(s => ({
          sessions: s.sessions.map(sess =>
            sess.id === sessionId ? { ...sess, ...updates, updatedAt: new Date().toISOString() } : sess
          ),
        })),

      loadSessionFromBackend: (project, generations) => {
        const { sessions } = get();
        const exists = sessions.find(s => s.id === project.id);
        const session: ChatSession = {
          id: project.id,
          projectName: project.name,
          prompt: project.prompt,
          language: project.language,
          createdAt: project.created_at,
          updatedAt: project.updated_at,
          messages: exists?.messages ?? [
            {
              id: makeId(),
              role: "user",
              content: project.prompt,
              timestamp: project.created_at,
            },
          ],
          backendProject: project,
          generations,
          finalCode: generations?.[0]?.code,
          finalScore: generations?.[0]?.security_score,
          findings: generations?.[0]?.findings,
        };
        set(s => ({
          sessions: exists
            ? s.sessions.map(sess => sess.id === project.id ? { ...sess, backendProject: project, generations } : sess)
            : [session, ...s.sessions],
        }));
      },

      deleteSession: (sessionId) =>
        set(s => ({
          sessions: s.sessions.filter(sess => sess.id !== sessionId),
          activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
        })),

      // ── Pipeline ──
      setStreaming: (v) => set({ isStreaming: v }),
      setNodeStatus: (node, status) =>
        set(s => ({ nodeStatuses: { ...s.nodeStatuses, [node]: status } })),
      resetNodeStatuses: () => set({ nodeStatuses: {} }),
      setCurrentPrompt: (p) => set({ currentPrompt: p }),
      setCurrentLanguage: (l) => set({ currentLanguage: l }),

      // Apply the final `done` state to a session
      applyDoneState: (sessionId, state) => {
        const { openGeneratedCodeTab } = get();
        if (state.final_code) {
          openGeneratedCodeTab(state.final_code, state.language ?? "javascript", sessionId);
        }
        set(s => ({
          sessions: s.sessions.map(sess =>
            sess.id === sessionId ? {
              ...sess,
              finalCode: state.final_code || state.current_code,
              finalScore: state.security_score,
              scoreHistory: state.score_history,
              triageOutput: state.triage_output ?? undefined,
              findings: state.raw_semgrep_findings,
              executionStdout: state.execution_stdout,
              executionStderr: state.execution_stderr,
              executionSuccess: state.execution_success,
              devRetries: state.dev_retries,
              securityIterations: state.security_iterations,
              auditTrail: state.audit_trail,
              updatedAt: new Date().toISOString(),
            } : sess
          ),
          warnings: state.raw_semgrep_findings?.filter(f => f.severity === "WARNING").length ?? 0,
          errors: state.raw_semgrep_findings?.filter(f => f.severity === "ERROR").length ?? 0,
        }));
      },

      // ── Status bar ──
      setCursor: (line, col) => set({ cursorLine: line, cursorCol: col }),
      setLanguage: (l) => set({ language: l }),

      // ── Health ──
      setBackendHealth: (h) => set({ backendHealth: h }),
      setBackendOnline: (v) => set({ backendOnline: v }),
    }),
    {
      name: "codesentinel-ide",
      // Only persist sessions (chat history) + ui prefs; exclude transient pipeline state
      partialize: (s) => ({
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        sidebarOpen: s.sidebarOpen,
        panelHeight: s.panelHeight,
        gitBranch: s.gitBranch,
        expandedFolders: Array.from(s.expandedFolders),
      }),
      // Rehydrate expandedFolders Set from array
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray((state as { expandedFolders: unknown }).expandedFolders)) {
          state.expandedFolders = new Set((state as { expandedFolders: string[] }).expandedFolders as string[]);
        }
      },
    }
  )
);
