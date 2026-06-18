"use client";

import { useIDEStore, Tab } from "@/store/ideStore";
import { X, Circle } from "lucide-react";
import CodeEditor from "./CodeEditor";

// ── Language dot color ────────────────────────────────────────────────────────
function langColor(lang: string) {
  const map: Record<string, string> = {
    python:     "#7aa2f7",
    typescript: "#2ac3de",
    javascript: "#e0af68",
    json:       "#9ece6a",
    css:        "#bb9af7",
    html:       "#ff9e64",
    markdown:   "#7dcfff",
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
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: langColor(tab.language),
          flexShrink: 0,
          opacity: 0.8,
        }}
      />

      {/* Filename */}
      <span style={{ fontSize: 13 }}>{tab.fileName}</span>

      {/* Dirty indicator / close */}
      {tab.isDirty ? (
        <span className="tab-dot" />
      ) : (
        <span
          className="tab-close"
          onClick={e => {
            e.stopPropagation();
            closeTab(tab.id);
          }}
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
    : ["backend", tab.fileName];

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

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyEditor() {
  return (
    <div className="editor-placeholder fade-in">
      <div style={{ fontSize: 56, opacity: 0.15, lineHeight: 1 }}>🛡️</div>
      <h2>CodeSentinel</h2>
      <p style={{ maxWidth: 340, textAlign: "center", lineHeight: 1.6 }}>
        Open a file from the Explorer, or type a security requirement in the
        CodeSentinel panel below to start the pipeline.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {["Python", "TypeScript", "Node.js"].map(lang => (
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
    </div>
  );
}

// ── Editor Zone ───────────────────────────────────────────────────────────────
export default function EditorZone() {
  const { tabs, activeTabId } = useIDEStore();
  const activeTab = tabs.find(t => t.id === activeTabId);

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

      {/* Editor body */}
      <div className="editor-body">
        {activeTab ? (
          <CodeEditor tab={activeTab} />
        ) : (
          <EmptyEditor />
        )}
      </div>
    </div>
  );
}
