"use client";

import { useIDEStore, FileNode } from "@/store/ideStore";
import { Project } from "@/lib/api";
import { getLanguageLabel } from "@/lib/languages";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  Plus,
  RefreshCw,
  Clock,
} from "lucide-react";
import { useEffect, useState } from "react";

// ── File Icon ─────────────────────────────────────────────────────────────────
function FileIcon({ name, language }: { name: string; language?: string }) {
  const ext  = name.split(".").pop()?.toLowerCase() ?? "";
  const lang = language?.toLowerCase() ?? ext;
  const style = { flexShrink: 0 };

  if (lang === "python"     || ext === "py")
    return <FileCode size={14} style={{ ...style, color: "#7aa2f7" }} />;
  if (lang === "typescript" || ext === "tsx" || ext === "ts")
    return <FileCode size={14} style={{ ...style, color: "#2ac3de" }} />;
  if (lang === "javascript" || ext === "js" || ext === "jsx")
    return <FileCode size={14} style={{ ...style, color: "#e0af68" }} />;
  if (lang === "json"  || ext === "json")
    return <FileJson size={14} style={{ ...style, color: "#9ece6a" }} />;
  if (lang === "go"    || ext === "go")
    return <FileCode size={14} style={{ ...style, color: "#73daca" }} />;
  if (lang === "rust"  || ext === "rs")
    return <FileCode size={14} style={{ ...style, color: "#ff9e64" }} />;
  if (ext === "md"     || ext === "mdx")
    return <FileText size={14} style={{ ...style, color: "#7dcfff" }} />;
  if (ext === "css"    || ext === "scss")
    return <File     size={14} style={{ ...style, color: "#bb9af7" }} />;
  if (ext === "sh"     || ext === "bash")
    return <File     size={14} style={{ ...style, color: "#9ece6a" }} />;
  if (name.startsWith(".env"))
    return <File     size={14} style={{ ...style, color: "#ff9e64" }} />;
  return   <File     size={14} style={{ ...style, color: "var(--text-muted)" }} />;
}

// ── Tree Node ─────────────────────────────────────────────────────────────────
function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const { selectedFileId, expandedFolders, openFile, toggleFolder } = useIDEStore();
  const isExpanded = expandedFolders.has(node.id);
  const isSelected = selectedFileId === node.id;
  const isFolder   = node.type === "folder";
  const isSentinel = node.name === ".sentinel";
  const paddingLeft = 8 + depth * 14;

  const handleClick = () => {
    if (isFolder) toggleFolder(node.id);
    else          openFile(node);
  };

  return (
    <>
      <div
        id={`tree-${node.id.replace(/\//g, "-")}`}
        className={`tree-item ${isFolder ? "folder" : ""} ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft, opacity: isSentinel ? 0.5 : 1 }}
        onClick={handleClick}
      >
        {isFolder ? (
          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {isFolder ? (
          isExpanded
            ? <FolderOpen size={14} style={{ color: isSentinel ? "var(--text-disabled)" : "#e0af68", flexShrink: 0 }} />
            : <Folder     size={14} style={{ color: isSentinel ? "var(--text-disabled)" : "#e0af68", flexShrink: 0 }} />
        ) : (
          <FileIcon name={node.name} language={node.language} />
        )}

        <span className="tree-item-name" style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
          {node.name}
        </span>

        {/* Live badge on the live-preview tab's tree entry */}
        {node.isLive && (
          <span style={{
            fontSize: 9,
            padding: "1px 4px",
            borderRadius: 3,
            background: "rgba(122,162,247,0.15)",
            border: "1px solid rgba(122,162,247,0.3)",
            color: "var(--accent-blue)",
            flexShrink: 0,
            marginLeft: "auto",
          }}>
            LIVE
          </span>
        )}
      </div>

      {isFolder && isExpanded && node.children?.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

// ── Score badge for project list ──────────────────────────────────────────────
function ScoreChip({ score }: { score: number }) {
  const color = score >= 80 ? "var(--accent-green)"
    : score >= 50 ? "var(--accent-yellow)"
    : "var(--accent-red)";
  return (
    <span style={{
      fontSize: 10,
      padding: "1px 5px",
      borderRadius: 3,
      border: `1px solid ${color}55`,
      color,
      background: `${color}11`,
      flexShrink: 0,
    }}>
      {score}
    </span>
  );
}

// ── Project List Item ─────────────────────────────────────────────────────────
function ProjectItem({ project, isActive }: { project: Project; isActive: boolean }) {
  const { switchProject, fileTree } = useIDEStore();
  const [loading, setLoading] = useState(false);

  // Try to find the best score stored in the file tree for this project
  const projectNode = fileTree.find(n => n.id === project.id);
  const sentinelNode = projectNode?.children?.find(c => c.name === ".sentinel");
  const scoreFile = sentinelNode?.children?.find(c => c.name === "score_history.json");
  let topScore: number | null = null;
  if (scoreFile?.content) {
    try {
      const arr = JSON.parse(scoreFile.content) as number[];
      if (arr.length > 0) topScore = Math.max(...arr);
    } catch { /* ignore */ }
  }

  const handleClick = async () => {
    if (isActive || loading) return;
    setLoading(true);
    try {
      await switchProject(project.id);
    } finally {
      setLoading(false);
    }
  };

  const shortId = project.id.replace("project_", "");
  const langLabel = getLanguageLabel(project.language);

  return (
    <div
      id={`project-item-${project.id}`}
      onClick={handleClick}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           6,
        padding:       "5px 12px",
        cursor:        isActive ? "default" : "pointer",
        background:    isActive ? "rgba(122,162,247,0.08)" : "transparent",
        borderLeft:    isActive ? "2px solid var(--accent-blue)" : "2px solid transparent",
        transition:    "background 0.1s ease",
        userSelect:    "none",
      }}
    >
      <Folder size={13} style={{
        color:    isActive ? "var(--accent-blue)" : "#e0af68",
        flexShrink: 0,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          color:    isActive ? "var(--text-primary)" : "var(--text-secondary)",
          fontWeight: isActive ? 600 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
        }}>
          {shortId}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-disabled)", display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{
            padding: "0 4px",
            borderRadius: 2,
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}>
            {langLabel}
          </span>
          <Clock size={9} />
          <span>{new Date(project.updated_at).toLocaleDateString()}</span>
        </div>
      </div>

      {loading ? (
        <RefreshCw size={10} style={{ color: "var(--text-muted)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
      ) : topScore !== null ? (
        <ScoreChip score={topScore} />
      ) : null}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const {
    sidebarOpen, activeView,
    fileTree,
    projects, activeProjectId,
    loadProjects,
    createProject, createFile,
    setPanelOpen, setActivePanelTab,
  } = useIDEStore();

  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLanguage, setNewProjectLanguage] = useState("python");

  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");

  // Load projects from backend on mount
  useEffect(() => {
    setIsLoadingProjects(true);
    loadProjects().finally(() => setIsLoadingProjects(false));
  }, [loadProjects]);

  if (!sidebarOpen) return null;

  const handleNewProject = () => {
    setIsCreatingProject(true);
    setTimeout(() => {
      document.getElementById("new-project-input")?.focus();
    }, 50);
  };

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    // Check uniqueness
    const exists = projects.some(p => p.id.toLowerCase() === name.toLowerCase());
    if (exists) {
      alert("A project with this name already exists!");
      return;
    }

    setIsCreatingProject(false);
    setNewProjectName("");
    await createProject(name, newProjectLanguage);
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFileName.trim();
    if (!name || !activeProjectId) return;

    setIsCreatingFile(false);
    setNewFileName("");

    let initialContent = "";
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "py") {
      initialContent = "# Python file\n";
    } else if (ext === "js" || ext === "ts" || ext === "tsx" || ext === "jsx") {
      initialContent = "// JavaScript/TypeScript file\n";
    } else if (ext === "md") {
      initialContent = `# ${name}\n`;
    }

    await createFile(activeProjectId, name, initialContent);
  };

  const handleRefresh = () => {
    setIsLoadingProjects(true);
    loadProjects().finally(() => setIsLoadingProjects(false));
  };

  return (
    <div className="ide-sidebar slide-in-left" style={{ overflow: "hidden" }}>

      {/* ── Explorer ── */}
      {activeView === "explorer" && (
        <>
          <div className="sidebar-header">
            <span>CODESENTINEL</span>
          </div>

          {/* PROJECTS section */}
          <div style={{
            padding: "6px 12px 2px",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            userSelect: "none",
          }}>
            <ChevronDown size={12} />
            <span style={{ flex: 1 }}>Projects</span>

            {/* Refresh button */}
            <button
              title="Refresh projects"
              onClick={handleRefresh}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                display: "flex", alignItems: "center",
              }}
            >
              <RefreshCw
                size={10}
                style={isLoadingProjects ? { animation: "spin 1s linear infinite" } : {}}
              />
            </button>

            {/* New project button */}
            <button
              id="new-project-btn"
              title="New project"
              onClick={handleNewProject}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                display: "flex", alignItems: "center",
              }}
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Project list */}
          <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6, marginBottom: 4 }}>
            {isCreatingProject && (
              <form onSubmit={handleProjectSubmit} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "5px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Folder size={13} style={{ color: "#e0af68", flexShrink: 0 }} />
                  <input
                    id="new-project-input"
                    placeholder="project-name"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    onBlur={() => {
                      setTimeout(() => {
                        if (!newProjectName.trim()) setIsCreatingProject(false);
                      }, 200);
                    }}
                    style={{
                      background: "var(--bg-overlay)",
                      border: "1px solid var(--accent-blue)",
                      borderRadius: 4,
                      color: "var(--text-primary)",
                      fontSize: 12,
                      padding: "2px 6px",
                      outline: "none",
                      width: "100%",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 19 }}>
                  <select
                    value={newProjectLanguage}
                    onChange={e => setNewProjectLanguage(e.target.value)}
                    style={{
                      background: "var(--bg-overlay)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 4,
                      color: "var(--text-secondary)",
                      fontSize: 10,
                      padding: "1px 4px",
                      outline: "none",
                      cursor: "pointer",
                      width: "100%",
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="typescript">TypeScript</option>
                    <option value="go">Go</option>
                    <option value="rust">Rust</option>
                  </select>
                  <button
                    type="submit"
                    style={{
                      background: "rgba(122, 162, 247, 0.15)",
                      border: "1px solid rgba(122, 162, 247, 0.3)",
                      borderRadius: 4,
                      color: "var(--accent-blue)",
                      fontSize: 10,
                      padding: "1px 6px",
                      cursor: "pointer",
                    }}
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            {isLoadingProjects && projects.length === 0 ? (
              <div style={{ padding: "6px 16px", fontSize: 11, color: "var(--text-disabled)" }}>
                <RefreshCw size={10} style={{ display: "inline", marginRight: 4, animation: "spin 1s linear infinite" }} />
                Loading projects…
              </div>
            ) : projects.length === 0 ? (
              <div style={{ padding: "6px 16px", fontSize: 11, color: "var(--text-disabled)", lineHeight: 1.5 }}>
                No projects yet.
                <br />
                Click + to create folder.
              </div>
            ) : (
              projects.map(p => (
                <ProjectItem
                  key={p.id}
                  project={p}
                  isActive={p.id === activeProjectId}
                />
              ))
            )}
          </div>

          {/* FILES section — active project tree */}
          <div style={{
            padding: "4px 12px 2px",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
            userSelect: "none",
            flexShrink: 0,
          }}>
            <ChevronDown size={12} />
            <span style={{ flex: 1 }}>Files</span>
            {activeProjectId && (
              <button
                title="New file"
                onClick={() => {
                  setIsCreatingFile(true);
                  setTimeout(() => {
                    document.getElementById("new-file-input")?.focus();
                  }, 50);
                }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                  display: "flex", alignItems: "center",
                }}
              >
                <Plus size={12} />
              </button>
            )}
          </div>

          <div className="file-tree">
            {isCreatingFile && (
              <form onSubmit={handleFileSubmit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px 4px 22px" }}>
                <FileIcon name={newFileName || "temp.txt"} />
                <input
                  id="new-file-input"
                  placeholder="filename.py"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (!newFileName.trim()) setIsCreatingFile(false);
                    }, 200);
                  }}
                  style={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--accent-blue)",
                    borderRadius: 4,
                    color: "var(--text-primary)",
                    fontSize: 12,
                    padding: "1px 6px",
                    outline: "none",
                    width: "100%",
                    fontFamily: "var(--font-mono)",
                  }}
                />
              </form>
            )}

            {fileTree.length === 0 && !isCreatingFile ? (
              <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-disabled)", lineHeight: 1.5 }}>
                Files appear here after the pipeline completes.
              </div>
            ) : (
              fileTree.map(node => (
                <TreeNode key={node.id} node={node} depth={0} />
              ))
            )}
          </div>
        </>
      )}

      {/* ── Search ── */}
      {activeView === "search" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}>
            <span>SEARCH</span>
          </div>
          <input
            placeholder="Search files…"
            style={{
              width: "100%", boxSizing: "border-box",
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

      {/* ── Git ── */}
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

      {/* ── Settings ── */}
      {activeView === "settings" && (
        <div style={{ padding: 12 }}>
          <div className="sidebar-header" style={{ marginBottom: 10 }}>
            <span>SETTINGS</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-disabled)" }}>Theme: Token Night</p>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-disabled)" }}>
            Backend: <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent-yellow)" }}>
              http://localhost:8000
            </code>
          </p>
        </div>
      )}
    </div>
  );
}
