"use client";

import { create } from "zustand";
import {
  Project,
  SemgrepFinding,
  fetchProjects,
  fetchProject,
  fetchGenerations,
  deleteProject as apiDeleteProject,
} from "@/lib/api";
import { getFileName, LANG_EXT, getLanguageLabel } from "@/lib/languages";
import { API_BASE } from "@/lib/config";

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
  createProject:       (projectId: string, language: string) => Promise<void>;
  createFile:          (projectId: string, filePath: string, content: string) => Promise<void>;
  saveFileContent:     (projectId: string, filePath: string, content: string) => Promise<void>;
  saveChatHistory:     (projectId: string) => Promise<void>;
  createProjectFiles:  (params: CreateProjectParams) => void;
  updateLiveCode:      (code: string, language: string) => void;
  switchProject:       (projectId: string) => Promise<void>;
  deleteProject:       (projectId: string) => Promise<void>;
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
        .map(f => `- **${f.severity}** \`${f.check_id}\`${f.path ? ` in \`${f.path}\`` : ""}: ${f.message} (line ${f.line})`)
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

function buildProjectTreeFromMap(projectId: string, files: Record<string, string>): FileNode {
  const rootNode: FileNode = {
    id:     projectId,
    name:   projectId,
    type:   "folder",
    isOpen: true,
    children: [],
  };

  const addFileToTree = (filePath: string, content: string) => {
    const segments = filePath.split("/").filter(Boolean);
    let currentDir = rootNode;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const currentPath = segments.slice(0, i + 1).join("/");
      const nodeId = `${projectId}/${currentPath}`;

      if (isLast) {
        const ext = segment.split(".").pop() || "";
        const cmLang = LANG_EXT[ext] ? ext : "plaintext";
        
        currentDir.children = currentDir.children || [];
        if (!currentDir.children.find(c => c.id === nodeId)) {
          currentDir.children.push({
            id: nodeId,
            name: segment,
            type: "file",
            language: cmLang,
            content: content,
          });
        }
      } else {
        currentDir.children = currentDir.children || [];
        let folderNode = currentDir.children.find(c => c.id === nodeId && c.type === "folder");
        if (!folderNode) {
          folderNode = {
            id: nodeId,
            name: segment,
            type: "folder",
            isOpen: true,
            children: [],
          };
          currentDir.children.push(folderNode);
        }
        currentDir = folderNode;
      }
    }
  };

  for (const [filePath, content] of Object.entries(files)) {
    addFileToTree(filePath, content);
  }

  return rootNode;
}

function buildProjectTree(params: CreateProjectParams): FileNode {
  const { projectId, language, finalCode, auditTrail, scoreHistory } = params;
  const codeName     = getFileName(language);
  const reportContent = generateSecurityReport(params);

  let files: Record<string, string> = {};
  try {
    const parsed = JSON.parse(finalCode);
    if (parsed && typeof parsed === "object" && parsed.files) {
      files = parsed.files;
    } else {
      files = { [codeName]: finalCode };
    }
  } catch {
    files = { [codeName]: finalCode };
  }

  if (!files["security_report.md"]) {
    files["security_report.md"] = reportContent;
  }
  if (!files[".sentinel/audit_trail.json"]) {
    files[".sentinel/audit_trail.json"] = JSON.stringify(auditTrail, null, 2);
  }
  if (!files[".sentinel/score_history.json"]) {
    files[".sentinel/score_history.json"] = JSON.stringify(scoreHistory, null, 2);
  }

  return buildProjectTreeFromMap(projectId, files);
}


const LIVE_TAB_ID = "tab-live-preview";
let saveTimeout: NodeJS.Timeout | null = null;

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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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

  updateTabContent: (tabId, content) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, content, isDirty: true } : t),
    }));

    const tab = get().tabs.find(t => t.id === tabId);
    if (tab && !tab.isLive) {
      const activeProjectId = get().activeProjectId;
      if (activeProjectId) {
        const relativePath = tab.fileId.replace(`${activeProjectId}/`, "");
        
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
          await get().saveFileContent(activeProjectId, relativePath, content);
          set(s => ({
            tabs: s.tabs.map(t => t.id === tabId ? { ...t, isDirty: false } : t),
          }));
        }, 1000);
      }
    }
  },

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

  createProject: async (projectId, language) => {
    try {
      const resp = await fetch(`${API_BASE}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectId,
          name: projectId,
          language,
        }),
      });
      if (resp.ok) {
        await get().loadProjects();
        await get().switchProject(projectId);
      } else {
        const text = await resp.text();
        alert(`Failed to create project: ${text}`);
      }
    } catch (err) {
      console.error("Error creating project:", err);
    }
  },

  createFile: async (projectId, filePath, content) => {
    const { fileTree } = get();
    const projectNode = fileTree.find(n => n.id === projectId);
    const filesMap: Record<string, string> = {};

    const extractFiles = (node: FileNode) => {
      if (node.type === "file") {
        const relativePath = node.id.replace(`${projectId}/`, "");
        if (
          relativePath !== "security_report.md" &&
          !relativePath.startsWith(".sentinel/")
        ) {
          filesMap[relativePath] = node.content ?? "";
        }
      } else if (node.children) {
        node.children.forEach(extractFiles);
      }
    };

    if (projectNode) {
      extractFiles(projectNode);
    }

    filesMap[filePath] = content;

    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: JSON.stringify({ files: filesMap }),
        }),
      });

      if (resp.ok) {
        // Build updated project tree locally first for instant UI response
        const updatedProjectNode = buildProjectTreeFromMap(projectId, filesMap);
        
        // Auto-expand all parent folders of the created file
        const newExpanded = new Set(get().expandedFolders);
        newExpanded.add(projectId);
        const segments = filePath.split("/").filter(Boolean);
        for (let i = 0; i < segments.length - 1; i++) {
          const folderId = `${projectId}/${segments.slice(0, i + 1).join("/")}`;
          newExpanded.add(folderId);
        }

        set(s => {
          const existingIdx = s.fileTree.findIndex(n => n.id === projectId);
          const newTree = existingIdx >= 0
            ? s.fileTree.map((n, i) => i === existingIdx ? updatedProjectNode : n)
            : [...s.fileTree, updatedProjectNode];
          return {
            fileTree: newTree,
            expandedFolders: newExpanded,
          };
        });

        const ext = filePath.split(".").pop() || "";
        const cmLang = LANG_EXT[ext] ? ext : "plaintext";
        get().openFile({
          id: `${projectId}/${filePath}`,
          name: filePath.split("/").pop() || filePath,
          type: "file",
          language: cmLang,
          content: content,
        });
      }
    } catch (err) {
      console.error("Error creating file:", err);
    }
  },

  saveFileContent: async (projectId, filePath, content) => {
    const { fileTree } = get();
    const projectNode = fileTree.find(n => n.id === projectId);
    const filesMap: Record<string, string> = {};

    const extractFiles = (node: FileNode) => {
      if (node.type === "file") {
        const relativePath = node.id.replace(`${projectId}/`, "");
        if (node.id === `${projectId}/${filePath}`) {
          filesMap[relativePath] = content;
        } else {
          filesMap[relativePath] = node.content ?? "";
        }
      } else if (node.children) {
        node.children.forEach(extractFiles);
      }
    };

    if (projectNode) {
      extractFiles(projectNode);
    }

    filesMap[filePath] = content;

    let securityScore = 100;
    let findings: unknown[] = [];
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/generations`);
      if (resp.ok) {
        const gens = await resp.json();
        const latest = [...gens].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (latest) {
          securityScore = latest.security_score;
          findings = latest.findings ?? [];
        }
      }
    } catch {}

    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: JSON.stringify({ files: filesMap }),
          security_score: securityScore,
          findings: findings,
        }),
      });

      if (resp.ok) {
        set(s => {
          const updateTreeNode = (nodes: FileNode[]): FileNode[] => {
            return nodes.map(node => {
              if (node.id === `${projectId}/${filePath}`) {
                return { ...node, content };
              }
              if (node.children) {
                return { ...node, children: updateTreeNode(node.children) };
              }
              return node;
            });
          };
          return { fileTree: updateTreeNode(s.fileTree) };
        });
      }
    } catch (err) {
      console.error("Error saving file content:", err);
    }
  },

  saveChatHistory: async (projectId) => {
    const { fileTree } = get();
    const projectNode = fileTree.find(n => n.id === projectId);
    const filesMap: Record<string, string> = {};

    const extractAllFiles = (node: FileNode) => {
      if (node.type === "file") {
        const relativePath = node.id.replace(`${projectId}/`, "");
        filesMap[relativePath] = node.content ?? "";
      } else if (node.children) {
        node.children.forEach(extractAllFiles);
      }
    };

    if (projectNode) {
      extractAllFiles(projectNode);
    }

    const currentEvents = get().pipelineEvents;
    filesMap[".sentinel/chat_history.json"] = JSON.stringify(currentEvents);

    let securityScore = get().securityScore ?? 100;
    let findings: unknown[] = [];
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/generations`);
      if (resp.ok) {
        const gens = await resp.json();
        const latest = [...gens].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (latest) {
          securityScore = latest.security_score;
          findings = latest.findings ?? [];
        }
      }
    } catch (err) {
      console.error("Error fetching latest generations metadata:", err);
    }

    const processedCode = JSON.stringify({ files: filesMap });

    try {
      await fetch(`${API_BASE}/api/projects/${projectId}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: processedCode,
          security_score: securityScore,
          findings: findings,
        }),
      });

      set(s => {
        const updatedParams = {
          projectId,
          prompt: s.currentPrompt || "Manual Chat Update",
          language: s.liveLanguage || "javascript",
          finalCode: processedCode,
          auditTrail: s.auditTrail,
          scoreHistory: s.scoreHistory,
          securityScore: securityScore,
          verdict: securityScore === 100 ? "clean" : "fix",
          reasoning: "",
          findings,
        };
        const newProjectNode = buildProjectTree(updatedParams);
        const existingIdx = s.fileTree.findIndex(n => n.id === projectId);
        const newTree = existingIdx >= 0
          ? s.fileTree.map((n, i) => i === existingIdx ? newProjectNode : n)
          : [...s.fileTree, newProjectNode];

        return { fileTree: newTree };
      });
    } catch (err) {
      console.error("Error saving chat history:", err);
    }
  },


  createProjectFiles: (params) => {
    const { projectId, language, finalCode, auditTrail, scoreHistory } = params;
    const langKey      = language.toLowerCase();
    
    // Check if finalCode is already JSON and parse it
    let isJson = false;
    let filesMap: Record<string, string> = {};
    try {
      const parsed = JSON.parse(finalCode);
      if (parsed && typeof parsed === "object" && parsed.files) {
        isJson = true;
        filesMap = parsed.files || {};
      }
    } catch {}

    let targetFileRelativePath = getFileName(language);

    if (isJson) {
      // Find the first file that matches language's extension, or is not metadata
      const ext = LANG_EXT[langKey];
      const keys = Object.keys(filesMap);
      const found = keys.find(
        k => k.endsWith(`.${ext}`) && !k.startsWith(".sentinel/") && k !== "security_report.md"
      );
      if (found) {
        targetFileRelativePath = found;
      } else {
        // Fallback to first non-metadata file
        const fallback = keys.find(
          k => !k.startsWith(".sentinel/") && k !== "security_report.md"
        );
        if (fallback) {
          targetFileRelativePath = fallback;
        }
      }
    } else {
      const { tabs, activeTabId } = get();
      const activeTab = tabs.find(t => t.id === activeTabId);
      
      if (activeTab && activeTab.fileId.startsWith(`${projectId}/`) && !activeTab.isLive) {
        targetFileRelativePath = activeTab.fileId.replace(`${projectId}/`, "");
      }
      
      // Load existing files map from the store tree
      const projectNode = get().fileTree.find(n => n.id === projectId);
      const extractFiles = (node: FileNode) => {
        if (node.type === "file") {
          const relativePath = node.id.replace(`${projectId}/`, "");
          if (
            relativePath !== "security_report.md" &&
            !relativePath.startsWith(".sentinel/")
          ) {
            filesMap[relativePath] = node.content ?? "";
          }
        } else if (node.children) {
          node.children.forEach(extractFiles);
        }
      };

      if (projectNode) {
        extractFiles(projectNode);
      }

      // Update the targeted file with the generated code
      filesMap[targetFileRelativePath] = finalCode;
    }

    // Update chat history inside filesMap if streaming just completed
    const currentEvents = get().pipelineEvents;
    if (get().isStreaming) {
      const doneEventAdded = currentEvents.some(e => e.type === "done" && e.message.includes(projectId));
      const finalEvents = [...currentEvents];
      if (!doneEventAdded) {
        finalEvents.push({
          id: `evt-${Date.now()}-done`,
          type: "done",
          message: `✅ Pipeline complete. Score: ${params.securityScore}/100. Files saved to project "${projectId}".`,
          timestamp: new Date()
        });
      }
      filesMap[".sentinel/chat_history.json"] = JSON.stringify(finalEvents);
    }

    // Load chat history from filesMap if we are NOT streaming (i.e. loading project)
    let chatHistoryLoaded = false;
    if (filesMap[".sentinel/chat_history.json"]) {
      try {
        const parsedEvents = JSON.parse(filesMap[".sentinel/chat_history.json"]) as PipelineEvent[];
        const formattedEvents = parsedEvents.map(evt => ({
          ...evt,
          timestamp: new Date(evt.timestamp),
        }));
        if (!get().isStreaming) {
          set({ pipelineEvents: formattedEvents });
          chatHistoryLoaded = true;
        }
      } catch (err) {
        console.error("Failed to parse chat history:", err);
      }
    }

    if (!chatHistoryLoaded && !get().isStreaming) {
      set({
        pipelineEvents: [
          {
            id: "sys-0",
            type: "system",
            message: `CodeSentinel ready for project "${projectId}". Type a requirement below to start the pipeline.`,
            timestamp: new Date(),
          },
        ]
      });
    }

    const reportContent = generateSecurityReport(params);
    filesMap["security_report.md"] = reportContent;
    filesMap[".sentinel/audit_trail.json"] = JSON.stringify(auditTrail, null, 2);
    filesMap[".sentinel/score_history.json"] = JSON.stringify(scoreHistory, null, 2);

    const processedCode = JSON.stringify({ files: filesMap });
    const updatedParams = { ...params, finalCode: processedCode };
    const projectNode = buildProjectTree(updatedParams);
    const codeName = targetFileRelativePath;
    const codeTabId = `tab-${projectId}/${codeName}`;
    const reportTabId = `tab-${projectId}/security_report.md`;

    set(s => {
      const existingIdx = s.fileTree.findIndex(n => n.id === projectId);
      const newTree = existingIdx >= 0
        ? s.fileTree.map((n, i) => i === existingIdx ? projectNode : n)
        : [...s.fileTree, projectNode];

      const baseTabs = s.tabs.filter(t => !t.isLive && t.id !== codeTabId && t.id !== reportTabId);

      const codeTab: Tab = {
        id:       codeTabId,
        fileId:   `${projectId}/${codeName}`,
        fileName: codeName.split("/").pop() || codeName,
        language: langKey,
        content:  filesMap[codeName] || "",
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

      const newExpanded = new Set(s.expandedFolders);
      newExpanded.add(projectId);

      // Save the authoritative state of project files back to database
      fetch(`${API_BASE}/api/projects/${projectId}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: processedCode,
          security_score: params.securityScore,
          findings: params.findings,
        }),
      }).catch(err => console.error("Error saving authoritative code after pipeline complete:", err));

      return {
        fileTree:        newTree,
        tabs:            [...baseTabs, codeTab, reportTab],
        activeTabId:     codeTabId,
        activeProjectId: projectId,
        selectedFileId:  `${projectId}/${codeName}`,
        expandedFolders: newExpanded,
        language:        langLabel(langKey),
        liveCode:        filesMap[codeName] || "",
        liveLanguage:    langKey,
        auditTrail:      params.auditTrail,
        scoreHistory:    params.scoreHistory,
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
            id:       `tab-${projectId}/README.md`,
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

      // Load the latest generation (representing the current workspace state)
      const latest = [...generations].sort(
        (a, b) => b.created_at.localeCompare(a.created_at)
      )[0];

      // Score history oldest→newest
      const scoreHistory = [...generations]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(g => g.security_score);

      get().createProjectFiles({
        projectId,
        prompt:        project.prompt,
        language:      project.language,
        finalCode:     latest.code,
        auditTrail:    [],
        scoreHistory,
        securityScore: latest.security_score,
        verdict:       latest.security_score === 100 ? "clean" : "fix",
        reasoning:     `Loaded from saved generation (score: ${latest.security_score}/100).`,
        findings:      latest.findings ?? [],
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

  deleteProject: async (projectId: string) => {
    try {
      const resp = await apiDeleteProject(projectId);
      if (resp.status === "success") {
        // Remove the project node from fileTree
        set(s => ({
          fileTree: s.fileTree.filter(n => n.id !== projectId),
          // Close all tabs of the deleted project
          tabs: s.tabs.filter(t => !t.fileId.startsWith(`${projectId}/`)),
        }));

        // Select next active tab if the active tab was closed
        const { tabs, activeTabId, activeProjectId } = get();
        if (activeTabId && !tabs.find(t => t.id === activeTabId)) {
          set({ activeTabId: tabs[0]?.id ?? null });
        }

        // Reload project list
        await get().loadProjects();

        // If the deleted project was the active project, switch to another or reset
        if (activeProjectId === projectId) {
          const remainingProjects = get().projects;
          if (remainingProjects.length > 0) {
            await get().switchProject(remainingProjects[0].id);
          } else {
            set({
              activeProjectId: null,
              selectedFileId: null,
              auditTrail: [],
              scoreHistory: [],
              securityScore: null,
              pipelineEvents: [
                {
                  id: "sys-0",
                  type: "system",
                  message: "No projects loaded. Generate a code project to start.",
                  timestamp: new Date(),
                },
              ],
            });
          }
        }
      }
    } catch (err) {
      console.error("Error deleting project:", err);
    }
  },

  appendAuditSnapshot: (snapshot) =>
    set(s => ({ auditTrail: [...s.auditTrail, snapshot] })),

  setAuditTrail: (trail) => set({ auditTrail: trail }),

  setScanRequest: (req) => set({ scanRequest: req }),
}));
