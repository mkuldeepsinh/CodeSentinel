"use client";

import { useIDEStore, FileNode } from "@/store/ideStore";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  Coffee,
} from "lucide-react";

// ── File icon picker ─────────────────────────────────────────────────────────
function FileIcon({ name, language }: { name: string; language?: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const lang = language?.toLowerCase() ?? ext;

  const style = { flexShrink: 0 };

  if (lang === "python" || ext === "py")
    return <FileCode size={14} style={{ ...style, color: "#7aa2f7" }} />;
  if (lang === "typescript" || ext === "tsx" || ext === "ts")
    return <FileCode size={14} style={{ ...style, color: "#2ac3de" }} />;
  if (lang === "javascript" || ext === "js" || ext === "jsx")
    return <FileCode size={14} style={{ ...style, color: "#e0af68" }} />;
  if (lang === "json" || ext === "json")
    return <FileJson size={14} style={{ ...style, color: "#9ece6a" }} />;
  if (ext === "md" || ext === "mdx")
    return <FileText size={14} style={{ ...style, color: "#7dcfff" }} />;
  if (ext === "css" || ext === "scss")
    return <File size={14} style={{ ...style, color: "#bb9af7" }} />;
  if (ext === "sh")
    return <File size={14} style={{ ...style, color: "#9ece6a" }} />;
  if (name.startsWith(".env"))
    return <File size={14} style={{ ...style, color: "#ff9e64" }} />;
  if (name === "requirements.txt")
    return <FileText size={14} style={{ ...style, color: "#73daca" }} />;
  return <File size={14} style={{ ...style, color: "var(--text-muted)" }} />;
}

// ── Tree Node ────────────────────────────────────────────────────────────────
function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const { selectedFileId, expandedFolders, openFile, toggleFolder } = useIDEStore();
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedFileId === node.id;
  const isFolder = node.type === "folder";

  const paddingLeft = 8 + depth * 14;

  const handleClick = () => {
    if (isFolder) {
      toggleFolder(node.id);
    } else {
      openFile(node);
    }
  };

  return (
    <>
      <div
        id={`tree-${node.id}`}
        className={`tree-item ${isFolder ? "folder" : ""} ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {/* Chevron for folders */}
        {isFolder ? (
          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
            {isExpanded
              ? <ChevronDown size={12} />
              : <ChevronRight size={12} />
            }
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {/* Icon */}
        {isFolder ? (
          isExpanded
            ? <FolderOpen size={14} style={{ color: "#e0af68", flexShrink: 0 }} />
            : <Folder size={14} style={{ color: "#e0af68", flexShrink: 0 }} />
        ) : (
          <FileIcon name={node.name} language={node.language} />
        )}

        {/* Name */}
        <span
          className="tree-item-name"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: 13,
          }}
        >
          {node.name}
        </span>
      </div>

      {/* Children */}
      {isFolder && isExpanded && node.children?.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { sidebarOpen, activeView, fileTree } = useIDEStore();

  if (!sidebarOpen) return null;

  return (
    <div
      className="ide-sidebar slide-in-left"
      style={{ overflow: "hidden" }}
    >
      {activeView === "explorer" && (
        <>
          <div className="sidebar-header">
            <span>CODESENTINEL</span>
          </div>

          {/* Collapse section label */}
          <div
            style={{
              padding: "6px 12px 4px",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <ChevronDown size={12} />
            <span>Project</span>
          </div>

          {/* File tree */}
          <div className="file-tree">
            {fileTree.map(node => (
              <TreeNode key={node.id} node={node} depth={0} />
            ))}
          </div>
        </>
      )}

      {activeView === "search" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}>
            <span>SEARCH</span>
          </div>
          <input
            placeholder="Search..."
            style={{
              width: "100%",
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "6px 10px",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
              fontFamily: "var(--font-ui)",
            }}
          />
          <p style={{ marginTop: 20, fontSize: 12, color: "var(--text-disabled)", textAlign: "center" }}>
            Type to search across files
          </p>
        </div>
      )}

      {activeView === "git" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}>
            <span>SOURCE CONTROL</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Branch: <span style={{ color: "var(--accent-purple)" }}>main</span>
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-disabled)" }}>
            No pending changes
          </p>
        </div>
      )}

      {activeView === "settings" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}>
            <span>SETTINGS</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-disabled)" }}>
            Theme: Token Night
          </p>
        </div>
      )}
    </div>
  );
}
