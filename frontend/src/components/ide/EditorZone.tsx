"use client";

import { useState } from "react";
import { useIDEStore, Tab, FileNode } from "@/store/ideStore";
import { X, ShieldCheck, Zap, Play, Loader2, Eye, Code } from "lucide-react";
import { runCode } from "@/lib/api";
import CodeEditor from "./CodeEditor";

// ── Language dot color ────────────────────────────────────────────────────────
function langColor(lang: string) {
  const map: Record<string, string> = {
    python:     "var(--accent-blue)",
    typescript: "var(--accent-cyan)",
    javascript: "var(--accent-yellow)",
    json:       "var(--accent-green)",
    css:        "var(--accent-purple)",
    html:       "var(--accent-orange)",
    markdown:   "var(--accent-teal)",
    go:         "var(--accent-teal)",
    rust:       "var(--accent-orange)",
  };
  return map[lang.toLowerCase()] ?? "var(--text-muted)";
}

// ── Tab Component ─────────────────────────────────────────────────────────────
function TabItem({ tab, isActive }: { tab: Tab; isActive: boolean }) {
  const { setActiveTab, closeTab } = useIDEStore();

  return (
    <div
      id={`tab-${tab.id}`}
      className={`tab ${isActive ? "active" : ""}`}
      onClick={() => setActiveTab(tab.id)}
    >
      {/* Language dot */}
      <span
        style={{
          width: 6, height: 6, borderRadius: "50%",
          background: tab.isLive ? "var(--accent-blue)" : langColor(tab.language),
          flexShrink: 0, opacity: 0.8,
          // Pulse animation for live tab
          animation: tab.isLive ? "pulse 1.5s ease-in-out infinite" : "none",
        }}
      />

      {/* Filename */}
      <span style={{ fontSize: 13 }}>{tab.fileName}</span>

      {/* Live badge */}
      {tab.isLive && (
        <span style={{
          fontSize: 9, padding: "1px 4px", borderRadius: 3,
          background: "rgba(122,162,247,0.15)",
          border: "1px solid rgba(122,162,247,0.3)",
          color: "var(--accent-blue)",
        }}>
          LIVE
        </span>
      )}

      {/* Dirty indicator / close */}
      {tab.isDirty && !tab.isLive ? (
        <span className="tab-dot" />
      ) : (
        <span
          className="tab-close"
          onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
        >
          <X size={11} strokeWidth={2.5} />
        </span>
      )}
    </div>
  );
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function Breadcrumb({ tab }: { tab: Tab | undefined }) {
  if (!tab) return <div className="breadcrumb" />;

  const parts = tab.fileId.includes("/")
    ? tab.fileId.split("/")
    : [tab.fileName];

  return (
    <div className="breadcrumb">
      {parts.map((part, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          <span className={`breadcrumb-item ${i === parts.length - 1 ? "current" : ""}`}>
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Editor Toolbar (right-aligned actions) ────────────────────────────────────
function EditorToolbar({
  tab,
  viewMode,
  setViewMode,
}: {
  tab: Tab;
  viewMode: "code" | "preview";
  setViewMode: (val: "code" | "preview") => void;
}) {
  const {
    setScanRequest,
    setPanelOpen,
    setActivePanelTab,
    isStreaming,
    activeProjectId,
    fileTree,
    addEvent,
    setStreaming,
  } = useIDEStore();

  const hasContent = tab.content.trim().length > 0;
  const isLive     = tab.isLive;

  const handleAnalyze = () => {
    if (!hasContent || isStreaming || isLive) return;
    // Pass current code to BottomPanel for scanning
    setScanRequest({ code: tab.content, language: tab.language });
    setPanelOpen(true);
    setActivePanelTab("codesentinel");
  };

  const handleRun = async () => {
    if (!hasContent || isStreaming || isLive) return;

    setPanelOpen(true);
    setActivePanelTab("codesentinel");
    setStreaming(true);

    addEvent({ type: "user", message: `run ${tab.fileName}` });
    addEvent({ type: "system", message: "Connecting to E2B Sandbox for execution…" });

    // Gather project file tree contents
    const projectNode = fileTree.find(n => n.id === activeProjectId);
    const filesMap: Record<string, string> = {};
    const extractFiles = (node: FileNode) => {
      if (node.type === "file") {
        const relativePath = node.id.replace(`${activeProjectId}/`, "");
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

    // Include unsaved changes in current active tab file
    const currentRelativePath = tab.fileId.replace(`${activeProjectId}/`, "");
    filesMap[currentRelativePath] = tab.content;

    const codeContent = Object.keys(filesMap).length > 0
      ? JSON.stringify({ files: filesMap })
      : tab.content;

    try {
      const res = await runCode(codeContent, tab.language);
      let msg = `Execution completed. Success: ${res.success}`;
      if (res.stdout.trim()) {
        msg += `\nStdout:\n\`\`\`\n${res.stdout.trim()}\n\`\`\``;
      }
      if (res.stderr.trim()) {
        msg += `\nStderr:\n\`\`\`\n${res.stderr.trim()}\n\`\`\``;
      }
      if (!res.stdout.trim() && !res.stderr.trim()) {
        msg += " No output recorded.";
      }
      addEvent({
        type: "node_end",
        node: "e2b_execute",
        message: msg,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      addEvent({
        type: "error",
        message: `Execution failed: ${message}`
      });
    } finally {
      setStreaming(false);
    }
  };

  if (!hasContent || isLive) return <div style={{ height: 30 }} />;

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      gap:            6,
      padding:        "3px 10px",
      borderBottom:   "1px solid var(--border-subtle)",
      flexShrink:     0,
      background:     "var(--bg-base)",
    }}>
      {tab.language.toLowerCase() === "html" ? (
        <div style={{
          display: "flex",
          border: "1px solid var(--border-default)",
          borderRadius: 4,
          overflow: "hidden",
          background: "var(--bg-subtle)",
        }}>
          <button
            id="view-code-toggle"
            onClick={() => setViewMode("code")}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              background: viewMode === "code" ? "var(--border-default)" : "transparent",
              color: viewMode === "code" ? "var(--text-bright)" : "var(--text-muted)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-ui)",
              fontWeight: viewMode === "code" ? "bold" : "normal",
            }}
          >
            <Code size={11} />
            Code
          </button>
          <button
            id="view-preview-toggle"
            onClick={() => setViewMode("preview")}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              background: viewMode === "preview" ? "var(--border-default)" : "transparent",
              color: viewMode === "preview" ? "var(--text-bright)" : "var(--text-muted)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-ui)",
              fontWeight: viewMode === "preview" ? "bold" : "normal",
            }}
          >
            <Eye size={11} />
            Preview
          </button>
        </div>
      ) : (
        <div />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          id="run-code-btn"
          onClick={handleRun}
          disabled={isStreaming}
          title="Run code inside the E2B Sandbox"
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          5,
            fontSize:     11,
            padding:      "3px 10px",
            borderRadius: 5,
            border:       "1px solid rgba(158,206,106,0.3)",
            background:   isStreaming ? "none" : "rgba(158,206,106,0.08)",
            color:        isStreaming ? "var(--text-disabled)" : "var(--accent-green)",
            cursor:       isStreaming ? "not-allowed" : "pointer",
            transition:   "all 0.15s ease",
            fontFamily:   "var(--font-ui)",
          }}
        >
          {isStreaming
            ? <Loader2 size={11} className="animate-spin" />
            : <Play size={11} />
          }
          Run Code
        </button>

        <button
          id="analyze-code-btn"
          onClick={handleAnalyze}
          disabled={isStreaming}
          title="Scan & secure this code through the CodeSentinel pipeline"
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          5,
            fontSize:     11,
            padding:      "3px 10px",
            borderRadius: 5,
            border:       "1px solid rgba(122,162,247,0.3)",
            background:   isStreaming ? "none" : "rgba(122,162,247,0.08)",
            color:        isStreaming ? "var(--text-disabled)" : "var(--accent-blue)",
            cursor:       isStreaming ? "not-allowed" : "pointer",
            transition:   "all 0.15s ease",
            fontFamily:   "var(--font-ui)",
          }}
        >
          {isStreaming
            ? <Zap size={11} />
            : <ShieldCheck size={11} />
          }
          {isStreaming ? "Pipeline running…" : "Scan & Secure"}
        </button>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyEditor() {
  const { setScanRequest, setPanelOpen, setActivePanelTab } = useIDEStore();

  return (
    <div className="editor-placeholder fade-in">
      <h2>CodeSentinel</h2>
      <p style={{ maxWidth: 360, textAlign: "center", lineHeight: 1.6, color: "var(--text-muted)" }}>
        Type a security requirement in the panel below to generate and harden code,
        or open a file from the Explorer and click{" "}
        <strong style={{ color: "var(--accent-blue)" }}>Scan &amp; Secure</strong> to analyse existing code.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {["JavaScript", "TypeScript", "Python", "Go", "Rust"].map(lang => (
          <span
            key={lang}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              border: "1px solid var(--border-default)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            {lang}
          </span>
        ))}
      </div>
      <button
        onClick={() => { setPanelOpen(true); setActivePanelTab("codesentinel"); setTimeout(() => document.getElementById("cli-input")?.focus(), 50); }}
        style={{
          marginTop:    16,
          padding:      "7px 18px",
          borderRadius: 6,
          border:       "1px solid rgba(122,162,247,0.3)",
          background:   "rgba(122,162,247,0.08)",
          color:        "var(--accent-blue)",
          fontSize:     12,
          cursor:       "pointer",
          fontFamily:   "var(--font-ui)",
          display:      "flex",
          alignItems:   "center",
          gap:          6,
        }}
      >
        <ShieldCheck size={13} />
        Start pipeline
      </button>
    </div>
  );
}

// ── Editor Zone ───────────────────────────────────────────────────────────────
export default function EditorZone() {
  const { tabs, activeTabId } = useIDEStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [prevTabId, setPrevTabId] = useState<string | null>(activeTabId);
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");

  if (activeTabId !== prevTabId) {
    setPrevTabId(activeTabId);
    setViewMode("code");
  }

  return (
    <div className="ide-editor-zone">
      {/* Tab bar */}
      <div className="tab-bar">
        {tabs.map(tab => (
          <TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
        ))}
      </div>

      {/* Breadcrumb */}
      <Breadcrumb tab={activeTab} />

      {/* Analyze toolbar — only when a file is open */}
      {activeTab && (
        <EditorToolbar
          tab={activeTab}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      )}

      {/* Editor body */}
      <div className="editor-body">
        {activeTab ? (
          viewMode === "preview" ? (
            <div style={{ width: "100%", height: "100%", background: "#ffffff" }}>
              <iframe
                srcDoc={activeTab.content}
                title="HTML Preview"
                sandbox="allow-scripts"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  background: "#ffffff",
                }}
              />
            </div>
          ) : (
            <CodeEditor key={activeTab.id} tab={activeTab} />
          )
        ) : (
          <EmptyEditor />
        )}
      </div>
    </div>
  );
}
