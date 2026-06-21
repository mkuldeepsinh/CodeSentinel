"use client";

import { useState, useEffect, useRef } from "react";
import { useIDEStore } from "@/store/ideStore";
import { 
  GitBranch, AlertCircle, AlertTriangle, Cpu, Zap, Files, Search, Settings, 
  Folder, X, Plus, FolderOpen, Check 
} from "lucide-react";

export default function StatusBar() {
  const {
    gitBranch, cursorLine, cursorCol,
    language, errors, warnings,
    isStreaming, securityScore, scoreHistory,
    panelOpen, setPanelOpen,
    activeView, setActiveView,
    sidebarOpen,
    projectSelectorOpen, setProjectSelectorOpen,
    projectSelectorMode, setProjectSelectorMode,
    projects, activeProjectId,
    switchProject, createProject,
  } = useIDEStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const newProjectLang = "javascript";
  const modalRef = useRef<HTMLDivElement>(null);

  // Close selector modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProjectSelectorOpen(false);
    };
    if (projectSelectorOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projectSelectorOpen, setProjectSelectorOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setProjectSelectorOpen(false);
      }
    };
    if (projectSelectorOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [projectSelectorOpen, setProjectSelectorOpen]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    
    // Check if name starts with project_ prefix, strip it for check
    const cleanName = name.replace(/^project_/, "");
    const exists = Array.isArray(projects) ? projects.some(p => p.id.replace(/^project_/, "").toLowerCase() === cleanName.toLowerCase()) : false;
    if (exists) {
      alert("A project with this name already exists!");
      return;
    }

    await createProject(cleanName, newProjectLang);
    setProjectSelectorMode('list');
    setNewProjectName("");
    setProjectSelectorOpen(false);
  };

  const scoreColor = securityScore === null
    ? "var(--text-muted)"
    : securityScore >= 80 ? "var(--accent-green)"
    : securityScore >= 50 ? "var(--accent-yellow)"
    : "var(--accent-red)";

  const filteredProjects = Array.isArray(projects) ? projects.filter(p => 
    p.id.replace("project_", "").toLowerCase().includes(searchQuery.toLowerCase())
  ) : [];

  return (
    <>
      <div className="ide-statusbar">
        {/* ── Left section ── */}
        <div className="statusbar-left">
          {/* Navigation Toolbar */}
          <div style={{ display: "flex", alignItems: "center", marginRight: 12, borderRight: "1px solid var(--border-subtle)", paddingRight: 8, gap: 2 }}>
            <button
              onClick={() => setActiveView("explorer")}
              title="Explorer"
              style={{
                background: "transparent",
                border: "none",
                color: activeView === "explorer" && sidebarOpen ? "var(--accent-blue)" : "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: "2px 6px",
                borderRadius: 3,
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Files size={12} />
              <span style={{ fontSize: 10, marginLeft: 4, fontWeight: activeView === "explorer" && sidebarOpen ? 600 : 400 }}>Explore</span>
            </button>

            <button
              onClick={() => setActiveView("search")}
              title="Search"
              style={{
                background: "transparent",
                border: "none",
                color: activeView === "search" && sidebarOpen ? "var(--accent-blue)" : "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: "2px 6px",
                borderRadius: 3,
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Search size={12} />
              <span style={{ fontSize: 10, marginLeft: 4, fontWeight: activeView === "search" && sidebarOpen ? 600 : 400 }}>Search</span>
            </button>

            <button
              onClick={() => setActiveView("git")}
              title="Source Control"
              style={{
                background: "transparent",
                border: "none",
                color: activeView === "git" && sidebarOpen ? "var(--accent-blue)" : "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: "2px 6px",
                borderRadius: 3,
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <GitBranch size={12} />
              <span style={{ fontSize: 10, marginLeft: 4, fontWeight: activeView === "git" && sidebarOpen ? 600 : 400 }}>Git</span>
            </button>

            <button
              onClick={() => setActiveView("settings")}
              title="Settings"
              style={{
                background: "transparent",
                border: "none",
                color: activeView === "settings" && sidebarOpen ? "var(--accent-blue)" : "var(--text-muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: "2px 6px",
                borderRadius: 3,
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Settings size={12} />
              <span style={{ fontSize: 10, marginLeft: 4, fontWeight: activeView === "settings" && sidebarOpen ? 600 : 400 }}>Settings</span>
            </button>
          </div>

          {/* Project Selector Button */}
          <button
            onClick={() => {
              setSearchQuery("");
              setProjectSelectorMode('list');
              setProjectSelectorOpen(true);
            }}
            title="Select Workspace Project"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border-default, #3b4261)",
              color: "var(--text-bright)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "2px 8px",
              borderRadius: 4,
              marginRight: 12,
              transition: "all 0.15s ease",
              gap: 5,
            }}
            onMouseEnter={(e) => { 
              e.currentTarget.style.background = "rgba(255,255,255,0.08)"; 
              e.currentTarget.style.borderColor = "var(--accent-blue)";
            }}
            onMouseLeave={(e) => { 
              e.currentTarget.style.background = "rgba(255,255,255,0.03)"; 
              e.currentTarget.style.borderColor = "var(--border-default, #3b4261)";
            }}
          >
            <Folder size={11} style={{ color: "var(--accent-yellow)", flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {activeProjectId ? activeProjectId.replace("project_", "") : "Select Project"}
            </span>
          </button>

          {/* Git branch */}
          <span
            id="statusbar-git"
            className="statusbar-item statusbar-git"
            title="Git Branch"
          >
            <GitBranch size={11} />
            {gitBranch}
          </span>

          {/* Errors */}
          <span
            id="statusbar-errors"
            className="statusbar-item statusbar-errors"
            title={`${errors} errors`}
          >
            <AlertCircle size={11} />
            {errors}
          </span>

          {/* Warnings */}
          <span
            id="statusbar-warnings"
            className="statusbar-item statusbar-warnings"
            title={`${warnings} warnings`}
          >
            <AlertTriangle size={11} />
            {warnings}
          </span>

          {/* Streaming indicator */}
          {isStreaming && (
            <span
              className="statusbar-item"
              style={{ color: "var(--accent-blue)", gap: 4 }}
            >
              <span className="spinner" />
              Pipeline running…
            </span>
          )}
        </div>

        {/* ── Right section ── */}
        <div className="statusbar-right">
          {/* Security score */}
          {securityScore !== null && (
            <span
              id="statusbar-score"
              className="statusbar-item"
              style={{ color: scoreColor, gap: 4 }}
              title={`Security score: ${securityScore}/100 (${scoreHistory.length} iterations)`}
            >
              <Zap size={11} />
              Score: {securityScore}/100
            </span>
          )}

          {/* Language */}
          <span
            id="statusbar-lang"
            className="statusbar-item statusbar-lang"
            title="Language mode"
          >
            {language}
          </span>

          {/* Cursor position */}
          <span
            id="statusbar-cursor"
            className="statusbar-item statusbar-pos"
            title="Cursor position"
          >
            Ln {cursorLine}, Col {cursorCol}
          </span>

          {/* Encoding */}
          <span className="statusbar-item statusbar-pos">UTF-8</span>

          {/* Panel toggle */}
          <span
            id="statusbar-panel-toggle"
            className="statusbar-item"
            style={{ color: "var(--accent-blue)", cursor: "pointer" }}
            onClick={() => setPanelOpen(!panelOpen)}
            title="Toggle panel"
          >
            <Cpu size={11} />
            CodeSentinel
          </span>
        </div>
      </div>

      {/* Centered Modal Overlay Project Selector */}
      {projectSelectorOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(10, 9, 9, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}>
          <div
            ref={modalRef}
            className="slide-in-up"
            style={{
              width: 420,
              background: "var(--bg-overlay, #1f2335)",
              border: "1px solid var(--border-default, #3b4261)",
              borderRadius: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,0.6), 0 0 1px 1px rgba(255,255,255,0.05)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal Header */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-subtle, #24283b)",
              background: "rgba(0,0,0,0.15)",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-bright, #c0caf5)", display: "flex", alignItems: "center", gap: 6 }}>
                <FolderOpen size={14} style={{ color: "var(--accent-yellow)" }} />
                Select Workspace Project
              </span>
              <button
                onClick={() => setProjectSelectorOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
              >
                <X size={14} />
              </button>
            </div>

            {projectSelectorMode === 'create' ? (
              /* Create Project Mini Form */
              <form onSubmit={handleCreateProject} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Project Name</label>
                  <input
                    placeholder="my-awesome-project"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    style={{
                      background: "var(--bg-base, #1a1b26)",
                      border: "1px solid var(--accent-blue, #7aa2f7)",
                      borderRadius: 4,
                      color: "var(--text-primary)",
                      fontSize: 12,
                      padding: "6px 10px",
                      outline: "none",
                      fontFamily: "var(--font-mono)",
                    }}
                    autoFocus
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setProjectSelectorMode('list')}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border-default)",
                      borderRadius: 4,
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      background: "var(--accent-blue, #7aa2f7)",
                      border: "none",
                      borderRadius: 4,
                      color: "#fff",
                      fontSize: 11,
                      padding: "5px 12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Create & Open
                  </button>
                </div>
              </form>
            ) : (
              /* Search & Select List */
              <>
                {/* Search input */}
                <div style={{ padding: 12, borderBottom: "1px solid var(--border-subtle, #24283b)", display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <Search size={12} style={{ position: "absolute", left: 10, top: 9, color: "var(--text-disabled)" }} />
                    <input
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        background: "var(--bg-base, #1a1b26)",
                        border: "1px solid var(--border-default, #3b4261)",
                        borderRadius: 4,
                        padding: "6px 10px 6px 28px",
                        color: "var(--text-primary)",
                        fontSize: 12,
                        outline: "none",
                      }}
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={() => setProjectSelectorMode('create')}
                    title="Create New Project"
                    style={{
                      background: "rgba(122,162,247,0.1)",
                      border: "1px solid rgba(122,162,247,0.3)",
                      borderRadius: 4,
                      color: "var(--accent-blue)",
                      cursor: "pointer",
                      padding: "5px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <Plus size={12} />
                    New
                  </button>
                </div>

                {/* Project List */}
                <div style={{ maxHeight: 280, overflowY: "auto", padding: "6px 0" }}>
                  {filteredProjects.length === 0 ? (
                    <div style={{ padding: "24px 16px", fontSize: 11, color: "var(--text-disabled)", textAlign: "center" }}>
                      No projects found
                    </div>
                  ) : (
                    filteredProjects.map(p => {
                      const isActive = p.id === activeProjectId;
                      const shortName = p.id.replace("project_", "");
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            switchProject(p.id);
                            setProjectSelectorOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 16px",
                            cursor: "pointer",
                            background: isActive ? "rgba(200, 122, 83, 0.08)" : "transparent",
                            transition: "background 0.15s ease",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = isActive ? "rgba(200, 122, 83, 0.12)" : "rgba(255,255,255,0.03)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? "rgba(200, 122, 83, 0.08)" : "transparent"; }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <Folder size={13} style={{ color: isActive ? "var(--accent-blue)" : "var(--accent-yellow)", flexShrink: 0 }} />
                            <span style={{
                              fontSize: 12,
                              color: isActive ? "var(--text-bright)" : "var(--text-secondary)",
                              fontFamily: "var(--font-mono)",
                              fontWeight: isActive ? 600 : 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {shortName}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              fontSize: 9,
                              padding: "1px 5px",
                              borderRadius: 3,
                              border: "1px solid var(--border-subtle, #24283b)",
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                            }}>
                              {p.language}
                            </span>
                            {isActive && <Check size={12} style={{ color: "var(--accent-green)", flexShrink: 0 }} />}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
