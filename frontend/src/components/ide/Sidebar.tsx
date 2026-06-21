"use client";

import { useIDEStore, FileNode } from "@/store/ideStore";
import { useAuthStore } from "@/store/authStore";
import { Project } from "@/lib/api";
import { getLanguageLabel } from "@/lib/languages";
import { API_BASE } from "@/lib/config";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  File,
  FileCode,
  FileText,
  FileJson,
  Plus,
  RefreshCw,
  Clock,
  Trash2,
  Edit2,
} from "lucide-react";
import { useEffect, useState } from "react";

// ── File Icon ─────────────────────────────────────────────────────────────────
function FileIcon({ name, language }: { name: string; language?: string }) {
  const ext  = name.split(".").pop()?.toLowerCase() ?? "";
  const lang = language?.toLowerCase() ?? ext;
  const style = { flexShrink: 0 };

  if (lang === "python"     || ext === "py")
    return <FileCode size={14} style={{ ...style, color: "var(--accent-blue)" }} />;
  if (lang === "typescript" || ext === "tsx" || ext === "ts")
    return <FileCode size={14} style={{ ...style, color: "var(--accent-cyan)" }} />;
  if (lang === "javascript" || ext === "js" || ext === "jsx")
    return <FileCode size={14} style={{ ...style, color: "var(--accent-yellow)" }} />;
  if (lang === "json"  || ext === "json")
    return <FileJson size={14} style={{ ...style, color: "var(--accent-green)" }} />;
  if (lang === "go"    || ext === "go")
    return <FileCode size={14} style={{ ...style, color: "var(--accent-teal)" }} />;
  if (lang === "rust"  || ext === "rs")
    return <FileCode size={14} style={{ ...style, color: "var(--accent-orange)" }} />;
  if (ext === "md"     || ext === "mdx")
    return <FileText size={14} style={{ ...style, color: "var(--accent-teal)" }} />;
  if (ext === "css"    || ext === "scss")
    return <File     size={14} style={{ ...style, color: "var(--accent-purple)" }} />;
  if (ext === "sh"     || ext === "bash")
    return <File     size={14} style={{ ...style, color: "var(--accent-green)" }} />;
  if (name.startsWith(".env"))
    return <File     size={14} style={{ ...style, color: "var(--accent-orange)" }} />;
  return   <File     size={14} style={{ ...style, color: "var(--text-muted)" }} />;
}

// ── Tree Node ─────────────────────────────────────────────────────────────────
interface TreeNodeProps {
  node: FileNode;
  depth: number;
  creatingNodeId: string | null;
  setCreatingNodeId: (v: string | null) => void;
  creatingType: "file" | "folder" | null;
  setCreatingType: (v: "file" | "folder" | null) => void;
  creatingName: string;
  setCreatingName: (v: string) => void;
  handleInlineSubmit: (e: React.FormEvent) => void;
}

function TreeNode({ 
  node, 
  depth,
  creatingNodeId,
  setCreatingNodeId,
  creatingType,
  setCreatingType,
  creatingName,
  setCreatingName,
  handleInlineSubmit
}: TreeNodeProps) {
  const { selectedFileId, expandedFolders, openFile, toggleFolder } = useIDEStore();
  const isExpanded = (expandedFolders instanceof Set) ? expandedFolders.has(node.id) : false;
  const isSelected = selectedFileId === node.id;
  const isFolder   = node.type === "folder";
  const isSentinel = node.name === ".sentinel";
  const paddingLeft = 8 + depth * 14;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [isHovered, setIsHovered] = useState(false);

  const isSystemNode = isSentinel || node.name === "security_report.md" || node.name === "agent.md" || node.id.includes("/.sentinel/") || node.isLive;

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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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
            ? <FolderOpen size={14} style={{ color: isSentinel ? "var(--text-disabled)" : "var(--accent-yellow)", flexShrink: 0 }} />
            : <Folder     size={14} style={{ color: isSentinel ? "var(--text-disabled)" : "var(--accent-yellow)", flexShrink: 0 }} />
        ) : (
          <FileIcon name={node.name} language={node.language} />
        )}

        {isEditing ? (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                setIsEditing(false);
                if (editName.trim() && editName.trim() !== node.name) {
                  const { activeProjectId, renameNode } = useIDEStore.getState();
                  if (activeProjectId) {
                    await renameNode(activeProjectId, node.id, editName.trim());
                  }
                }
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setIsEditing(false);
                setEditName(node.name);
              }
            }}
            onBlur={async () => {
              setIsEditing(false);
              if (editName.trim() && editName.trim() !== node.name) {
                const { activeProjectId, renameNode } = useIDEStore.getState();
                if (activeProjectId) {
                  await renameNode(activeProjectId, node.id, editName.trim());
                }
              } else {
                setEditName(node.name);
              }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--bg-overlay)",
              border: "1px solid var(--accent-blue)",
              borderRadius: 3,
              color: "var(--text-primary)",
              fontSize: 12,
              padding: "0px 4px",
              outline: "none",
              width: "110px",
              fontFamily: "var(--font-mono)",
            }}
            autoFocus
          />
        ) : (
          <span className="tree-item-name" style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: 13 }}>
            {node.name}
          </span>
        )}

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

        {/* Action icons on hover */}
        {isHovered && !isSystemNode && !isEditing && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", paddingRight: 4, flexShrink: 0 }}>
            {isFolder && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreatingNodeId(node.id);
                    setCreatingType("file");
                    setCreatingName("");
                    if (!isExpanded) toggleFolder(node.id);
                  }}
                  title="New File"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                    display: "flex", alignItems: "center",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--accent-blue)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-disabled)"}
                >
                  <Plus size={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreatingNodeId(node.id);
                    setCreatingType("folder");
                    setCreatingName("");
                    if (!isExpanded) toggleFolder(node.id);
                  }}
                  title="New Folder"
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                    display: "flex", alignItems: "center",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--accent-blue)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-disabled)"}
                >
                  <FolderPlus size={11} />
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              title="Rename"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                display: "flex", alignItems: "center",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--accent-blue)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-disabled)"}
            >
              <Edit2 size={11} />
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${node.name}?`)) {
                  const { activeProjectId, deleteNode } = useIDEStore.getState();
                  if (activeProjectId) {
                    await deleteNode(activeProjectId, node.id);
                  }
                }
              }}
              title="Delete"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                display: "flex", alignItems: "center",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--accent-red)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--text-disabled)"}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {isFolder && isExpanded && (
        <>
          {creatingNodeId === node.id && (
            <div style={{ 
              paddingLeft: paddingLeft + 14, 
              display: "flex", 
              alignItems: "center", 
              gap: 6, 
              paddingTop: 2, 
              paddingBottom: 2 
            }}>
              {creatingType === "folder" 
                ? <Folder size={13} style={{ color: "var(--accent-yellow)", flexShrink: 0 }} /> 
                : <File size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              }
              <form onSubmit={handleInlineSubmit} style={{ flex: 1 }}>
                <input
                  id="inline-creation-input"
                  placeholder={creatingType === "folder" ? "folder-name" : "filename.py"}
                  value={creatingName}
                  onChange={e => setCreatingName(e.target.value)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (!creatingName.trim()) {
                        setCreatingNodeId(null);
                        setCreatingType(null);
                      }
                    }, 200);
                  }}
                  style={{
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--accent-blue)",
                    borderRadius: 3,
                    color: "var(--text-primary)",
                    fontSize: 12,
                    padding: "0px 4px",
                    outline: "none",
                    width: "110px",
                    fontFamily: "var(--font-mono)",
                  }}
                  autoFocus
                />
              </form>
            </div>
          )}

          {node.children
            ?.filter(child => child.name !== ".keep" && child.name !== ".DS_Store")
            .map(child => (
              <TreeNode 
                key={child.id} 
                node={child} 
                depth={depth + 1}
                creatingNodeId={creatingNodeId}
                setCreatingNodeId={setCreatingNodeId}
                creatingType={creatingType}
                setCreatingType={setCreatingType}
                creatingName={creatingName}
                setCreatingName={setCreatingName}
                handleInlineSubmit={handleInlineSubmit}
              />
            ))
          }
        </>
      )}
    </>
  );
}

// ── Project Item ──────────────────────────────────────────────────────────────
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

function ProjectItem({ project, isActive }: { project: Project; isActive: boolean }) {
  const { switchProject, fileTree, deleteProject, renameProject } = useIDEStore();
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.id.replace("project_", ""));

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
    if (isActive || loading || isEditing) return;
    setLoading(true);
    try {
      await switchProject(project.id);
    } finally {
      setLoading(false);
    }
  };

  const shortId = project.id.replace("project_", "");
  const langLabel = getLanguageLabel(project.language);

  if (confirmDelete) {
    return (
      <div
        style={{
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "space-between",
          padding:         "5px 12px",
          background:      "rgba(217, 83, 79, 0.08)",
          borderLeft:      "2px solid var(--accent-red)",
          userSelect:      "none",
          minHeight:       32,
        }}
      >
        <span style={{
          fontSize: 11,
          color: "var(--accent-red)",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
        }}>
          Delete {shortId}?
        </span>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              setLoading(true);
              try {
                await deleteProject(project.id);
              } finally {
                setLoading(false);
                setConfirmDelete(false);
              }
            }}
            style={{
              background: "var(--accent-red)",
              color: "#fff",
              border: "none",
              borderRadius: 3,
              fontSize: 10,
              padding: "2px 6px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Confirm
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(false);
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: 3,
              fontSize: 10,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`project-item-${project.id}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           6,
        padding:       "5px 12px",
        cursor:        isActive ? "default" : "pointer",
        background:    isActive ? "rgba(200, 122, 83, 0.08)" : "transparent",
        borderLeft:    isActive ? "2px solid var(--accent-blue)" : "2px solid transparent",
        transition:    "background 0.1s ease",
        userSelect:    "none",
      }}
    >
      <Folder size={13} style={{
        color:    isActive ? "var(--accent-blue)" : "var(--accent-yellow)",
        flexShrink: 0,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing ? (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                setIsEditing(false);
                if (editName.trim() && editName.trim() !== project.id.replace("project_", "")) {
                  setLoading(true);
                  try {
                    await renameProject(project.id, editName.trim());
                  } finally {
                    setLoading(false);
                  }
                }
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setIsEditing(false);
                setEditName(project.id.replace("project_", ""));
              }
            }}
            onBlur={async () => {
              setIsEditing(false);
              if (editName.trim() && editName.trim() !== project.id.replace("project_", "")) {
                setLoading(true);
                try {
                  await renameProject(project.id, editName.trim());
                } finally {
                  setLoading(false);
                }
              } else {
                setEditName(project.id.replace("project_", ""));
              }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--bg-overlay)",
              border: "1px solid var(--accent-blue)",
              borderRadius: 4,
              color: "var(--text-primary)",
              fontSize: 12,
              padding: "1px 6px",
              outline: "none",
              width: "85%",
              fontFamily: "var(--font-mono)",
            }}
            autoFocus
          />
        ) : (
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
        )}
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
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {topScore !== null && <ScoreChip score={topScore} />}
          {isHovered && !isEditing && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                title="Rename project"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  borderRadius: 3,
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.1s, background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--accent-blue)";
                  e.currentTarget.style.background = "rgba(122,162,247,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Edit2 size={12} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                title="Delete project"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  borderRadius: 3,
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.1s, background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--accent-red)";
                  e.currentTarget.style.background = "rgba(217, 83, 79, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const {
    sidebarOpen, activeView,
    fileTree,
    projects, activeProjectId,
    loadProjects,
    createProject, createFile,
    setProjectSelectorOpen, setProjectSelectorMode,
  } = useIDEStore();

  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectLanguage, setNewProjectLanguage] = useState("python");

  const [creatingNodeId, setCreatingNodeId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(null);
  const [creatingName, setCreatingName] = useState("");

  // Focus inline input on trigger
  useEffect(() => {
    if (creatingNodeId) {
      document.getElementById("inline-creation-input")?.focus();
    }
  }, [creatingNodeId]);

  // Load projects from backend on mount
  useEffect(() => {
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

  const handleInlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = creatingName.trim();
    if (!name || !activeProjectId || !creatingNodeId) return;

    setCreatingNodeId(null);
    setCreatingName("");
    setCreatingType(null);

    const parentRelativePath = creatingNodeId
      .replace(`${activeProjectId}/`, "")
      .replace(activeProjectId, "");

    let filePath = "";
    let initialContent = "";
    if (creatingType === "folder") {
      filePath = parentRelativePath ? `${parentRelativePath}/${name}/.keep` : `${name}/.keep`;
    } else {
      filePath = parentRelativePath ? `${parentRelativePath}/${name}` : name;
      
      const ext = name.split(".").pop()?.toLowerCase();
      if (ext === "py") {
        initialContent = "# Python file\n";
      } else if (ext === "js" || ext === "ts" || ext === "tsx" || ext === "jsx") {
        initialContent = "// JavaScript/TypeScript file\n";
      } else if (ext === "md") {
        initialContent = `# ${name}\n`;
      }
    }

    await createFile(activeProjectId, filePath, initialContent);
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

          {activeProjectId ? (
            <>
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
                <div style={{ display: "flex", gap: 2 }}>
                  <button
                    title="New file"
                    onClick={() => {
                      setCreatingNodeId(activeProjectId);
                      setCreatingType("file");
                      setCreatingName("");
                    }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                      display: "flex", alignItems: "center",
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--accent-blue)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--text-disabled)"}
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    title="New folder"
                    onClick={() => {
                      setCreatingNodeId(activeProjectId);
                      setCreatingType("folder");
                      setCreatingName("");
                    }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--text-disabled)", padding: "1px 3px", borderRadius: 3,
                      display: "flex", alignItems: "center",
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--accent-blue)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--text-disabled)"}
                  >
                    <FolderPlus size={12} />
                  </button>
                </div>
              </div>

              <div className="file-tree" style={{ flex: 1, overflowY: "auto" }}>
                {creatingNodeId === activeProjectId && (
                  <form onSubmit={handleInlineSubmit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px 4px 22px" }}>
                    {creatingType === "folder" 
                      ? <Folder size={14} style={{ color: "var(--accent-yellow)", flexShrink: 0 }} /> 
                      : <FileIcon name={creatingName} />
                    }
                    <input
                      id="inline-creation-input"
                      placeholder={creatingType === "folder" ? "folder-name" : "filename.py"}
                      value={creatingName}
                      onChange={e => setCreatingName(e.target.value)}
                      onBlur={() => {
                        setTimeout(() => {
                          if (!creatingName.trim()) {
                            setCreatingNodeId(null);
                            setCreatingType(null);
                          }
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
                      autoFocus
                    />
                  </form>
                )}

                {fileTree.filter(node => node.id === activeProjectId).length === 0 && !creatingNodeId ? (
                  <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-disabled)", lineHeight: 1.5 }}>
                    Files appear here after the pipeline completes.
                  </div>
                ) : (
                  fileTree
                    .filter(node => node.id === activeProjectId)
                    .map(node => (
                      <TreeNode 
                        key={node.id} 
                        node={node} 
                        depth={0} 
                        creatingNodeId={creatingNodeId}
                        setCreatingNodeId={setCreatingNodeId}
                        creatingType={creatingType}
                        setCreatingType={setCreatingType}
                        creatingName={creatingName}
                        setCreatingName={setCreatingName}
                        handleInlineSubmit={handleInlineSubmit}
                      />
                    ))
                )}
              </div>
            </>
          ) : (
            <div style={{
              padding: "24px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              color: "var(--text-secondary)",
              fontSize: 12,
            }}>
              <div style={{
                background: "rgba(122, 162, 247, 0.05)",
                border: "1px dashed var(--border-default, #3b4261)",
                borderRadius: 6,
                padding: 16,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}>
                <FolderOpen size={24} style={{ color: "var(--accent-yellow)", opacity: 0.8 }} />
                <div style={{ fontWeight: 600, color: "var(--text-bright, #c0caf5)" }}>No Project Selected</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Select an existing workspace project or create a new one to start coding.
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={() => {
                    setProjectSelectorMode('list');
                    setProjectSelectorOpen(true);
                  }}
                  style={{
                    background: "var(--accent-blue, #7aa2f7)",
                    border: "none",
                    color: "#fff",
                    borderRadius: 4,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#89aefd"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-blue, #7aa2f7)"; }}
                >
                  <FolderOpen size={14} />
                  Open Project
                </button>

                <button
                  onClick={() => {
                    setProjectSelectorMode('create');
                    setProjectSelectorOpen(true);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-default, #3b4261)",
                    color: "var(--text-secondary)",
                    borderRadius: 4,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                    e.currentTarget.style.borderColor = "var(--text-muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "var(--border-default, #3b4261)";
                  }}
                >
                  <Plus size={14} />
                  Create Project
                </button>
              </div>
            </div>
          )}
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
              {API_BASE}
            </code>
          </p>

          <div style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--border-default)",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Account Profile
            </div>
            <div style={{
              background: "rgba(10, 9, 9, 0.4)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              padding: 10,
              marginBottom: 12,
            }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.email}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "capitalize", marginTop: 2 }}>
                Provider: {user?.provider}
              </div>
            </div>
            <button
              onClick={() => logout()}
              style={{
                width: "100%",
                background: "var(--accent-red)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "8px 12px",
                fontWeight: 600,
                fontSize: 11,
                cursor: "pointer",
                transition: "opacity 0.2s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
