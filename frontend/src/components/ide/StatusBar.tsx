"use client";

import { useIDEStore } from "@/store/ideStore";
import { GitBranch, AlertCircle, AlertTriangle, Cpu, Zap } from "lucide-react";

export default function StatusBar() {
  const {
    gitBranch, cursorLine, cursorCol,
    language, errors, warnings,
    isStreaming, securityScore, scoreHistory,
    panelOpen, setPanelOpen,
  } = useIDEStore();

  const scoreColor = securityScore === null
    ? "var(--text-muted)"
    : securityScore >= 80 ? "var(--accent-green)"
    : securityScore >= 50 ? "var(--accent-yellow)"
    : "var(--accent-red)";

  return (
    <div className="ide-statusbar">
      {/* ── Left section ── */}
      <div className="statusbar-left">

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
  );
}
