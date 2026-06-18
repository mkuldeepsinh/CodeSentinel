"use client";

import { useIDEStore, PipelineEvent, PanelTab } from "@/store/ideStore";
import {
  Terminal,
  Radio,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Shield,
} from "lucide-react";
import { useRef, useEffect, useState, FormEvent, KeyboardEvent } from "react";

// ── Pipeline node order ───────────────────────────────────────────────────────
const PIPELINE_NODES = [
  "developer_agent",
  "e2b_execute",
  "semgrep_scan",
  "triage_agent",
  "synthesizer_agent",
  "e2b_verify",
  "finalize",
];

const NODE_LABELS: Record<string, string> = {
  developer_agent:   "Developer",
  e2b_execute:       "E2B Execute",
  semgrep_scan:      "Semgrep Scan",
  triage_agent:      "Triage",
  synthesizer_agent: "Synthesizer",
  e2b_verify:        "E2B Verify",
  finalize:          "Finalize",
};

// ── Node Status Pill ─────────────────────────────────────────────────────────
function NodePill({ node, status }: { node: string; status: string }) {
  const label = NODE_LABELS[node] ?? node;
  const st = status || "idle";

  return (
    <span className={`pipeline-node ${st} ${st === "running" ? "glow-blue" : st === "done" ? "glow-green" : ""}`}>
      {st === "running" && <span className="spinner" />}
      {st === "done"    && <CheckCircle2 size={10} />}
      {st === "error"   && <AlertCircle size={10} />}
      {label}
    </span>
  );
}

// ── Security Score Badge ──────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "var(--accent-green)"
    : score >= 50 ? "var(--accent-yellow)"
    : "var(--accent-red)";
  const glow = score >= 80 ? "glow-green" : score >= 50 ? "" : "glow-red";

  return (
    <div
      className={`pipeline-node ${glow}`}
      style={{
        borderColor: color,
        color,
        background: `${color}22`,
        gap: 6,
        fontSize: 12,
        padding: "3px 12px",
      }}
    >
      <Shield size={12} />
      Score: <strong>{score}/100</strong>
    </div>
  );
}

// ── Message Renderer ─────────────────────────────────────────────────────────
function EventMessage({ event }: { event: PipelineEvent }) {
  const isUser   = event.type === "user";
  const isSystem = event.type === "system";
  const isError  = event.type === "error";

  const time = event.timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Detect code blocks in message
  const renderContent = (msg: string) => {
    const codeRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let m;

    while ((m = codeRegex.exec(msg)) !== null) {
      if (m.index > lastIdx) {
        parts.push(
          <span key={lastIdx}>{msg.slice(lastIdx, m.index)}</span>
        );
      }
      parts.push(
        <pre key={m.index} className="cli-code-block">
          <code>{m[2].trim()}</code>
        </pre>
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < msg.length) {
      parts.push(<span key={lastIdx}>{msg.slice(lastIdx)}</span>);
    }
    return parts.length > 0 ? parts : msg;
  };

  if (isSystem) {
    return (
      <div className="cli-msg system">
        <span style={{ color: "var(--text-disabled)" }}>ℹ {event.message}</span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="cli-msg user">
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}>
          <span style={{ fontSize: 11, color: "var(--accent-blue)", fontWeight: 600 }}>
            You
          </span>
          <span style={{ fontSize: 10, color: "var(--text-disabled)" }}>{time}</span>
        </div>
        <div style={{ color: "var(--text-primary)" }}>{event.message}</div>
      </div>
    );
  }

  // Agent / node event
  const isNodeStart = event.type === "node_start";
  const isNodeEnd   = event.type === "node_end";
  const isDone      = event.type === "done";

  return (
    <div className={`cli-msg agent ${isError ? "" : ""}`}
      style={isError ? { borderColor: "rgba(247,118,142,0.3)" } : {}}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
      }}>
        {/* Node badge */}
        {event.node && (
          <NodePill
            node={event.node}
            status={isNodeStart ? "running" : isNodeEnd ? "done" : isError ? "error" : "idle"}
          />
        )}
        {isDone && (
          <span
            className="pipeline-node done glow-green"
            style={{ fontSize: 11 }}
          >
            <CheckCircle2 size={10} /> Pipeline Complete
          </span>
        )}
        {isError && (
          <span className="pipeline-node error" style={{ fontSize: 11 }}>
            <AlertCircle size={10} /> Error
          </span>
        )}
        <span style={{
          marginLeft: "auto",
          fontSize: 10,
          color: "var(--text-disabled)",
          flexShrink: 0,
        }}>
          {time}
        </span>
      </div>
      <div style={{
        color: isError ? "var(--accent-red)" : "var(--text-secondary)",
        fontSize: 12.5,
        lineHeight: 1.65,
      }}>
        {renderContent(event.message)}
      </div>
    </div>
  );
}

// ── Pipeline Progress Bar ─────────────────────────────────────────────────────
function PipelineProgress() {
  const { nodeStatuses, isStreaming, securityScore } = useIDEStore();

  if (!isStreaming && Object.keys(nodeStatuses).length === 0) return null;

  return (
    <div style={{
      padding: "8px 14px 6px",
      borderBottom: "1px solid var(--border-subtle)",
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 4, whiteSpace: "nowrap" }}>
        <Cpu size={11} style={{ display: "inline", marginRight: 4 }} />
        Pipeline:
      </span>
      {PIPELINE_NODES.map(node => (
        <NodePill
          key={node}
          node={node}
          status={nodeStatuses[node] ?? "idle"}
        />
      ))}
      {securityScore !== null && (
        <ScoreBadge score={securityScore} />
      )}
    </div>
  );
}

// ── Bottom Panel ─────────────────────────────────────────────────────────────
export default function BottomPanel() {
  const {
    panelOpen, setPanelOpen,
    activePanelTab, setActivePanelTab,
    pipelineEvents, isStreaming,
    currentPrompt, setCurrentPrompt,
    addEvent, setStreaming, setNodeStatus, setSecurityScore,
    clearEvents,
    tabs, activeTabId, updateTabContent,
  } = useIDEStore();

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pipelineEvents]);

  // ── SSE submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const prompt = currentPrompt.trim();
    if (!prompt || isStreaming) return;

    setCurrentPrompt("");
    setActivePanelTab("codesentinel");
    setStreaming(true);
    clearEvents();

    addEvent({ type: "user", message: prompt });
    addEvent({ type: "system", message: "Connecting to CodeSentinel pipeline..." });

    try {
      const resp = await fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, language: "javascript" }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw);
            processSSEEvent(evt);
          } catch {/* skip malformed */}
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      addEvent({ type: "error", message: `Connection failed: ${message}. Make sure the backend is running on http://localhost:8000` });
    } finally {
      setStreaming(false);
    }
  };

  // ── Process SSE events ──────────────────────────────────────────────────────
  const processSSEEvent = (evt: Record<string, unknown>) => {
    const evtType = evt.event as string ?? evt.type as string;
    const data = evt.data as Record<string, unknown> ?? {};

    if (evtType === "on_chain_start" || evtType === "node_start") {
      const node = (data.name ?? evt.name) as string;
      if (node && PIPELINE_NODES.includes(node)) {
        setNodeStatus(node, "running");
        addEvent({ type: "node_start", node, message: `Starting ${NODE_LABELS[node] ?? node}…` });
      }
    } else if (evtType === "on_chain_end" || evtType === "node_end") {
      const node = (data.name ?? evt.name) as string;
      if (node && PIPELINE_NODES.includes(node)) {
        setNodeStatus(node, "done");
        const output = data.output as Record<string, unknown> ?? {};
        const score = output.security_score as number;
        if (score !== undefined) {
          setSecurityScore(score);
          addEvent({ type: "node_end", node, message: `${NODE_LABELS[node]} complete. Security score: ${score}/100` });
        } else {
          addEvent({ type: "node_end", node, message: `${NODE_LABELS[node] ?? node} completed.` });
        }

        // If we get final code, update editor
        const finalCode = output.final_code as string ?? output.current_code as string;
        if (finalCode) {
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab) {
            updateTabContent(activeTabId!, finalCode);
          }
        }
      }
    } else if (evtType === "done") {
      addEvent({ type: "done", message: "Pipeline completed successfully. Final code is ready in the editor." });
    } else if (evtType === "error") {
      addEvent({ type: "error", message: (evt.message ?? "Pipeline error") as string });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!panelOpen) {
    return (
      <div className="ide-panel" style={{ height: 0, overflow: "hidden" }} />
    );
  }

  const PANEL_TABS: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
    { id: "codesentinel", label: "CodeSentinel", icon: <Shield size={12} /> },
    { id: "terminal",     label: "Terminal",     icon: <Terminal size={12} /> },
    { id: "output",       label: "Output",       icon: <Radio size={12} /> },
  ];

  return (
    <div className="ide-panel">
      {/* Panel tab bar */}
      <div className="panel-tabs">
        {PANEL_TABS.map(pt => (
          <button
            key={pt.id}
            id={`panel-tab-${pt.id}`}
            className={`panel-tab ${activePanelTab === pt.id ? "active" : ""}`}
            onClick={() => setActivePanelTab(pt.id)}
          >
            {pt.icon}
            {pt.label}
            {pt.id === "codesentinel" && isStreaming && (
              <span className="spinner" style={{ marginLeft: 4 }} />
            )}
          </button>
        ))}

        {/* Right controls */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <button
            title="Clear"
            onClick={clearEvents}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "2px 6px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Trash2 size={12} />
          </button>
          <button
            title="Close panel"
            onClick={() => setPanelOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "2px 6px",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className="panel-content">
        {activePanelTab === "codesentinel" && (
          <>
            <PipelineProgress />

            {/* Chat log */}
            <div className="cli-log">
              {pipelineEvents.map(evt => (
                <EventMessage key={evt.id} event={evt} />
              ))}
              <div ref={logEndRef} />
            </div>

            {/* Prompt bar */}
            <form className="cli-prompt-bar" onSubmit={handleSubmit}>
              <span className="cli-prompt-prefix">$›_</span>
              <input
                ref={inputRef}
                id="cli-input"
                className="cli-input"
                placeholder={
                  isStreaming
                    ? "Pipeline running…"
                    : "Describe the Node.js code to generate and secure…"
                }
                value={currentPrompt}
                onChange={e => setCurrentPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={isStreaming || !currentPrompt.trim()}
                style={{
                  background: currentPrompt.trim() && !isStreaming
                    ? "rgba(122, 162, 247, 0.15)"
                    : "none",
                  border: "1px solid",
                  borderColor: currentPrompt.trim() && !isStreaming
                    ? "rgba(122, 162, 247, 0.3)"
                    : "var(--border-subtle)",
                  borderRadius: 6,
                  cursor: "pointer",
                  padding: "4px 8px",
                  color: currentPrompt.trim() && !isStreaming
                    ? "var(--accent-blue)"
                    : "var(--text-disabled)",
                  display: "flex",
                  alignItems: "center",
                  transition: "all 0.15s ease",
                }}
              >
                {isStreaming
                  ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                  : <Send size={13} />
                }
              </button>
            </form>
          </>
        )}

        {activePanelTab === "terminal" && (
          <div className="cli-log">
            <div style={{ color: "var(--accent-green)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              bash-5.2$ <span style={{ color: "var(--text-secondary)" }}>cd /Users/kuldeepsinh/Desktop/CodeSentinel</span>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Use the integrated terminal or open an external terminal.
            </div>
          </div>
        )}

        {activePanelTab === "output" && (
          <div className="cli-log">
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              <span style={{ color: "var(--accent-teal)" }}>[INFO]</span> CodeSentinel backend not connected. Start the backend server to see output.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
