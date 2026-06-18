"use client";

import { useIDEStore, ChatSession } from "@/store/ideStore";
import { fetchProjects, fetchGenerations } from "@/lib/api";
import {
  Clock, Shield, Trash2, RefreshCw, ChevronRight,
  CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";

// ── Score badge ───────────────────────────────────────────────────────────────
function MiniScore({ score }: { score: number }) {
  const color = score >= 80 ? "var(--accent-green)" : score >= 50 ? "var(--accent-yellow)" : "var(--accent-red)";
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 999,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      flexShrink: 0,
    }}>
      {score}/100
    </span>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────
function SessionCard({ session, isActive, onSelect, onDelete }: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const time = new Date(session.updatedAt).toLocaleDateString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "8px 12px",
        cursor: "pointer",
        borderRadius: 6,
        margin: "2px 6px",
        background: isActive ? "rgba(122,162,247,0.12)" : "transparent",
        border: `1px solid ${isActive ? "rgba(122,162,247,0.25)" : "transparent"}`,
        transition: "all 0.12s ease",
        position: "relative",
      }}
      className={isActive ? "" : "tree-item"}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {/* Status icon */}
        {session.finalScore !== undefined ? (
          session.finalScore >= 80
            ? <CheckCircle2 size={11} style={{ color: "var(--accent-green)", flexShrink: 0 }} />
            : <AlertCircle  size={11} style={{ color: "var(--accent-yellow)", flexShrink: 0 }} />
        ) : (
          <Shield size={11} style={{ color: "var(--text-disabled)", flexShrink: 0 }} />
        )}

        <span style={{
          fontSize: 12, fontWeight: 500,
          color: isActive ? "var(--text-bright)" : "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        }}>
          {session.projectName}
        </span>

        {session.finalScore !== undefined && <MiniScore score={session.finalScore} />}

        {/* Delete button */}
        <button
          onClick={onDelete}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-disabled)", padding: "1px 2px",
            display: "flex", alignItems: "center", opacity: 0, transition: "opacity 0.15s",
          }}
          className="session-delete-btn"
        >
          <Trash2 size={10} />
        </button>
      </div>

      <div style={{
        fontSize: 11, color: "var(--text-muted)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}>
        {session.prompt}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-disabled)" }}>{time}</span>
        <span style={{
          fontSize: 10, padding: "0 5px", borderRadius: 999,
          background: "var(--bg-overlay)", color: "var(--text-disabled)",
        }}>
          {session.language}
        </span>
        {session.messages.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-disabled)", marginLeft: "auto" }}>
            {session.messages.length} msg
          </span>
        )}
      </div>
    </div>
  );
}

// ── History Sidebar ───────────────────────────────────────────────────────────
export default function HistorySidebar() {
  const {
    sessions, activeSessionId,
    setActiveSession, deleteSession,
    loadSessionFromBackend,
    setActivePanelTab, setPanelOpen,
  } = useIDEStore();

  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Load projects from backend
  const syncFromBackend = useCallback(async () => {
    setLoading(true);
    try {
      const projects = await fetchProjects();
      for (const project of projects) {
        try {
          const generations = await fetchGenerations(project.id);
          loadSessionFromBackend(project, generations);
        } catch {
          loadSessionFromBackend(project, []);
        }
      }
      setLastSync(new Date());
    } catch (err) {
      console.warn("History sync failed:", err);
    } finally {
      setLoading(false);
    }
  }, [loadSessionFromBackend]);

  // Auto-sync on mount
  useEffect(() => {
    syncFromBackend();
  }, [syncFromBackend]);

  const handleSelect = (session: ChatSession) => {
    setActiveSession(session.id);
    setPanelOpen(true);
    setActivePanelTab("codesentinel");
  };

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
  };

  return (
    <div className="ide-sidebar slide-in-left" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div className="sidebar-header">
        <span>CHAT HISTORY</span>
        <button
          onClick={syncFromBackend}
          disabled={loading}
          title="Sync from backend"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", display: "flex", alignItems: "center",
            padding: 2, borderRadius: 4,
          }}
        >
          {loading
            ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
            : <RefreshCw size={12} />
          }
        </button>
      </div>

      {lastSync && (
        <div style={{ padding: "4px 12px", fontSize: 10, color: "var(--text-disabled)" }}>
          Synced {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0" }}>
        {sessions.length === 0 ? (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-disabled)" }}>
            <Clock size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
            <p style={{ fontSize: 12 }}>No sessions yet.</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>Type a prompt in CodeSentinel to start.</p>
          </div>
        ) : (
          sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => handleSelect(session)}
              onDelete={(e) => handleDelete(e, session.id)}
            />
          ))
        )}
      </div>

      {/* CSS for delete button hover */}
      <style>{`
        div:hover .session-delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
