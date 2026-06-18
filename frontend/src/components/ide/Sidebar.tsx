"use client";

import { useIDEStore, FileNode } from "@/store/ideStore";
import HistorySidebar from "./HistorySidebar";
import {
  ChevronRight, ChevronDown,
  Folder, FolderOpen, File, FileCode, FileText, FileJson,
} from "lucide-react";

// ── File icon ─────────────────────────────────────────────────────────────────
function FileIcon({ name, language }: { name: string; language?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const lang = language?.toLowerCase() ?? ext;
  const s = { flexShrink: 0 as const };

  if (lang === "python"     || ext === "py")              return <FileCode size={14} style={{ ...s, color: "#7aa2f7" }} />;
  if (lang === "typescript" || ext === "tsx" || ext === "ts") return <FileCode size={14} style={{ ...s, color: "#2ac3de" }} />;
  if (lang === "javascript" || ext === "js"  || ext === "jsx") return <FileCode size={14} style={{ ...s, color: "#e0af68" }} />;
  if (lang === "json"       || ext === "json")            return <FileJson size={14} style={{ ...s, color: "#9ece6a" }} />;
  if (ext === "md"  || ext === "mdx")                     return <FileText size={14} style={{ ...s, color: "#7dcfff" }} />;
  if (ext === "css" || ext === "scss")                    return <File     size={14} style={{ ...s, color: "#bb9af7" }} />;
  if (name.startsWith(".env"))                            return <File     size={14} style={{ ...s, color: "#ff9e64" }} />;
  if (name === "requirements.txt")                        return <FileText size={14} style={{ ...s, color: "#73daca" }} />;
  return <File size={14} style={{ ...s, color: "var(--text-muted)" }} />;
}

// ── Tree node ─────────────────────────────────────────────────────────────────
function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const { selectedFileId, expandedFolders, openFile, toggleFolder } = useIDEStore();
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedFileId === node.id;
  const isFolder   = node.type === "folder";

  return (
    <>
      <div
        id={`tree-${node.id}`}
        className={`tree-item ${isFolder ? "folder" : ""} ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => isFolder ? toggleFolder(node.id) : openFile(node)}
      >
        {isFolder ? (
          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : <span style={{ width: 12, flexShrink: 0 }} />}

        {isFolder ? (
          isExpanded
            ? <FolderOpen size={14} style={{ color: "#e0af68", flexShrink: 0 }} />
            : <Folder     size={14} style={{ color: "#e0af68", flexShrink: 0 }} />
        ) : <FileIcon name={node.name} language={node.language} />}

        <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
          {node.name}
        </span>
      </div>

      {isFolder && isExpanded && node.children?.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

// ── Explorer sidebar ──────────────────────────────────────────────────────────
function ExplorerSidebar() {
  const { fileTree } = useIDEStore();
  return (
    <>
      <div className="sidebar-header">
        <span>CODESENTINEL</span>
      </div>
      <div style={{ padding: "5px 12px 3px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
        <ChevronDown size={12} />
        <span>Project</span>
      </div>
      <div className="file-tree">
        {fileTree.map(node => <TreeNode key={node.id} node={node} depth={0} />)}
      </div>
    </>
  );
}

// ── Sidebar router ────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { sidebarOpen, activeView } = useIDEStore();
  if (!sidebarOpen) return null;

  if (activeView === "history") return <HistorySidebar />;

  return (
    <div className="ide-sidebar slide-in-left">
      {activeView === "explorer" && <ExplorerSidebar />}

      {activeView === "search" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}><span>SEARCH</span></div>
          <input
            placeholder="Search files…"
            style={{
              width: "100%", background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)", borderRadius: 6,
              padding: "6px 10px", color: "var(--text-primary)", fontSize: 13, outline: "none",
            }}
          />
          <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-disabled)", textAlign: "center" }}>Type to search</p>
        </div>
      )}

      {activeView === "git" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}><span>SOURCE CONTROL</span></div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Branch: <span style={{ color: "var(--accent-purple)" }}>main</span></p>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-disabled)" }}>No pending changes</p>
        </div>
      )}

      {activeView === "settings" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}><span>SETTINGS</span></div>
          <p style={{ fontSize: 12, color: "var(--text-disabled)" }}>Theme: Token Night</p>
        </div>
      )}
    </div>
  );
}
