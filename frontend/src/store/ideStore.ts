"use client";

import { create } from "zustand";

// ── File Tree Types ──────────────────────────────────────────────────────────
export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  content?: string;
  children?: FileNode[];
  isOpen?: boolean;
}

// ── Tab Types ────────────────────────────────────────────────────────────────
export interface Tab {
  id: string;
  fileId: string;
  fileName: string;
  language: string;
  content: string;
  isDirty?: boolean;
}

// ── Pipeline Event Types ─────────────────────────────────────────────────────
export type NodeStatus = "idle" | "running" | "done" | "error";

export interface PipelineEvent {
  id: string;
  type: "node_start" | "node_end" | "done" | "error" | "user" | "system";
  node?: string;
  message: string;
  timestamp: Date;
  data?: unknown;
}

export type PanelTab = "codesentinel" | "terminal" | "output";
export type ActivityView = "explorer" | "search" | "git" | "settings";

// ── Store Interface ──────────────────────────────────────────────────────────
interface IDEStore {
  // Sidebar
  sidebarOpen: boolean;
  activeView: ActivityView;
  fileTree: FileNode[];
  selectedFileId: string | null;
  expandedFolders: Set<string>;

  // Editor Tabs
  tabs: Tab[];
  activeTabId: string | null;

  // Bottom Panel
  panelOpen: boolean;
  activePanelTab: PanelTab;
  panelHeight: number;

  // Pipeline / CLI
  pipelineEvents: PipelineEvent[];
  isStreaming: boolean;
  nodeStatuses: Record<string, NodeStatus>;
  currentPrompt: string;
  securityScore: number | null;
  scoreHistory: number[];

  // Status bar
  gitBranch: string;
  cursorLine: number;
  cursorCol: number;
  language: string;
  errors: number;
  warnings: number;

  // Actions
  toggleSidebar: () => void;
  setActiveView: (view: ActivityView) => void;
  toggleFolder: (id: string) => void;
  openFile: (node: FileNode) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  setPanelOpen: (open: boolean) => void;
  setActivePanelTab: (tab: PanelTab) => void;
  setPanelHeight: (h: number) => void;
  addEvent: (event: Omit<PipelineEvent, "id" | "timestamp">) => void;
  setStreaming: (v: boolean) => void;
  setNodeStatus: (node: string, status: NodeStatus) => void;
  setCurrentPrompt: (p: string) => void;
  setSecurityScore: (score: number) => void;
  setCursor: (line: number, col: number) => void;
  clearEvents: () => void;
}

// ── Mock File Tree Data ──────────────────────────────────────────────────────
const MOCK_FILE_TREE: FileNode[] = [
  {
    id: "backend",
    name: "backend",
    type: "folder",
    isOpen: true,
    children: [
      {
        id: "graph",
        name: "graph",
        type: "folder",
        isOpen: false,
        children: [
          { id: "state.py", name: "state.py", type: "file", language: "python", content: "# LangGraph state definitions\nfrom typing import TypedDict, Annotated\nfrom langgraph.graph import add_messages\n\nclass PipelineState(TypedDict):\n    user_prompt: str\n    language: str\n    current_code: str\n    execution_stdout: str\n    execution_stderr: str\n    execution_success: bool\n    dev_retries: int\n    raw_semgrep_findings: list[dict]\n    security_score: int\n    security_iterations: int\n    final_code: str\n    stage_events: Annotated[list, add_messages]\n    score_history: Annotated[list, add_messages]\n    audit_trail: Annotated[list, add_messages]\n" },
          { id: "nodes.py", name: "nodes.py", type: "file", language: "python", content: "# Node function implementations\nasync def developer_agent(state: PipelineState):\n    \"\"\"Generates Node.js code from user prompt.\"\"\"\n    pass\n\nasync def e2b_execute(state: PipelineState):\n    \"\"\"Runs code in E2B sandbox.\"\"\"\n    pass\n\nasync def semgrep_scan(state: PipelineState):\n    \"\"\"Scans for security vulnerabilities.\"\"\"\n    pass\n" },
          { id: "edges.py", name: "edges.py", type: "file", language: "python", content: "# Conditional routing edges\ndef should_retry_dev(state):\n    return state['dev_retries'] < 3\n\ndef triage_verdict(state):\n    return state['triage_output'].verdict\n" },
          { id: "graph.py", name: "graph.py", type: "file", language: "python", content: "# LangGraph state machine wiring\nfrom langgraph.graph import StateGraph\nfrom .state import PipelineState\nfrom .nodes import *\nfrom .edges import *\n\ndef build_graph():\n    g = StateGraph(PipelineState)\n    g.add_node('developer_agent', developer_agent)\n    g.add_node('e2b_execute', e2b_execute)\n    g.add_node('semgrep_scan', semgrep_scan)\n    # ... conditional edges\n    return g.compile()\n" },
        ],
      },
      {
        id: "tools",
        name: "tools",
        type: "folder",
        isOpen: false,
        children: [
          { id: "e2b_tool.py", name: "e2b_tool.py", type: "file", language: "python", content: "import e2b\n\nasync def execute_nodejs_in_sandbox(code: str) -> dict:\n    \"\"\"Execute Node.js code in E2B microVM.\"\"\"\n    async with e2b.Sandbox() as sbx:\n        result = await sbx.process.start_and_wait(\n            f'node -e \"{code}\"'\n        )\n        return {\n            'stdout': result.stdout,\n            'stderr': result.stderr,\n            'exit_code': result.exit_code,\n        }\n" },
          { id: "semgrep_tool.py", name: "semgrep_tool.py", type: "file", language: "python", content: "import subprocess, json, tempfile\n\ndef run_semgrep(code: str) -> list[dict]:\n    \"\"\"Run Semgrep scan on provided code.\"\"\"\n    with tempfile.NamedTemporaryFile(suffix='.js', mode='w') as f:\n        f.write(code)\n        result = subprocess.run(\n            ['semgrep', 'scan', '--config=auto', '--json', f.name],\n            capture_output=True, text=True\n        )\n    return json.loads(result.stdout).get('results', [])\n" },
        ],
      },
      { id: "main.py", name: "main.py", type: "file", language: "python", content: "from fastapi import FastAPI\nfrom fastapi.middleware.cors import CORSMiddleware\nfrom fastapi.responses import StreamingResponse\nfrom contextlib import asynccontextmanager\nfrom graph.graph import build_graph\nimport json\n\ngraph = None\n\n@asynccontextmanager\nasync def lifespan(app: FastAPI):\n    global graph\n    graph = build_graph()\n    yield\n\napp = FastAPI(lifespan=lifespan)\n\napp.add_middleware(\n    CORSMiddleware,\n    allow_origins=['*'],\n    allow_methods=['*'],\n    allow_headers=['*'],\n)\n\n@app.get('/health')\nasync def health():\n    return {'status': 'ok', 'graph_ready': graph is not None}\n\n@app.post('/api/generate')\nasync def generate(request: dict):\n    async def event_stream():\n        async for event in graph.astream_events(\n            {'user_prompt': request['prompt'], 'language': request.get('language', 'javascript')},\n            version='v2'\n        ):\n            yield f'data: {json.dumps(event)}\\n\\n'\n    return StreamingResponse(\n        event_stream(),\n        media_type='text/event-stream',\n        headers={'X-Accel-Buffering': 'no'},\n    )\n" },
      { id: "requirements.txt", name: "requirements.txt", type: "file", language: "plaintext", content: "fastapi\nuvicorn\nlanggraph\nlangchain-google-genai\ne2b\npydantic\npython-dotenv\nhttpx\n" },
      { id: ".env.example", name: ".env.example", type: "file", language: "plaintext", content: "GOOGLE_API_KEY=\nE2B_API_KEY=\nMAX_DEV_RETRIES=3\nMAX_SEC_ITERATIONS=3\n" },
    ],
  },
  {
    id: "frontend",
    name: "frontend",
    type: "folder",
    isOpen: true,
    children: [
      {
        id: "src",
        name: "src",
        type: "folder",
        isOpen: true,
        children: [
          {
            id: "app",
            name: "app",
            type: "folder",
            isOpen: false,
            children: [
              { id: "page.tsx", name: "page.tsx", type: "file", language: "typescript", content: '// CodeSentinel IDE — Main page\n\nexport default function Home() {\n  return <IDEShell />;\n}\n' },
              { id: "layout.tsx", name: "layout.tsx", type: "file", language: "typescript", content: 'import type { Metadata } from "next";\n\nexport const metadata: Metadata = {\n  title: "CodeSentinel",\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n' },
            ],
          },
          {
            id: "components",
            name: "components",
            type: "folder",
            isOpen: false,
            children: [
              { id: "ActivityBar.tsx", name: "ActivityBar.tsx", type: "file", language: "typescript", content: "// Activity Bar component" },
              { id: "Sidebar.tsx", name: "Sidebar.tsx", type: "file", language: "typescript", content: "// Sidebar component" },
              { id: "Editor.tsx", name: "Editor.tsx", type: "file", language: "typescript", content: "// Editor component" },
              { id: "CliPanel.tsx", name: "CliPanel.tsx", type: "file", language: "typescript", content: "// CLI Panel component" },
            ],
          },
        ],
      },
      { id: "package.json", name: "package.json", type: "file", language: "json", content: '{\n  "name": "codesentinel-frontend",\n  "version": "0.1.0",\n  "private": true,\n  "scripts": {\n    "dev": "next dev",\n    "build": "next build",\n    "start": "next start"\n  }\n}\n' },
    ],
  },
  { id: "agent.md", name: "agent.md", type: "file", language: "markdown", content: "# CodeSentinel — Agentic Code Security Pipeline\n\n## Project Idea\n\nCodeSentinel is a multi-agent DevSecOps pipeline..." },
  { id: ".gitignore", name: ".gitignore", type: "file", language: "plaintext", content: "node_modules/\n.next/\n.env\n__pycache__/\n*.pyc\n" },
];

// ── Default open tab ─────────────────────────────────────────────────────────
const DEFAULT_TABS: Tab[] = [
  {
    id: "tab-main",
    fileId: "main.py",
    fileName: "main.py",
    language: "python",
    content: MOCK_FILE_TREE[0].children!.find(f => f.id === "main.py")!.content!,
    isDirty: false,
  },
  {
    id: "tab-state",
    fileId: "state.py",
    fileName: "state.py",
    language: "python",
    content: MOCK_FILE_TREE[0].children![0].children![0].content!,
    isDirty: false,
  },
];

// ── Store Implementation ─────────────────────────────────────────────────────
export const useIDEStore = create<IDEStore>((set, get) => ({
  // Sidebar
  sidebarOpen: true,
  activeView: "explorer",
  fileTree: MOCK_FILE_TREE,
  selectedFileId: "main.py",
  expandedFolders: new Set(["backend", "frontend", "src", "app"]),

  // Tabs
  tabs: DEFAULT_TABS,
  activeTabId: "tab-main",

  // Panel
  panelOpen: true,
  activePanelTab: "codesentinel",
  panelHeight: 320,

  // Pipeline
  pipelineEvents: [
    {
      id: "sys-0",
      type: "system",
      message: "CodeSentinel ready. Type a requirement below to start the pipeline.",
      timestamp: new Date(),
    },
  ],
  isStreaming: false,
  nodeStatuses: {},
  currentPrompt: "",
  securityScore: null,
  scoreHistory: [],

  // Status bar
  gitBranch: "main",
  cursorLine: 1,
  cursorCol: 1,
  language: "Python",
  errors: 0,
  warnings: 2,

  // ── Actions ──
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
    const lang = node.language ?? "plaintext";
    const newTab: Tab = {
      id: `tab-${node.id}`,
      fileId: node.id,
      fileName: node.name,
      language: lang,
      content: node.content ?? "",
    };
    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id,
      selectedFileId: node.id,
      language: langLabel(lang),
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
    if (tab) {
      set({ activeTabId: tabId, selectedFileId: tab.fileId, language: langLabel(tab.language) });
    }
  },

  updateTabContent: (tabId, content) =>
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, content, isDirty: true } : t),
    })),

  setPanelOpen: (open) => set({ panelOpen: open }),
  setActivePanelTab: (tab) => set({ activePanelTab: tab }),
  setPanelHeight: (h) => set({ panelHeight: h }),

  addEvent: (event) =>
    set(s => ({
      pipelineEvents: [
        ...s.pipelineEvents,
        { ...event, id: `evt-${Date.now()}-${Math.random()}`, timestamp: new Date() },
      ],
    })),

  setStreaming: (v) => set({ isStreaming: v }),

  setNodeStatus: (node, status) =>
    set(s => ({ nodeStatuses: { ...s.nodeStatuses, [node]: status } })),

  setCurrentPrompt: (p) => set({ currentPrompt: p }),

  setSecurityScore: (score) =>
    set(s => ({
      securityScore: score,
      scoreHistory: [...s.scoreHistory, score],
    })),

  setCursor: (line, col) => set({ cursorLine: line, cursorCol: col }),

  clearEvents: () => set({ pipelineEvents: [], nodeStatuses: {}, securityScore: null, scoreHistory: [] }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function langLabel(lang: string): string {
  const map: Record<string, string> = {
    python: "Python",
    typescript: "TypeScript",
    javascript: "JavaScript",
    json: "JSON",
    css: "CSS",
    html: "HTML",
    markdown: "Markdown",
    plaintext: "Plain Text",
  };
  return map[lang] ?? lang;
}
