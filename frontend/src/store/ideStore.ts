"use client";

import { create } from "zustand";
import {
  Project,
  SemgrepFinding,
  fetchProjects,
  fetchProject,
  fetchGenerations,
} from "@/lib/api";
import { getFileName, LANG_EXT, getLanguageLabel } from "@/lib/languages";

// ── Re-export backend types so components have a single import source ─────────
export type { Project, SemgrepFinding };

// ── File Tree Types ───────────────────────────────────────────────────────────
export interface FileNode {
  id:        string;
  name:      string;
  type:      "file" | "folder";
  language?: string;
  content?:  string;
  children?: FileNode[];
  isOpen?:   boolean;
  isLive?:   boolean; // marks the live-preview tab/node during streaming
}

// ── Tab Types ─────────────────────────────────────────────────────────────────
export interface Tab {
  id:        string;
  fileId:    string;
  fileName:  string;
  language:  string;
  content:   string;
  isDirty?:  boolean;
  isLive?:   boolean; // live-preview tab — replaced when pipeline finishes
}

// ── Pipeline Types ────────────────────────────────────────────────────────────
export type NodeStatus = "idle" | "running" | "done" | "error";

export interface PipelineEvent {
  id:        string;
  type:      "node_start" | "node_end" | "done" | "error" | "user" | "system";
  node?:     string;
  message:   string;
  timestamp: Date;
  data?:     unknown;
}

export interface AuditSnapshot {
  iteration: number;
  code:      string;
  score:     number;
  findings:  SemgrepFinding[];
}

export interface CreateProjectParams {
  projectId:     string;
  prompt:        string;
  language:      string;
  finalCode:     string;
  auditTrail:    AuditSnapshot[];
  scoreHistory:  number[];
  securityScore: number;
  verdict:       string;
  reasoning:     string;
  findings:      SemgrepFinding[];
}

export type PanelTab    = "codesentinel" | "terminal" | "output" | "audit";
export type ActivityView = "explorer" | "search" | "git" | "settings";

// ── Store Interface ───────────────────────────────────────────────────────────
interface IDEStore {
  // Sidebar
  sidebarOpen:      boolean;
  activeView:       ActivityView;
  fileTree:         FileNode[];
  selectedFileId:   string | null;
  expandedFolders:  Set<string>;

  // Projects (loaded from backend)
  projects:         Project[];
  activeProjectId:  string | null;

  // Editor Tabs
  tabs:         Tab[];
  activeTabId:  string | null;

  // Live streaming preview
  liveCode:     string;
  liveLanguage: string;

  // Pending scan request (set by EditorZone "Analyze" button)
  scanRequest: { code: string; language: string } | null;

  // Bottom Panel
  panelOpen:        boolean;
  activePanelTab:   PanelTab;
  panelHeight:      number;

  // Pipeline
  pipelineEvents:  PipelineEvent[];
  isStreaming:     boolean;
  nodeStatuses:    Record<string, NodeStatus>;
  currentPrompt:   string;
  currentLanguage: string;
  securityScore:   number | null;
  scoreHistory:    number[];
  auditTrail:      AuditSnapshot[];

  // Status bar
  gitBranch:  string;
  cursorLine: number;
  cursorCol:  number;
  language:   string;
  errors:     number;
  warnings:   number;

  // ── UI Actions ──────────────────────────────────────────────────────────────
  toggleSidebar:      () => void;
  setActiveView:      (view: ActivityView) => void;
  toggleFolder:       (id: string) => void;
  openFile:           (node: FileNode) => void;
  closeTab:           (tabId: string) => void;
  setActiveTab:       (tabId: string) => void;
  updateTabContent:   (tabId: string, content: string) => void;
  setPanelOpen:       (open: boolean) => void;
  setActivePanelTab:  (tab: PanelTab) => void;
  setPanelHeight:     (h: number) => void;
  addEvent:           (event: Omit<PipelineEvent, "id" | "timestamp">) => void;
  setStreaming:        (v: boolean) => void;
  setNodeStatus:      (node: string, status: NodeStatus) => void;
  setCurrentPrompt:   (p: string) => void;
  setCurrentLanguage: (lang: string) => void;
  setSecurityScore:   (score: number) => void;
  setCursor:          (line: number, col: number) => void;
  clearEvents:        () => void;

  // ── Project Actions ─────────────────────────────────────────────────────────
  loadProjects:        () => Promise<void>;
  createProjectFiles:  (params: CreateProjectParams) => void;
  updateLiveCode:      (code: string, language: string) => void;
  switchProject:       (projectId: string) => Promise<void>;
  appendAuditSnapshot: (snapshot: AuditSnapshot) => void;
  setAuditTrail:       (trail: AuditSnapshot[]) => void;
  setScanRequest:      (req: { code: string; language: string } | null) => void;
}

// ── Pure Helpers ──────────────────────────────────────────────────────────────

function langLabel(lang: string): string {
  const map: Record<string, string> = {
    python:     "Python",
    typescript: "TypeScript",
    javascript: "JavaScript",
    json:       "JSON",
    css:        "CSS",
    html:       "HTML",
    markdown:   "Markdown",
    plaintext:  "Plain Text",
    go:         "Go",
    rust:       "Rust",
    java:       "Java",
    cpp:        "C++",
    ruby:       "Ruby",
  };
  return map[lang.toLowerCase()] ?? getLanguageLabel(lang);
}

function generateSecurityReport(params: CreateProjectParams): string {
  const {
    projectId, prompt, language, finalCode,
    scoreHistory, securityScore, verdict, reasoning, findings,
  } = params;

  const timestamp  = new Date().toLocaleString();
  const scoreTrail = scoreHistory.length > 0
    ? scoreHistory.join(" → ")
    : String(securityScore);

  const findingsText = findings.length > 0
    ? findings
        .map(f => `- **${f.severity}** \`${f.check_id}\`: ${f.message} (line ${f.line})`)
        .join("\n")
    : "_No vulnerabilities found._";

  const cwes   = [...new Set(findings.flatMap(f => f.cwe))];
  const owasps = [...new Set(findings.flatMap(f => f.owasp))];

  return `# Security Audit Report

**Project**: \`${projectId}\`
**Generated**: ${timestamp}
**Language**: ${language}
**Final Score**: ${securityScore}/100
**Verdict**: ${verdict === "clean" ? "✅ Clean" : "⚠️ Fixed"}

---

## Requirement

${prompt}

---

## Score History

${scoreTrail}

---

## Triage Reasoning

${reasoning || "_No reasoning provided._"}

---

## Vulnerabilities Fixed

${findingsText}
${cwes.length > 0 ? `\n---\n\n## CWE References\n\n${cwes.join(", ")}\n` : ""}${owasps.length > 0 ? `\n---\n\n## OWASP Categories\n\n${owasps.join(", ")}\n` : ""}

---

## Final Secure Code

\`\`\`${language}
${finalCode}
\`\`\`
`;
}

function buildProjectTree(params: CreateProjectParams): FileNode {
  const { projectId, language, finalCode, auditTrail, scoreHistory } = params;
  const codeName     = getFileName(language);
  const reportContent = generateSecurityReport(params);
  const langKey      = language.toLowerCase();
  const cmLang       = LANG_EXT[langKey] ? langKey : "plaintext";

  return {
    id:     projectId,
    name:   projectId,
    type:   "folder",
    isOpen: true,
    children: [
      {
        id:       `${projectId}/${codeName}`,
        name:     codeName,
        type:     "file",
        language: cmLang,
        content:  finalCode,
      },
      {
        id:       `${projectId}/security_report.md`,
        name:     "security_report.md",
        type:     "file",
        language: "markdown",
        content:  reportContent,
      },
      {
        id:       `${projectId}/.sentinel`,
        name:     ".sentinel",
        type:     "folder",
        isOpen:   false,
        children: [
          {
            id:       `${projectId}/.sentinel/audit_trail.json`,
            name:     "audit_trail.json",
            type:     "file",
            language: "json",
            content:  JSON.stringify(auditTrail, null, 2),
          },
          {
            id:       `${projectId}/.sentinel/score_history.json`,
            name:     "score_history.json",
            type:     "file",
            language: "json",
            content:  JSON.stringify(scoreHistory, null, 2),
          },
        ],
      },
    ],
  };
}

const LIVE_TAB_ID = "tab-live-preview";

// ── Store Implementation ──────────────────────────────────────────────────────
export const useIDEStore = create<IDEStore>((set, get) => ({
  // Sidebar
  sidebarOpen:     true,
  activeView:      "explorer",
  fileTree:        [],
  selectedFileId:  null,
  expandedFolders: new Set<string>(),

  // Projects
  projects:        [],
  activeProjectId: null,

  // Tabs
  tabs:        [],
  activeTabId: null,

  // Live streaming
  liveCode:     "",
  liveLanguage: "javascript",

  // Scan request from EditorZone
  scanRequest: null,

  // Panel
  panelOpen:       true,
  activePanelTab:  "codesentinel",
  panelHeight:     320,

  // Pipeline
  pipelineEvents: [
    {
      id:        "sys-0",
      type:      "system",
      message:   "CodeSentinel ready. Type a requirement below to start the pipeline.",
      timestamp: new Date(),
    },
  ],
  isStreaming:     false,
  nodeStatuses:    {},
  currentPrompt:   "",
  currentLanguage: "javascript",
  securityScore:   null,
  scoreHistory:    [],
  auditTrail:      [],

  // Status bar
  gitBranch:  "main",
  cursorLine: 1,
  cursorCol:  1,
  language:   "JavaScript",
  errors:     0,
  warnings:   0,

  // ── UI Actions ──────────────────────────────────────────────────────────────
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),

  setActiveView: (view) =>
    set(s => ({
      activeView:  view,
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
    const lang   = node.language ?? "plaintext";
    const newTab: Tab = {
      id:       `tab-${node.id}`,
      fileId:   node.id,
      fileName: node.name,
      language: lang,
      content:  node.content ?? "",
    };
    set({
      tabs:           [...tabs, newTab],
      activeTabId:    newTab.id,
      selectedFileId: node.id,
      language:       langLabel(lang),
    });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx     = tabs.findIndex(t => t.id === tabId);
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

  setPanelOpen:      (open) => set({ panelOpen: open }),
  setActivePanelTab: (tab)  => set({ activePanelTab: tab }),
  setPanelHeight:    (h)    => set({ panelHeight: h }),

  addEvent: (event) =>
    set(s => ({
      pipelineEvents: [
        ...s.pipelineEvents,
        { ...event, id: `evt-${Date.now()}-${Math.random()}`, timestamp: new Date() },
      ],
    })),

  setStreaming:        (v)           => set({ isStreaming: v }),
  setNodeStatus:      (node, status) => set(s => ({ nodeStatuses: { ...s.nodeStatuses, [node]: status } })),
  setCurrentPrompt:   (p)            => set({ currentPrompt: p }),
  setCurrentLanguage: (lang)         => set({ currentLanguage: lang }),

  setSecurityScore: (score) =>
    set(s => ({
      securityScore: score,
      scoreHistory:  [...s.scoreHistory, score],
    })),

  setCursor: (line, col) => {
    const { cursorLine, cursorCol } = get();
    if (cursorLine !== line || cursorCol !== col) {
      set({ cursorLine: line, cursorCol: col });
    }
  },

  clearEvents: () =>
    set({
      pipelineEvents: [],
      nodeStatuses:   {},
      securityScore:  null,
      scoreHistory:   [],
      auditTrail:     [],
    }),

  // ── Project Actions ─────────────────────────────────────────────────────────

  loadProjects: async () => {
    try {
      const projects = await fetchProjects();
      set({ projects });
    } catch {
      // Backend not running — show empty state gracefully
      set({ projects: [] });
    }
  },

  createProjectFiles: (params) => {
    const { projectId, language, finalCode, auditTrail, scoreHistory } = params;
    const codeName     = getFileName(language);
    const codeTabId    = `tab-${projectId}-code`;
    const reportTabId  = `tab-${projectId}-report`;
    const reportContent = generateSecurityReport(params);
    const langKey      = language.toLowerCase();
    const projectNode  = buildProjectTree(params);

    set(s => {
      // Replace existing project folder or append new one
      const existingIdx = s.fileTree.findIndex(n => n.id === projectId);
      const newTree = existingIdx >= 0
        ? s.fileTree.map((n, i) => i === existingIdx ? projectNode : n)
        : [...s.fileTree, projectNode];

      // Remove live-preview tab, deduplicate project tabs
      const baseTabs = s.tabs.filter(t => !t.isLive && t.id !== codeTabId && t.id !== reportTabId);

      const codeTab: Tab = {
        id:       codeTabId,
        fileId:   `${projectId}/${codeName}`,
        fileName: codeName,
        language: langKey,
        content:  finalCode,
        isDirty:  false,
      };
      const reportTab: Tab = {
        id:       reportTabId,
        fileId:   `${projectId}/security_report.md`,
        fileName: "security_report.md",
        language: "markdown",
        content:  reportContent,
        isDirty:  false,
      };

      // Auto-expand the new project folder
      const newExpanded = new Set(s.expandedFolders);
      newExpanded.add(projectId);

      return {
        fileTree:        newTree,
        tabs:            [...baseTabs, codeTab, reportTab],
        activeTabId:     codeTabId,
        activeProjectId: projectId,
        selectedFileId:  `${projectId}/${codeName}`,
        expandedFolders: newExpanded,
        language:        langLabel(langKey),
        liveCode:        finalCode,
        liveLanguage:    langKey,
        auditTrail,
        scoreHistory,
      };
    });
  },

  updateLiveCode: (code, language) => {
    const langKey  = language.toLowerCase();
    const ext      = LANG_EXT[langKey] ?? "txt";
    const fileName = `generating.${ext}`;

    set(s => {
      const existingLive = s.tabs.find(t => t.isLive);
      if (existingLive) {
        return {
          liveCode:     code,
          liveLanguage: langKey,
          tabs: s.tabs.map(t =>
            t.isLive ? { ...t, content: code, fileName, language: langKey } : t
          ),
        };
      }

      const liveTab: Tab = {
        id:       LIVE_TAB_ID,
        fileId:   "live-preview",
        fileName,
        language: langKey,
        content:  code,
        isLive:   true,
      };

      return {
        liveCode:     code,
        liveLanguage: langKey,
        tabs:         [...s.tabs, liveTab],
        activeTabId:  LIVE_TAB_ID,
      };
    });
  },

  switchProject: async (projectId) => {
    // Immediately mark as active so the UI reflects selection
    set({ activeProjectId: projectId });

    try {
      const [project, generations] = await Promise.all([
        fetchProject(projectId),
        fetchGenerations(projectId),
      ]);

      if (generations.length === 0) {
        // Project exists but no generations saved yet — show an empty placeholder
        const placeholderNode: FileNode = {
          id:     projectId,
          name:   projectId,
          type:   "folder",
          isOpen: true,
          children: [
            {
              id:       `${projectId}/README.md`,
              name:     "README.md",
              type:     "file",
              language: "markdown",
              content:  `# ${projectId}\n\n**Language**: ${project.language}\n\n**Prompt**: ${project.prompt}\n\n_No completed generations yet. Run the pipeline to generate code._`,
            },
          ],
        };

        set(s => {
          const existingIdx = s.fileTree.findIndex(n => n.id === projectId);
          const newTree = existingIdx >= 0
            ? s.fileTree.map((n, i) => i === existingIdx ? placeholderNode : n)
            : [...s.fileTree, placeholderNode];
          const newExpanded = new Set(s.expandedFolders);
          newExpanded.add(projectId);

          const readmeTab: Tab = {
            id:       `tab-${projectId}-readme`,
            fileId:   `${projectId}/README.md`,
            fileName: "README.md",
            language: "markdown",
            content:  placeholderNode.children![0].content!,
          };
          const baseTabs = s.tabs.filter(t => t.id !== readmeTab.id);

          return {
            fileTree:        newTree,
            expandedFolders: newExpanded,
            tabs:            [...baseTabs, readmeTab],
            activeTabId:     readmeTab.id,
            selectedFileId:  `${projectId}/README.md`,
          };
        });
        return;
      }

      // Best = highest security_score; newest as tiebreaker
      const best = [...generations].sort(
        (a, b) => b.security_score - a.security_score || b.created_at.localeCompare(a.created_at)
      )[0];

      // Score history oldest→newest
      const scoreHistory = [...generations]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(g => g.security_score);

      get().createProjectFiles({
        projectId,
        prompt:        project.prompt,
        language:      project.language,
        finalCode:     best.code,
        auditTrail:    [],
        scoreHistory,
        securityScore: best.security_score,
        verdict:       best.security_score === 100 ? "clean" : "fix",
        reasoning:     `Loaded from saved generation (score: ${best.security_score}/100).`,
        findings:      best.findings ?? [],
      });
    } catch (e) {
      console.error("switchProject failed:", e);
      // Surface the error in the pipeline log so the user sees it
      get().addEvent({
        type:    "error",
        message: `Could not load project "${projectId}": ${e instanceof Error ? e.message : String(e)}. Is the backend running?`,
      });
      get().setPanelOpen(true);
      get().setActivePanelTab("codesentinel");
    }
  },

  appendAuditSnapshot: (snapshot) =>
    set(s => ({ auditTrail: [...s.auditTrail, snapshot] })),

  setAuditTrail: (trail) => set({ auditTrail: trail }),

  setScanRequest: (req) => set({ scanRequest: req }),
}));
