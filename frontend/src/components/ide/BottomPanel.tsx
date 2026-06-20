"use client";

import { useIDEStore, PipelineEvent, PanelTab, AuditSnapshot, SemgrepFinding, CreateProjectParams, FileNode } from "@/store/ideStore";
import { streamGenerate, sendChatPrompt, ChatMessage as ApiChatMessage } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import TerminalTab from "@/components/ide/TerminalTab";
import {
  Terminal,
  Radio,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  Trash2,
  ChevronDown,
  Cpu,
  Shield,
  BarChart2,
  Zap,
  RotateCw,
  Globe,
} from "lucide-react";
import { useRef, useEffect, useState, FormEvent } from "react";

// ── Pipeline node order ───────────────────────────────────────────────────────
const PIPELINE_NODES = [
  "developer_agent",
  "sandbox_execute",
  "semgrep_scan",
  "triage_agent",
  "synthesizer_agent",
  "sandbox_verify",
  "finalize",
];

const NODE_LABELS: Record<string, string> = {
  developer_agent:    "Developer",
  sandbox_execute:    "Sandbox Execute",
  semgrep_scan:       "Semgrep Scan",
  triage_agent:       "Triage",
  synthesizer_agent:  "Synthesizer",
  sandbox_verify:     "Sandbox Verify",
  finalize:           "Finalize",
  semantic_cache_hit: "Cache Hit",
  chat:               "CodeSentinel",
};

// ── Node Status Pill ──────────────────────────────────────────────────────────
function NodePill({ node, status }: { node: string; status: string }) {
  const label = NODE_LABELS[node] ?? node;
  const st    = status || "idle";
  return (
    <span className={`pipeline-node ${st} ${st === "running" ? "glow-blue" : st === "done" ? "glow-green" : ""}`}>
      {st === "running" && <span className="spinner" />}
      {st === "done"    && <CheckCircle2 size={10} />}
      {st === "error"   && <AlertCircle  size={10} />}
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
      style={{ borderColor: color, color, background: `${color}22`, gap: 6, fontSize: 12, padding: "3px 12px" }}
    >
      <Shield size={12} />
      Score: <strong>{score}/100</strong>
    </div>
  );
}

// ── Score Sparkline (SVG, no library) ─────────────────────────────────────────
function ScoreSparkline({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const W = 72, H = 18;

  const pts = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * W;
      const y = H - (v / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const dotColor = (v: number) =>
    v >= 80 ? "var(--accent-green)" : v >= 50 ? "var(--accent-yellow)" : "var(--accent-red)";

  return (
    <svg width={W} height={H} style={{ overflow: "visible", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke="var(--accent-blue)" strokeWidth={1.5} strokeLinejoin="round" />
      {history.map((v, i) => (
        <circle
          key={i}
          cx={((i / (history.length - 1)) * W).toFixed(1)}
          cy={(H - (v / 100) * H).toFixed(1)}
          r={2.5}
          fill={dotColor(v)}
        />
      ))}
    </svg>
  );
}

// ── Message Renderer ──────────────────────────────────────────────────────────
function EventMessage({ event }: { event: PipelineEvent }) {
  const isUser   = event.type === "user";
  const isSystem = event.type === "system";
  const isError  = event.type === "error";

  const time = event.timestamp.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const renderContent = (msg: string) => {
    const codeRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIdx = 0, m;
    while ((m = codeRegex.exec(msg)) !== null) {
      if (m.index > lastIdx) parts.push(<span key={lastIdx} style={{ whiteSpace: "pre-wrap" }}>{msg.slice(lastIdx, m.index)}</span>);
      parts.push(
        <pre key={m.index} className="cli-code-block">
          <code>{m[2].trim()}</code>
        </pre>
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < msg.length) parts.push(<span key={lastIdx} style={{ whiteSpace: "pre-wrap" }}>{msg.slice(lastIdx)}</span>);
    return parts.length > 0 ? parts : <span style={{ whiteSpace: "pre-wrap" }}>{msg}</span>;
  };

  if (isSystem) {
    return (
      <div className="cli-line">
        <span className="cli-timestamp">[{time}]</span>
        <span className="cli-system-icon">ℹ</span>
        <span className="cli-system-text">{event.message}</span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="cli-line">
        <span className="cli-timestamp">[{time}]</span>
        <span className="cli-prompt-indicator">$›</span>
        <span className="cli-user-text">{event.message}</span>
      </div>
    );
  }

  const isNodeStart = event.type === "node_start";
  const isNodeEnd   = event.type === "node_end";
  const isDone      = event.type === "done";

  let indicator = "●";
  let indicatorColor = "var(--text-muted)";
  if (isNodeStart) {
    indicator = "⠋";
    indicatorColor = "var(--accent-blue)";
  } else if (isNodeEnd || isDone) {
    indicator = "✔";
    indicatorColor = "var(--accent-green)";
  } else if (isError) {
    indicator = "✗";
    indicatorColor = "var(--accent-red)";
  }

  const label = event.node ? (NODE_LABELS[event.node] ?? event.node) : "";

  return (
    <div className={`cli-line ${isError ? "error" : ""}`}>
      <span className="cli-timestamp">[{time}]</span>
      <span className="cli-agent-indicator" style={{ color: indicatorColor }}>{indicator}</span>
      {label && (
        <span className="cli-node-tag" style={{
          color: event.node === "developer_agent" ? "var(--accent-blue)"
            : event.node === "semgrep_scan" ? "var(--accent-yellow)"
            : event.node === "triage_agent" ? "var(--accent-purple)"
            : event.node === "synthesizer_agent" ? "var(--accent-teal)"
            : event.node === "sandbox_execute" || event.node === "sandbox_verify" ? "var(--accent-pink)"
            : "var(--accent-cyan)"
        }}>
          [{label}]
        </span>
      )}
      <span className="cli-agent-text">
        {renderContent(event.message)}
      </span>
    </div>
  );
}

// ── Pipeline Progress Bar ─────────────────────────────────────────────────────
function PipelineProgress() {
  const { nodeStatuses, isStreaming, securityScore, scoreHistory } = useIDEStore();
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
        <NodePill key={node} node={node} status={nodeStatuses[node] ?? "idle"} />
      ))}
      {securityScore !== null && <ScoreBadge score={securityScore} />}
      {scoreHistory.length >= 2 && (
        <div style={{ marginLeft: 4, display: "flex", alignItems: "center" }}>
          <ScoreSparkline history={scoreHistory} />
        </div>
      )}
    </div>
  );
}

// ── Audit Trail Tab ───────────────────────────────────────────────────────────
function AuditTrailPanel() {
  const { auditTrail } = useIDEStore();

  if (auditTrail.length === 0) {
    return (
      <div className="cli-log" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
        <div style={{ color: "var(--text-disabled)", fontSize: 12, textAlign: "center" }}>
          <BarChart2 size={24} style={{ opacity: 0.3, display: "block", margin: "0 auto 8px" }} />
          No audit data yet. Run the pipeline first.
        </div>
      </div>
    );
  }

  return (
    <div className="cli-log">
      {auditTrail.map((snap: AuditSnapshot, i: number) => {
        const color = snap.score >= 80 ? "var(--accent-green)"
          : snap.score >= 50 ? "var(--accent-yellow)"
          : "var(--accent-red)";
        return (
          <div
            key={i}
            className="cli-msg agent"
            style={{ borderColor: `${color}40`, marginBottom: 8 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
              }}>
                Iteration {snap.iteration}
              </span>
              <span style={{
                fontSize: 11,
                color,
                padding: "1px 8px",
                borderRadius: 4,
                border: `1px solid ${color}66`,
                background: `${color}11`,
              }}>
                {snap.score}/100
              </span>
              {snap.findings.length === 0 && (
                <span style={{ fontSize: 11, color: "var(--accent-green)" }}>
                  <CheckCircle2 size={10} style={{ display: "inline", marginRight: 3 }} />
                  Clean
                </span>
              )}
            </div>
            {snap.findings.length > 0 && (
              <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                {snap.findings.map((f: SemgrepFinding, j: number) => (
                  <div key={j} style={{
                    display: "flex", gap: 6, alignItems: "flex-start",
                    color: "var(--text-secondary)", marginBottom: 2,
                  }}>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 10,
                      padding: "0 5px",
                      borderRadius: 3,
                      border: "1px solid",
                      borderColor: f.severity === "ERROR" ? "var(--accent-red)"
                        : f.severity === "WARNING" ? "var(--accent-yellow)"
                        : "var(--text-disabled)",
                      color: f.severity === "ERROR" ? "var(--accent-red)"
                        : f.severity === "WARNING" ? "var(--accent-yellow)"
                        : "var(--text-disabled)",
                    }}>
                      {f.severity}
                    </span>
                    <span style={{ color: "var(--accent-blue)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {f.check_id}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      {f.path ? `${f.path}:` : ""}line {f.line} — {f.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Web Preview Panel ─────────────────────────────────────────────────────────
function WebPreviewPanel() {
  const [urlInput, setUrlInput] = useState("http://localhost:3001");
  const [iframeUrl, setIframeUrl] = useState("http://localhost:3001");
  const [key, setKey] = useState(0);

  const handleRefresh = () => {
    setKey(k => k + 1);
  };

  const handleGo = (e: FormEvent) => {
    e.preventDefault();
    let target = urlInput.trim();
    if (!/^https?:\/\//i.test(target)) {
      target = `http://${target}`;
      setUrlInput(target);
    }
    setIframeUrl(target);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0d1117" }}>
      {/* Browser address bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={handleRefresh}
          title="Reload preview"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            padding: 4,
            borderRadius: 4,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--bg-highlight)"}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          <RotateCw size={12} />
        </button>

        <form onSubmit={handleGo} style={{ flex: 1, display: "flex" }}>
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 4,
              color: "var(--text-bright)",
              fontSize: 11,
              padding: "4px 10px",
              outline: "none",
              fontFamily: "var(--font-mono)",
            }}
          />
        </form>
      </div>

      {/* Frame view */}
      <div style={{ flex: 1, width: "100%", background: "#ffffff", position: "relative" }}>
        <iframe
          key={key}
          src={iframeUrl}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#ffffff",
          }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  );
}

// ── Bottom Panel ──────────────────────────────────────────────────────────────
export default function BottomPanel() {
  const {
    panelOpen, setPanelOpen,
    activePanelTab, setActivePanelTab,
    pipelineEvents, isStreaming,
    currentPrompt, setCurrentPrompt,
    currentLanguage, setCurrentLanguage,
    addEvent, setStreaming, setNodeStatus, setSecurityScore,
    clearEvents, loadProjects,
    updateLiveCode, createProjectFiles,
    appendAuditSnapshot, setAuditTrail,
    scanRequest, setScanRequest,
    activeProjectId, tabs, activeTabId, fileTree,
    saveChatHistory,
    terminalSessionId,
    setTerminalRunRequest,
    terminalRunRequest,
  } = useIDEStore();

  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [confirmData, setConfirmData] = useState<{ prompt: string; fileRelativePath: string } | null>(null);
  const [chatMode, setChatMode] = useState<"pipeline" | "chat">("pipeline");
  const [terminalMounted, setTerminalMounted] = useState<boolean>(false);

  // Keep terminal mounted after the first time it is opened or code is run
  useEffect(() => {
    if (activePanelTab === "terminal" || terminalRunRequest) {
      setTerminalMounted(true);
    }
  }, [activePanelTab, terminalRunRequest]);

  // Auto-scroll chat log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pipelineEvents]);

  // Health check on mount
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setBackendOk(d?.status === "ok"))
      .catch(() => setBackendOk(false));
  }, []);

  // ── Scan request from EditorZone ───────────────────────────────────────────
  // When the user clicks "Scan & Secure" on an open file, EditorZone writes
  // a scanRequest to the store. We pick it up here and run the pipeline.
  useEffect(() => {
    if (!scanRequest || isStreaming) return;
    const { code, language } = scanRequest;
    setScanRequest(null); // consume immediately to avoid re-trigger

    const doScan = async () => {
      setActivePanelTab("codesentinel");
      setStreaming(true);
      clearEvents();

      addEvent({ type: "user",   message: `Scanning ${language} code (${code.split("\n").length} lines)…` });
      addEvent({ type: "system", message: "Skipping developer_agent — running security scan on your code…" });

      try {
        for await (const { eventType, data } of streamGenerate(
          "Analyse and secure this code",
          language,
          activeProjectId || undefined,
          code,
          true,
        )) {
          processSSEEvent(eventType, data, language);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        addEvent({ type: "error", message: `Scan failed: ${message}` });
      } finally {
        setStreaming(false);
        loadProjects().catch(console.error);
      }
    };

    doScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanRequest]);

  // ── SSE Event Processor ─────────────────────────────────────────────────────
  const processSSEEvent = (
    eventType: string,
    data: Record<string, unknown>,
    capturedLanguage: string,
  ) => {
    switch (eventType) {
      case "node_start": {
        const node = data.node as string;
        if (node === "semantic_cache_hit") {
          addEvent({ type: "node_start", node, message: "⚡ Semantic cache hit — retrieving cached result…" });
        } else if (node && PIPELINE_NODES.includes(node)) {
          setNodeStatus(node, "running");
          addEvent({ type: "node_start", node, message: `▶ ${NODE_LABELS[node] ?? node} starting…` });
        }
        break;
      }

      case "node_end": {
        const node   = data.node as string;
        const output = (data.output ?? {}) as Record<string, unknown>;

        if (node === "semantic_cache_hit") {
          const score = output.security_score as number;
          if (score != null) setSecurityScore(score);
          addEvent({ type: "node_end", node, message: `⚡ Cache hit complete. Score: ${score}/100. File loaded from memory.` });
          break;
        }

        if (!node || !PIPELINE_NODES.includes(node)) break;
        setNodeStatus(node, "done");

        // Live code preview during developer / synthesizer
        if (node === "developer_agent" || node === "synthesizer_agent") {
          const code = output.current_code as string | undefined;
          if (code) updateLiveCode(code, capturedLanguage);
        }

        // Triage output
        if (node === "triage_agent") {
          const score  = output.security_score as number;
          if (score != null) setSecurityScore(score);

          const triage   = (output.triage_output ?? {}) as Record<string, unknown>;
          const verdict  = triage.verdict as string ?? "unknown";
          const findings = (triage.findings_to_fix as SemgrepFinding[]) ?? [];
          const snaps    = (output.audit_trail as AuditSnapshot[]) ?? [];
          snaps.forEach(s => appendAuditSnapshot(s));

          addEvent({
            type: "node_end",
            node,
            message: `Triage: ${verdict.toUpperCase()}. Score: ${score}/100. ${findings.length} finding(s) to fix.`,
          });

        } else if (node === "sandbox_execute" || node === "sandbox_verify") {
          const success = output.execution_success as boolean;
          const stdout  = (output.execution_stdout as string) ?? "";
          const stderr  = (output.execution_stderr as string) ?? "";
          
          let msg = `${NODE_LABELS[node]} ${success ? "✓ passed" : "✗ failed"}.`;
          if (stdout.trim()) {
            msg += `\nStdout:\n\`\`\`\n${stdout.trim()}\n\`\`\``;
          }
          if (stderr.trim()) {
            msg += `\nStderr:\n\`\`\`\n${stderr.trim()}\n\`\`\``;
          }
          if (!stdout.trim() && !stderr.trim()) {
            msg += " No output recorded.";
          }

          addEvent({
            type: "node_end",
            node,
            message: msg,
          });

        } else if (node === "semgrep_scan") {
          const findings = (output.raw_semgrep_findings as unknown[]) ?? [];
          addEvent({ type: "node_end", node, message: `Semgrep found ${findings.length} issue(s).` });

        } else {
          addEvent({ type: "node_end", node, message: `${NODE_LABELS[node] ?? node} completed.` });
        }
        break;
      }

      case "done": {
        // data IS the full state_accumulator from the backend
        const state = data as {
          project_id:     string;
          user_prompt:    string;
          language:       string;
          final_code:     string;
          current_code:   string;
          audit_trail:    AuditSnapshot[];
          score_history:  number[];
          security_score: number;
          triage_output:  {
            verdict:          string;
            reasoning:        string;
            findings_to_fix:  SemgrepFinding[];
          } | null;
        };

        // Set authoritative audit trail from final state
        setAuditTrail(state.audit_trail ?? []);

        const triage    = state.triage_output;
        const finalCode = state.final_code || state.current_code || "";

        const params: CreateProjectParams = {
          projectId:     state.project_id,
          prompt:        state.user_prompt,
          language:      state.language ?? capturedLanguage,
          finalCode,
          auditTrail:    state.audit_trail    ?? [],
          scoreHistory:  state.score_history  ?? [],
          securityScore: state.security_score ?? 0,
          verdict:       triage?.verdict       ?? "clean",
          reasoning:     triage?.reasoning     ?? "",
          findings:      triage?.findings_to_fix ?? [],
        };

        createProjectFiles(params);

        addEvent({
          type:    "done",
          message: `✅ Pipeline complete. Score: ${state.security_score}/100. Files saved to project "${state.project_id}".`,
        });
        break;
      }

      case "error": {
        addEvent({
          type:    "error",
          message: (data.message as string) ?? "Unknown pipeline error.",
        });
        break;
      }
    }
  };

  const startGenerationPipeline = async (
    prompt: string,
    selectedFileRelativePath?: string,
    shouldClearCurrentFile?: boolean
  ) => {
    const capturedLanguage = currentLanguage;
    setCurrentPrompt("");
    setActivePanelTab("codesentinel");
    setStreaming(true);

    addEvent({ type: "user",   message: prompt });
    addEvent({ type: "system", message: "Connecting to CodeSentinel pipeline…" });

    const projectNode = fileTree.find(n => n.id === activeProjectId);
    const filesMap: Record<string, string> = {};
    const extractFiles = (node: FileNode) => {
      if (node.type === "file") {
        const relativePath = node.id.replace(`${activeProjectId}/`, "");
        if (
          relativePath !== "security_report.md" &&
          !relativePath.startsWith(".sentinel/")
        ) {
          if (relativePath === selectedFileRelativePath && shouldClearCurrentFile) {
            filesMap[relativePath] = "";
          } else {
            filesMap[relativePath] = node.content ?? "";
          }
        }
      } else if (node.children) {
        node.children.forEach(extractFiles);
      }
    };
    if (projectNode) {
      extractFiles(projectNode);
    }

    const hasNoFiles = Object.keys(filesMap).length === 0;

    // Build instruction prompt based on whether file is selected or not
    let finalPrompt = prompt;
    if (selectedFileRelativePath) {
      if (shouldClearCurrentFile) {
        finalPrompt += `\n\n[System Instruction: Regenerate the solution from scratch inside the file "${selectedFileRelativePath}". Make sure the file content starts empty and write the code there.]`;
      } else {
        finalPrompt += `\n\n[System Instruction: Edit/refine the existing code inside the file "${selectedFileRelativePath}". Preserve all other files/structure.]`;
      }
    } else {
      // If no file selected, create a new file matching the language's standard name
      const defaultFileName = capturedLanguage === "python" ? "main.py" : capturedLanguage === "go" ? "main.go" : capturedLanguage === "rust" ? "main.rs" : capturedLanguage === "typescript" ? "index.ts" : "index.js";
      if (hasNoFiles) {
        filesMap[defaultFileName] = "";
      }
      finalPrompt += `\n\n[System Instruction: Write the code inside a new file. Use "${defaultFileName}" unless another filename is more appropriate.]`;
    }

    const codeContent = JSON.stringify({ files: filesMap });

    try {
      for await (const { eventType, data } of streamGenerate(
        finalPrompt,
        capturedLanguage,
        activeProjectId || undefined,
        codeContent,
        false, // skipDeveloper = false (run developer_agent!)
      )) {
        processSSEEvent(eventType, data, capturedLanguage);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      addEvent({
        type:    "error",
        message: `Connection failed: ${message}. Make sure the backend is running on ${API_BASE}`,
      });
    } finally {
      setStreaming(false);
      // Refresh project list after pipeline completes
      loadProjects().catch(console.error);
    }
  };

  const handleConfirmChoice = (choice: "edit" | "regenerate" | "cancel") => {
    if (!confirmData) return;
    const { prompt, fileRelativePath } = confirmData;
    setConfirmData(null);

    if (choice === "cancel") return;

    startGenerationPipeline(prompt, fileRelativePath, choice === "regenerate");
  };

  // Listen for keyboard shortcuts when confirm dialog is active
  useEffect(() => {
    if (!confirmData) return;
    const handleKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "e") {
        handleConfirmChoice("edit");
      } else if (key === "r") {
        handleConfirmChoice("regenerate");
      } else if (key === "c" || e.key === "Escape") {
        handleConfirmChoice("cancel");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [confirmData]);

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const prompt = currentPrompt.trim();
    if (!prompt || isStreaming) return;

    if (chatMode === "chat") {
      setCurrentPrompt("");
      setStreaming(true);

      addEvent({ type: "user", message: prompt, node: "chat" });
      addEvent({ type: "system", message: "Connecting to CodeSentinel Chat…", node: "chat" });

      try {
        const formattedHistory: ApiChatMessage[] = [];
        pipelineEvents.forEach(evt => {
          if (evt.type === "user" && evt.node === "chat") {
            formattedHistory.push({ role: "user", content: evt.message });
          } else if (evt.type === "node_end" && evt.node === "chat") {
            formattedHistory.push({ role: "assistant", content: evt.message });
          }
        });

        const response = await sendChatPrompt(
          activeProjectId || "default",
          prompt,
          formattedHistory
        );

        addEvent({
          type: "node_end",
          node: "chat",
          message: response.response,
        });

        if (activeProjectId) {
          await saveChatHistory(activeProjectId);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        addEvent({
          type: "error",
          message: `Chat failed: ${message}`,
          node: "chat",
        });
      } finally {
        setStreaming(false);
      }
      return;
    }

    // Check if prompt is a sandbox run command
    const isRunCmd = /^(run(\s+.*)?|\.\/.*|python[3]?\s+.*|node\s+.*|go\s+run\s+.*)$/i.test(prompt);

    if (isRunCmd) {
      setCurrentPrompt("");
      if (!activeProjectId) return;

      // Gather current file tree contents
      const projectNode = fileTree.find(n => n.id === activeProjectId);
      const filesMap: Record<string, string> = {};
      const extractFiles = (node: FileNode) => {
        if (node.type === "file") {
          const relativePath = node.id.replace(`${activeProjectId}/`, "");
          if (
            relativePath !== "security_report.md" &&
            !relativePath.startsWith(".sentinel/")
          ) {
            filesMap[relativePath] = node.content ?? "";
          }
        } else if (node.children) {
          node.children.forEach(extractFiles);
        }
      };
      if (projectNode) {
        extractFiles(projectNode);
      }

      const activeTab = tabs.find(t => t.id === activeTabId);

      // Determine command to run
      let command = prompt.trim();
      if (command.toLowerCase().startsWith("run")) {
        let filename = "";
        if (command.toLowerCase() === "run") {
          filename = activeTab ? activeTab.fileId.replace(`${activeProjectId}/`, "") : "";
        } else {
          filename = command.substring(3).trim(); // strip "run"
        }

        if (filename) {
          const ext = filename.split(".").pop()?.toLowerCase();
          const activeLanguage = (activeTab?.language || currentLanguage || "javascript").toLowerCase();
          if (ext === "py" || activeLanguage === "python") {
            command = `python3 ${filename}`;
          } else if (ext === "ts" || activeLanguage === "typescript") {
            command = `npx tsx ${filename}`;
          } else {
            command = `node ${filename}`;
          }
        }
      }

      // Queue terminal run request
      setTerminalRunRequest({
        files: filesMap,
        command,
      });

      // Open terminal tab
      setPanelOpen(true);
      setActivePanelTab("terminal");
      return;
    }

    // Check if there is a selected file with content
    const activeTab = tabs.find(t => t.id === activeTabId);
    const hasSelectedFile = activeTab && activeTab.fileId.startsWith(`${activeProjectId}/`) && !activeTab.isLive && activeTab.fileId !== `${activeProjectId}/security_report.md` && !activeTab.fileId.startsWith(`${activeProjectId}/.sentinel/`);
    const selectedFileRelativePath = hasSelectedFile ? activeTab.fileId.replace(`${activeProjectId}/`, "") : undefined;
    const currentContent = activeTab?.content ?? "";

    if (selectedFileRelativePath && currentContent.trim().length > 0) {
      // Code is present in current file, we must confirm from the user
      setConfirmData({ prompt, fileRelativePath: selectedFileRelativePath });
    } else {
      // Proceed directly
      startGenerationPipeline(prompt, selectedFileRelativePath, false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const PANEL_TABS: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
    { id: "codesentinel", label: "CodeSentinel", icon: <Shield   size={12} /> },
    { id: "audit",        label: "Audit Trail",  icon: <BarChart2 size={12} /> },
    { id: "terminal",     label: "Terminal",     icon: <Terminal  size={12} /> },
    { id: "preview",      label: "Web Preview",  icon: <Globe     size={12} /> },
    { id: "output",       label: "Output",       icon: <Radio     size={12} /> },
  ];

  return (
    <div className="ide-panel" style={!panelOpen ? { display: "none" } : undefined}>
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

        {/* Backend health indicator */}
        {backendOk !== null && (
          <div style={{
            marginLeft: 8,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: backendOk ? "var(--accent-green)" : "var(--accent-red)",
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: backendOk ? "var(--accent-green)" : "var(--accent-red)",
            }} />
            {backendOk ? "Backend connected" : "Backend offline"}
          </div>
        )}

        {/* Right controls */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <button
            title="Clear"
            onClick={clearEvents}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 6px", borderRadius: 4, display: "flex", alignItems: "center" }}
          >
            <Trash2 size={12} />
          </button>
          <button
            title="Close panel"
            onClick={() => setPanelOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 6px", borderRadius: 4, display: "flex", alignItems: "center" }}
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className="panel-content">

        {/* ── CodeSentinel Tab ── */}
        {activePanelTab === "codesentinel" && (
          <>
            {confirmData && (
              <div style={{
                position: "absolute",
                bottom: 60,
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--bg-base)",
                border: "1px solid var(--border-strong)",
                borderRadius: 4,
                padding: "16px 20px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
                zIndex: 1000,
                width: "92%",
                maxWidth: 480,
                fontFamily: "var(--font-mono)",
                animation: "fadeSlideUp 0.15s ease-out forwards",
              }}>
                <h4 style={{ margin: "0 0 8px 0", fontSize: 13, fontWeight: 600, color: "var(--accent-yellow)" }}>
                  ⚠️ File contains code: {confirmData.fileRelativePath}
                </h4>
                <p style={{ margin: "0 0 16px 0", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  Choose execution mode:
                  <br />
                  • <strong style={{ color: "var(--accent-blue)" }}>[E]dit</strong>: build on top of existing code
                  <br />
                  • <strong style={{ color: "var(--accent-yellow)" }}>[R]egenerate</strong>: rewrite from scratch
                  <br />
                  • <strong style={{ color: "var(--text-muted)" }}>[C]ancel</strong> / Escape
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => handleConfirmChoice("cancel")}
                    style={{
                      background: "none", border: "1px solid var(--border-default)", borderRadius: 3,
                      color: "var(--text-secondary)", fontSize: 11, padding: "6px 14px", cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    [C]ancel
                  </button>
                  <button
                    onClick={() => handleConfirmChoice("regenerate")}
                    style={{
                      background: "none", border: "1px solid var(--accent-yellow)", borderRadius: 3,
                      color: "var(--accent-yellow)", fontSize: 11, padding: "6px 14px", cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    [R]egenerate
                  </button>
                  <button
                    onClick={() => handleConfirmChoice("edit")}
                    style={{
                      background: "rgba(200, 122, 83, 0.1)", border: "1px solid var(--accent-blue)", borderRadius: 3,
                      color: "var(--accent-blue)", fontSize: 11, padding: "6px 14px", cursor: "pointer",
                      fontWeight: 600, fontFamily: "var(--font-mono)",
                    }}
                  >
                    [E]dit Code
                  </button>
                </div>
              </div>
            )}
            {chatMode === "pipeline" && <PipelineProgress />}

            <div className="cli-log">
              {pipelineEvents.map(evt => (
                <EventMessage key={evt.id} event={evt} />
              ))}
              <div ref={logEndRef} />
            </div>

            {/* Prompt bar */}
            <form className="cli-prompt-bar" onSubmit={handleSubmit}>
              <span className="cli-prompt-prefix">$›</span>

              {/* Segmented Mode Selector */}
              <div style={{
                display: "flex",
                background: "var(--bg-highlight)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                padding: 2,
                gap: 2,
                marginRight: 4,
                flexShrink: 0
              }}>
                <button
                  type="button"
                  onClick={() => setChatMode("pipeline")}
                  disabled={isStreaming}
                  style={{
                    background: chatMode === "pipeline" ? "rgba(200, 122, 83, 0.15)" : "transparent",
                    border: "none",
                    borderRadius: 3,
                    color: chatMode === "pipeline" ? "var(--accent-blue)" : "var(--text-muted)",
                    fontSize: 10,
                    padding: "3px 6px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    transition: "all 0.15s ease",
                  }}
                >
                  PIPELINE
                </button>
                <button
                  type="button"
                  onClick={() => setChatMode("chat")}
                  disabled={isStreaming}
                  style={{
                    background: chatMode === "chat" ? "rgba(77, 140, 96, 0.15)" : "transparent",
                    border: "none",
                    borderRadius: 3,
                    color: chatMode === "chat" ? "var(--accent-green)" : "var(--text-muted)",
                    fontSize: 10,
                    padding: "3px 6px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    transition: "all 0.15s ease",
                  }}
                >
                  CHAT
                </button>
              </div>

              <input
                ref={inputRef}
                id="cli-input"
                className="cli-input"
                placeholder={
                  isStreaming
                    ? (chatMode === "chat" ? "CodeSentinel thinking…" : "Pipeline running…")
                    : (chatMode === "chat" ? "Ask CodeSentinel anything (bypass pipeline)…" : "Describe the code to generate and secure…")
                }
                value={currentPrompt}
                onChange={e => setCurrentPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                autoComplete="off"
                spellCheck={false}
              />

              {/* Language selector */}
              {chatMode === "pipeline" && (
                <select
                  id="language-select"
                  value={currentLanguage}
                  onChange={e => setCurrentLanguage(e.target.value)}
                  disabled={isStreaming}
                  style={{
                    background:   "var(--bg-highlight)",
                    border:       "1px solid var(--border-subtle)",
                    borderRadius: 3,
                    color:        "var(--text-secondary)",
                    fontSize:     11,
                    padding:      "2px 6px",
                    cursor:       "pointer",
                    outline:      "none",
                    flexShrink:   0,
                    fontFamily:   "var(--font-mono)",
                  }}
                >
                  {SUPPORTED_LANGUAGES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              )}

              <button
                type="submit"
                disabled={isStreaming || !currentPrompt.trim()}
                style={{
                  background:    currentPrompt.trim() && !isStreaming ? "rgba(77, 140, 96, 0.12)" : "none",
                  border:        "1px solid",
                  borderColor:   currentPrompt.trim() && !isStreaming ? "var(--accent-green)" : "var(--border-subtle)",
                  borderRadius:  3,
                  cursor:        "pointer",
                  padding:       "4px 8px",
                  color:         currentPrompt.trim() && !isStreaming ? "var(--accent-green)" : "var(--text-disabled)",
                  display:       "flex",
                  alignItems:    "center",
                  transition:    "all 0.15s ease",
                  flexShrink:    0,
                }}
              >
                {isStreaming
                  ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                  : <Send    size={13} />
                }
              </button>
            </form>
          </>
        )}

        {/* ── Audit Trail Tab ── */}
        {activePanelTab === "audit" && <AuditTrailPanel />}

        {/* ── Terminal Tab ── */}
        {terminalMounted && (
          <div style={{ width: "100%", height: "100%", overflow: "hidden", display: activePanelTab === "terminal" ? "block" : "none" }}>
            <TerminalTab sessionId={terminalSessionId} />
          </div>
        )}

        {/* ── Web Preview Tab ── */}
        {terminalMounted && (
          <div style={{ width: "100%", height: "100%", overflow: "hidden", display: activePanelTab === "preview" ? "block" : "none" }}>
            <WebPreviewPanel />
          </div>
        )}

        {/* ── Output Tab ── */}
        {activePanelTab === "output" && (
          <div className="cli-log">
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
              <span style={{ color: "var(--accent-teal)" }}>[INFO]</span>
              {backendOk
                ? " CodeSentinel backend connected. Pipeline output appears here."
                : " Backend not connected. Start the backend to see output."}
            </div>
            {backendOk === false && (
              <div style={{ marginTop: 8, color: "var(--text-disabled)", fontSize: 11 }}>
                <Zap size={11} style={{ display: "inline", marginRight: 4 }} />
                Run: <code style={{ color: "var(--accent-yellow)", fontFamily: "var(--font-mono)" }}>
                  cd backend && uvicorn main:app --reload
                </code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
