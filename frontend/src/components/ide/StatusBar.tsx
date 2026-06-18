"use client";

import { useIDEStore } from "@/store/ideStore";
import { GitBranch, AlertCircle, AlertTriangle, Cpu, Zap, Wifi, WifiOff } from "lucide-react";

const LANGUAGES = ["javascript", "typescript", "python"];

export default function StatusBar() {
  const {
    gitBranch, cursorLine, cursorCol,
    language, errors, warnings,
    isStreaming, sessions, activeSessionId,
    panelOpen, setPanelOpen, setActivePanelTab,
    backendOnline, backendHealth,
    currentLanguage, setCurrentLanguage,
  } = useIDEStore();

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const score = activeSession?.finalScore;
  const scoreColor = score === undefined ? "var(--text-muted)"
    : score >= 80 ? "var(--accent-green)"
    : score >= 50 ? "var(--accent-yellow)"
    : "var(--accent-red)";

  return (
    <div className="ide-statusbar">
      {/* ── Left ── */}
      <div className="statusbar-left">

        {/* Backend status */}
        <span
          id="statusbar-backend"
          className="statusbar-item"
          style={{ color: backendOnline ? "var(--accent-green)" : "var(--accent-red)", gap: 4 }}
          title={backendOnline
            ? `Backend online · ${backendHealth?.checkpointer ?? ""} · LangSmith: ${backendHealth?.langsmith_tracing ? "active" : "off"}`
            : "Backend offline — start: uvicorn main:app --reload"}
        >
          {backendOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
          {backendOnline ? "backend" : "offline"}
        </span>

        {/* Git branch */}
        <span id="statusbar-git" className="statusbar-item statusbar-git" title="Git branch">
          <GitBranch size={11} />
          {gitBranch}
        </span>

        {/* Errors */}
        <span id="statusbar-errors" className="statusbar-item statusbar-errors" title={`${errors} errors`}>
          <AlertCircle size={11} />
          {errors}
        </span>

        {/* Warnings */}
        <span id="statusbar-warnings" className="statusbar-item statusbar-warnings" title={`${warnings} warnings`}>
          <AlertTriangle size={11} />
          {warnings}
        </span>

        {/* Streaming */}
        {isStreaming && (
          <span className="statusbar-item" style={{ color: "var(--accent-blue)", gap: 4 }}>
            <span className="spinner" />
            Pipeline running…
          </span>
        )}

        {/* LangSmith */}
        {backendOnline && backendHealth?.langsmith_tracing && (
          <span className="statusbar-item" style={{ color: "var(--accent-purple)", fontSize: 10 }}>
            ◉ LangSmith
          </span>
        )}
      </div>

      {/* ── Right ── */}
      <div className="statusbar-right">

        {/* Security score */}
        {score !== undefined && (
          <span
            id="statusbar-score"
            className="statusbar-item"
            style={{ color: scoreColor, gap: 4 }}
            title={`Security score: ${score}/100`}
          >
            <Zap size={11} />
            {score}/100
          </span>
        )}

        {/* Language selector */}
        <select
          id="statusbar-lang-select"
          value={currentLanguage}
          onChange={e => setCurrentLanguage(e.target.value)}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--accent-teal)", fontSize: 11, outline: "none",
            fontFamily: "var(--font-ui)", padding: "0 4px",
          }}
          title="Select language"
        >
          {LANGUAGES.map(l => (
            <option key={l} value={l} style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>

        {/* File language mode */}
        <span id="statusbar-lang" className="statusbar-item statusbar-lang" title="Language mode">
          {language}
        </span>

        {/* Cursor */}
        <span id="statusbar-cursor" className="statusbar-item statusbar-pos" title="Cursor position">
          Ln {cursorLine}, Col {cursorCol}
        </span>

        <span className="statusbar-item statusbar-pos">UTF-8</span>

        {/* Panel toggle */}
        <span
          id="statusbar-panel-toggle"
          className="statusbar-item"
          style={{ color: "var(--accent-blue)", cursor: "pointer" }}
          onClick={() => { setPanelOpen(!panelOpen); setActivePanelTab("codesentinel"); }}
          title="Toggle CodeSentinel panel"
        >
          <Cpu size={11} />
          CodeSentinel
        </span>
      </div>
    </div>
  );
}
