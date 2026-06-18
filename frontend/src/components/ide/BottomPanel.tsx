"use client";

import { useIDEStore, ChatMessage, ChatSession } from "@/store/ideStore";
import { streamGenerate, SSEEvent, PipelineState } from "@/lib/api";
import {
  Terminal, Radio, Shield, Send, Trash2, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, AlertTriangle,
  Cpu, Code2, Play, Copy, RotateCcw, ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useRef, useEffect, useState, FormEvent, KeyboardEvent, useCallback } from "react";
import ReviewModal from "./ReviewModal";

// ── Pipeline node order ───────────────────────────────────────────────────────
const PIPELINE_NODES = [
  "developer_agent", "e2b_execute", "semgrep_scan",
  "triage_agent", "synthesizer_agent", "e2b_verify", "finalize",
];
const NODE_LABELS: Record<string, string> = {
  developer_agent:   "Developer",
  e2b_execute:       "E2B Execute",
  semgrep_scan:      "Semgrep",
  triage_agent:      "Triage",
  synthesizer_agent: "Synthesizer",
  e2b_verify:        "E2B Verify",
  finalize:          "Finalize",
  semantic_cache_hit: "Cache Hit",
};

// ── Severity colors ───────────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  ERROR: "var(--accent-red)", WARNING: "var(--accent-yellow)", INFO: "var(--accent-teal)",
};

// ── Node pill ─────────────────────────────────────────────────────────────────
function NodePill({ node, status }: { node: string; status?: string }) {
  const st = status ?? "idle";
  return (
    <span className={`pipeline-node ${st} ${st === "running" ? "glow-blue" : st === "done" ? "glow-green" : ""}`}>
      {st === "running" && <span className="spinner" />}
      {st === "done"    && <CheckCircle2 size={10} />}
      {st === "error"   && <AlertCircle  size={10} />}
      {NODE_LABELS[node] ?? node}
    </span>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "var(--accent-green)" : score >= 50 ? "var(--accent-yellow)" : "var(--accent-red)";
  return (
    <span className="pipeline-node" style={{ borderColor: color, color, background: `${color}22`, gap: 6 }}>
      <Shield size={10} />
      {score}/100
    </span>
  );
}

// ── Pipeline progress bar ─────────────────────────────────────────────────────
function PipelineProgress({ nodeStatuses, score }: { nodeStatuses: Record<string, string>; score?: number }) {
  const hasAny = Object.keys(nodeStatuses).length > 0;
  if (!hasAny && score === undefined) return null;
  return (
    <div style={{
      padding: "6px 14px",
      borderBottom: "1px solid var(--border-subtle)",
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexWrap: "wrap",
      flexShrink: 0,
      background: "rgba(13,14,20,0.6)",
    }}>
      <Cpu size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 2 }}>Pipeline:</span>
      {PIPELINE_NODES.map(n => (
        <NodePill key={n} node={n} status={nodeStatuses[n]} />
      ))}
      {score !== undefined && <ScoreBadge score={score} />}
    </div>
  );
}

// ── Message renderer ──────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const renderContent = (text: string) => {
    const parts: React.ReactNode[] = [];
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    let last = 0, m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) parts.push(<span key={last}>{text.slice(last, m.index)}</span>);
      const lang = m[1];
      const code = m[2].trim();
      parts.push(
        <div key={m.index} style={{ position: "relative", marginTop: 8 }}>
          {lang && <span style={{ fontSize: 10, color: "var(--accent-teal)", marginBottom: 4, display: "block" }}>{lang}</span>}
          <pre className="cli-code-block">{code}</pre>
          <button onClick={() => copy(code)} style={{
            position: "absolute", top: lang ? 20 : 4, right: 8,
            background: "var(--bg-overlay)", border: "1px solid var(--border-default)",
            borderRadius: 4, padding: "2px 6px", fontSize: 10,
            color: copied ? "var(--accent-green)" : "var(--text-muted)", cursor: "pointer",
          }}>
            {copied ? "✓" : <Copy size={10} />}
          </button>
        </div>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(<span key={last}>{text.slice(last)}</span>);
    return parts.length ? parts : text;
  };

  if (msg.role === "system") {
    return (
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <span style={{ fontSize: 11, color: "var(--text-disabled)", background: "var(--bg-overlay)", padding: "2px 10px", borderRadius: 999 }}>
          {msg.content}
        </span>
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="cli-msg user">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "var(--accent-blue)", fontWeight: 600 }}>You</span>
          <span style={{ fontSize: 10, color: "var(--text-disabled)" }}>{time}</span>
        </div>
        <div style={{ color: "var(--text-primary)" }}>{msg.content}</div>
      </div>
    );
  }

  if (msg.role === "node_start" || msg.role === "node_end") {
    const isStart = msg.role === "node_start";
    return (
      <div className="cli-msg agent" style={{ padding: "6px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {msg.node && <NodePill node={msg.node} status={isStart ? "running" : (msg.nodeStatus ?? "done")} />}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-disabled)" }}>{time}</span>
        </div>
        {msg.content && (
          <div style={{ marginTop: 5, fontSize: 12, color: "var(--text-muted)" }}>{msg.content}</div>
        )}
      </div>
    );
  }

  if (msg.role === "done") {
    return (
      <div className="cli-msg agent" style={{ borderColor: "rgba(158,206,106,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span className="pipeline-node done glow-green">
            <CheckCircle2 size={10} /> Pipeline Complete
          </span>
          {msg.scoreHistory && msg.scoreHistory.length > 0 && (
            <ScoreBadge score={msg.scoreHistory[msg.scoreHistory.length - 1]} />
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-disabled)" }}>{time}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>
          {renderContent(msg.content)}
        </div>
        {msg.codeBlock && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Code2 size={11} style={{ color: "var(--accent-teal)" }} />
              <span style={{ fontSize: 11, color: "var(--accent-teal)" }}>Generated Code</span>
              <button onClick={() => copy(msg.codeBlock!)} style={{
                marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 11,
              }}>
                <Copy size={10} /> {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="cli-code-block" style={{ maxHeight: 200, overflow: "auto" }}>
              {msg.codeBlock.slice(0, 2000)}{msg.codeBlock.length > 2000 ? "\n... (see editor)" : ""}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (msg.role === "error") {
    return (
      <div className="cli-msg agent" style={{ borderColor: "rgba(247,118,142,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="pipeline-node error"><AlertCircle size={10} /> Error</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-disabled)" }}>{time}</span>
        </div>
        <div style={{ color: "var(--accent-red)", fontSize: 12 }}>{msg.content}</div>
      </div>
    );
  }

  if (msg.role === "cache") {
    return (
      <div className="cli-msg agent" style={{ borderColor: "rgba(187,154,247,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span className="pipeline-node" style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)", background: "rgba(187,154,247,0.1)" }}>
            ⚡ Semantic Cache Hit
          </span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-disabled)" }}>{time}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{msg.content}</div>
      </div>
    );
  }

  // Generic agent message
  return (
    <div className="cli-msg agent">
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.65 }}>
        {renderContent(msg.content)}
      </div>
      <span style={{ fontSize: 10, color: "var(--text-disabled)", marginTop: 4, display: "block" }}>{time}</span>
    </div>
  );
}

// ── Findings panel ────────────────────────────────────────────────────────────
function FindingsPanel({ session }: { session: ChatSession | null }) {
  const findings = session?.findings ?? [];
  const triage = session?.triageOutput;

  if (!session) {
    return <div className="cli-log"><div style={{ color: "var(--text-disabled)", fontSize: 12 }}>No active session.</div></div>;
  }

  return (
    <div className="cli-log">
      {triage && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Triage Verdict</span>
            <span style={{
              padding: "2px 8px", borderRadius: 999, fontSize: 11,
              background: triage.verdict === "clean" ? "rgba(158,206,106,0.15)" : "rgba(247,118,142,0.15)",
              color: triage.verdict === "clean" ? "var(--accent-green)" : "var(--accent-red)",
              border: `1px solid ${triage.verdict === "clean" ? "var(--accent-green)" : "var(--accent-red)"}`,
            }}>
              {triage.verdict === "clean" ? "✓ Clean" : "⚠ Fix Required"}
            </span>
            <ScoreBadge score={triage.security_score} />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>{triage.reasoning}</p>
        </div>
      )}

      {session.scoreHistory && session.scoreHistory.length > 1 && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Score History</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {session.scoreHistory.map((s, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <ChevronRight size={10} style={{ color: "var(--text-disabled)" }} />}
                <ScoreBadge score={s} />
              </span>
            ))}
          </div>
        </div>
      )}

      {findings.length === 0 ? (
        <div style={{ color: "var(--text-disabled)", fontSize: 12, textAlign: "center", marginTop: 20 }}>
          {session.finalScore === 100 ? "✓ No findings — code is clean!" : "Run pipeline to see findings."}
        </div>
      ) : (
        findings.map((f, i) => (
          <div key={i} style={{
            padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: 6,
            border: `1px solid ${SEV_COLOR[f.severity] ?? "var(--border-subtle)"}22`,
            marginBottom: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <AlertTriangle size={12} style={{ color: SEV_COLOR[f.severity] }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: SEV_COLOR[f.severity] }}>{f.severity}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>L{f.line}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 4 }}>{f.message}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{f.check_id}</div>
            {(f.cwe.length > 0 || f.owasp.length > 0) && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {f.cwe.map(c => (
                  <span key={c} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "rgba(247,118,142,0.1)", color: "var(--accent-red)", border: "1px solid rgba(247,118,142,0.2)" }}>{c}</span>
                ))}
                {f.owasp.map(o => (
                  <span key={o} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "rgba(122,162,247,0.1)", color: "var(--accent-blue)", border: "1px solid rgba(122,162,247,0.2)" }}>{o}</span>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {session.executionStdout && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--accent-green)", marginBottom: 4 }}>stdout</div>
          <pre className="cli-code-block">{session.executionStdout}</pre>
        </div>
      )}
      {session.executionStderr && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--accent-red)", marginBottom: 4 }}>stderr</div>
          <pre className="cli-code-block" style={{ color: "var(--accent-red)" }}>{session.executionStderr}</pre>
        </div>
      )}
    </div>
  );
}

// ── Output panel (execution + audit trail) ────────────────────────────────────
function OutputPanel({ session }: { session: ChatSession | null }) {
  if (!session) return <div className="cli-log"><div style={{ color: "var(--text-disabled)", fontSize: 12 }}>No active session.</div></div>;

  return (
    <div className="cli-log">
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
        Project: <span style={{ color: "var(--accent-blue)" }}>{session.id}</span>
        {session.devRetries !== undefined && (
          <> · Dev retries: <span style={{ color: "var(--accent-yellow)" }}>{session.devRetries}</span></>
        )}
        {session.securityIterations !== undefined && (
          <> · Sec iterations: <span style={{ color: "var(--accent-purple)" }}>{session.securityIterations}</span></>
        )}
      </div>

      {session.executionStdout && (
        <div>
          <div style={{ fontSize: 11, color: "var(--accent-green)", marginBottom: 4 }}>
            ✓ Execution stdout {session.executionSuccess ? "(success)" : ""}
          </div>
          <pre className="cli-code-block">{session.executionStdout}</pre>
        </div>
      )}
      {session.executionStderr && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: "var(--accent-red)", marginBottom: 4 }}>✗ Execution stderr</div>
          <pre className="cli-code-block" style={{ color: "var(--accent-red)" }}>{session.executionStderr}</pre>
        </div>
      )}

      {session.auditTrail && session.auditTrail.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Audit Trail ({session.auditTrail.length} iterations)</div>
          {session.auditTrail.map((entry, i) => (
            <div key={i} style={{ padding: "6px 10px", background: "var(--bg-elevated)", borderRadius: 6, marginBottom: 4, border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Iteration {i + 1}</div>
              <pre style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "auto", maxHeight: 100 }}>
                {JSON.stringify(entry, null, 2).slice(0, 500)}
              </pre>
            </div>
          ))}
        </div>
      )}

      {!session.executionStdout && !session.auditTrail?.length && (
        <div style={{ color: "var(--text-disabled)", fontSize: 12 }}>No output yet. Run pipeline first.</div>
      )}
    </div>
  );
}

// ── Main BottomPanel ──────────────────────────────────────────────────────────
export default function BottomPanel() {
  const {
    panelOpen, setPanelOpen,
    activePanelTab, setActivePanelTab,
    sessions, activeSessionId,
    isStreaming, nodeStatuses,
    currentPrompt, setCurrentPrompt,
    currentLanguage,
    createSession, addMessage, updateSession, applyDoneState,
    setStreaming, setNodeStatus, resetNodeStatuses,
    backendOnline,
    openActiveProjectInFinder,
  } = useIDEStore();

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const abortRef  = useRef<(() => void) | null>(null);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;

  // Auto-scroll chat
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages?.length]);

  // ── Submit pipeline ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    const prompt = currentPrompt.trim();
    if (!prompt || isStreaming) return;

    setCurrentPrompt("");
    setActivePanelTab("codesentinel");
    setStreaming(true);
    resetNodeStatuses();

    // Create a new session
    const session = createSession(prompt, currentLanguage);
    const sid = session.id;

    addMessage(sid, { role: "user", content: prompt });
    addMessage(sid, { role: "system", content: "Connecting to CodeSentinel backend…" });

    // Stream from backend
    const abort = streamGenerate(
      { prompt, language: currentLanguage },
      (evt: SSEEvent) => {
        switch (evt.type) {
          case "node_start": {
            const { node } = evt.data;
            setNodeStatus(node, "running");
            addMessage(sid, { role: "node_start", node, content: `${NODE_LABELS[node] ?? node} started…`, nodeStatus: "running" });
            break;
          }
          case "node_end": {
            const { node, output } = evt.data;
            setNodeStatus(node, "done");
            const score = (output as Partial<PipelineState>).security_score;
            addMessage(sid, {
              role: "node_end",
              node,
              content: score !== undefined
                ? `${NODE_LABELS[node] ?? node} done — security score: ${score}/100`
                : `${NODE_LABELS[node] ?? node} done`,
              nodeStatus: "done",
            });
            // Update partial session state as it arrives
            updateSession(sid, {
              finalScore: score ?? activeSession?.finalScore,
              scoreHistory: (output as Partial<PipelineState>).score_history ?? activeSession?.scoreHistory,
            });
            break;
          }
          case "done": {
            const state = evt.data;
            applyDoneState(sid, state);
            // Update project_id from backend (backend assigns one)
            if (state.project_id && state.project_id !== sid) {
              updateSession(sid, { id: state.project_id } as never);
            }
            const code = state.final_code || state.current_code;
            addMessage(sid, {
              role: "done",
              content: `Pipeline complete. Security score: ${state.security_score}/100. Final code loaded in editor.`,
              codeBlock: code?.slice(0, 3000),
              scoreHistory: state.score_history,
            });
            break;
          }
          case "error": {
            const { message } = evt.data;
            setNodeStatus("error", "error");
            addMessage(sid, { role: "error", content: message });
            break;
          }
        }
      },
      () => { // onDone
        setStreaming(false);
        abortRef.current = null;
      },
      (msg) => { // onError
        addMessage(sid, { role: "error", content: `Connection error: ${msg}\n\nMake sure backend is running: cd backend && uvicorn main:app --reload` });
        setStreaming(false);
        abortRef.current = null;
      }
    );

    abortRef.current = abort;
  }, [
    currentPrompt, currentLanguage, isStreaming, activeSession,
    createSession, addMessage, updateSession, applyDoneState,
    setCurrentPrompt, setActivePanelTab, setStreaming, resetNodeStatuses, setNodeStatus,
  ]);

  const handleStop = () => {
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
    if (activeSessionId) {
      addMessage(activeSessionId, { role: "system", content: "Pipeline stopped by user." });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  if (!panelOpen) return <div className="ide-panel" style={{ height: 0, overflow: "hidden" }} />;

  const PANEL_TABS = [
    { id: "codesentinel" as const, label: "CodeSentinel", icon: <Shield size={12} /> },
    { id: "findings"     as const, label: "Findings",     icon: <AlertTriangle size={12} /> },
    { id: "output"       as const, label: "Output",       icon: <Radio size={12} /> },
    { id: "terminal"     as const, label: "Terminal",     icon: <Terminal size={12} /> },
  ];

  const activeScore = activeSession?.finalScore;

  return (
    <div className="ide-panel">
      {/* Tab bar */}
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
            {pt.id === "codesentinel" && isStreaming && <span className="spinner" style={{ marginLeft: 4 }} />}
            {pt.id === "findings" && activeSession?.findings?.length
              ? <span style={{ marginLeft: 4, background: "var(--accent-red)", color: "#fff", borderRadius: 999, fontSize: 10, padding: "0 5px", minWidth: 16, textAlign: "center" }}>{activeSession.findings.length}</span>
              : null}
          </button>
        ))}

        {/* Backend status dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", marginRight: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: backendOnline ? "var(--accent-green)" : "var(--accent-red)",
          }} title={backendOnline ? "Backend online" : "Backend offline"} />
          <span style={{ fontSize: 10, color: "var(--text-disabled)" }}>{backendOnline ? "connected" : "offline"}</span>
        </div>

        <button
          title="Close panel"
          onClick={() => setPanelOpen(false)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 8px", display: "flex", alignItems: "center" }}
        >
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Panel content */}
      <div className="panel-content">
        {/* ── CodeSentinel chat tab ── */}
        {activePanelTab === "codesentinel" && (
          <>
            <PipelineProgress nodeStatuses={nodeStatuses} score={activeScore} />

            <div className="cli-log">
              {!activeSession && (
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-disabled)" }}>
                  <Shield size={28} style={{ opacity: 0.2, marginBottom: 10 }} />
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>CodeSentinel ready</p>
                  <p style={{ fontSize: 12, marginTop: 6 }}>Type a requirement below to start the security pipeline.</p>
                </div>
              )}
              {activeSession?.messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={logEndRef} />
            </div>

            {/* Project status bar (Write / Open) */}
            {activeSession && activeSession.finalCode && (
              <div style={{
                padding: "8px 14px",
                borderTop: "1px solid var(--border-subtle)",
                borderBottom: "1px solid var(--border-subtle)",
                background: "rgba(30, 41, 59, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                  <ShieldCheck size={13} style={{ color: "var(--accent-green)" }} />
                  {activeSession.projectDir ? (
                    <span style={{ color: "var(--text-primary)" }}>
                      Saved on disk: <code style={{ color: "var(--accent-blue)" }}>{activeSession.projectDir}</code>
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>
                      Code generated successfully with safety score <strong style={{ color: "var(--accent-green)" }}>{activeSession.finalScore}%</strong>.
                    </span>
                  )}
                </div>

                {activeSession.projectDir ? (
                  <button
                    onClick={() => openActiveProjectInFinder()}
                    style={{
                      background: "rgba(122,162,247,0.12)",
                      border: "1px solid rgba(122,162,247,0.25)",
                      borderRadius: 4,
                      padding: "4px 10px",
                      fontSize: 11,
                      color: "var(--accent-blue)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "all 0.15s"
                    }}
                  >
                    Open Folder
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReviewModalOpen(true)}
                    style={{
                      background: "var(--accent-green)",
                      border: "none",
                      borderRadius: 4,
                      padding: "4px 12px",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "all 0.15s"
                    }}
                  >
                    Review & Write
                  </button>
                )}
              </div>
            )}

            {/* Prompt bar */}
            <form className="cli-prompt-bar" onSubmit={handleSubmit}>
              <span className="cli-prompt-prefix">$›_</span>
              <input
                ref={inputRef}
                id="cli-input"
                className="cli-input"
                placeholder={isStreaming ? "Pipeline running…" : "Describe Node.js code to generate and secure…"}
                value={currentPrompt}
                onChange={e => setCurrentPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                autoComplete="off"
                spellCheck={false}
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  style={{
                    background: "rgba(247,118,142,0.15)", border: "1px solid rgba(247,118,142,0.3)",
                    borderRadius: 6, cursor: "pointer", padding: "4px 10px",
                    color: "var(--accent-red)", display: "flex", alignItems: "center", gap: 4, fontSize: 12,
                  }}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!currentPrompt.trim()}
                  style={{
                    background: currentPrompt.trim() ? "rgba(122,162,247,0.15)" : "none",
                    border: "1px solid",
                    borderColor: currentPrompt.trim() ? "rgba(122,162,247,0.3)" : "var(--border-subtle)",
                    borderRadius: 6, cursor: "pointer", padding: "4px 8px",
                    color: currentPrompt.trim() ? "var(--accent-blue)" : "var(--text-disabled)",
                    display: "flex", alignItems: "center", transition: "all 0.15s ease",
                  }}
                >
                  <Send size={13} />
                </button>
              )}
            </form>
          </>
        )}

        {/* ── Findings tab ── */}
        {activePanelTab === "findings" && <FindingsPanel session={activeSession} />}

        {/* ── Output tab ── */}
        {activePanelTab === "output" && <OutputPanel session={activeSession} />}

        {/* ── Terminal tab ── */}
        {activePanelTab === "terminal" && (
          <div className="cli-log">
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              <span style={{ color: "var(--accent-green)" }}>bash-5.2$</span>
              <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>cd /Users/kuldeepsinh/Desktop/CodeSentinel/backend</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4 }}>
              <span style={{ color: "var(--accent-green)" }}>bash-5.2$</span>
              <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>uvicorn main:app --reload --port 8000</span>
            </div>
            {!backendOnline && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(247,118,142,0.08)", border: "1px solid rgba(247,118,142,0.2)", borderRadius: 6 }}>
                <p style={{ fontSize: 12, color: "var(--accent-red)" }}>Backend offline. Run command above to start.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {activeSession && (
        <ReviewModal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          code={activeSession.finalCode || ""}
          projectId={activeSession.id}
          language={activeSession.language}
        />
      )}
    </div>
  );
}
