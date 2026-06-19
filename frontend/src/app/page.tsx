"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./homepage.css";

/* ── Pipeline nodes data ──────────────────────────────────── */
const PIPELINE_NODES = [
  {
    id: "developer_agent",
    label: "developer_agent",
    desc: "Writes Node.js code from prompt",
    type: "agent",
    icon: "DEV",
  },
  {
    id: "e2b_execute",
    label: "e2b_execute",
    desc: "Runs code in isolated microVM",
    type: "tool",
    icon: "E2B",
  },
  {
    id: "semgrep_scan",
    label: "semgrep_scan",
    desc: "Scans for CVEs & vulnerabilities",
    type: "tool",
    icon: "SEM",
  },
  {
    id: "triage_agent",
    label: "triage_agent",
    desc: "Scores severity 0–100, filters false positives",
    type: "agent",
    icon: "TRI",
  },
  {
    id: "synthesizer_agent",
    label: "synthesizer_agent",
    desc: "Autonomously patches all real vulns",
    type: "agent",
    icon: "SYN",
  },
  {
    id: "finalize",
    label: "finalize",
    desc: "Assembles clean code + audit trail",
    type: "logic",
    icon: "FIN",
  },
];

/* ── Full pipeline nodes for breakdown section ─────────────── */
const NODE_CARDS = [
  {
    id: "developer_agent",
    type: "LLM Agent",
    typeClass: "hp-tag-agent",
    name: "Developer Agent",
    desc: "Receives the natural language prompt and writes correct, runnable Node.js code. On execution errors it retries up to 3 times with targeted fixes.",
  },
  {
    id: "e2b_execute",
    type: "Tool",
    typeClass: "hp-tag-tool",
    name: "E2B Execute",
    desc: "Runs the generated code inside an isolated E2B microVM, capturing stdout, stderr, and exit code in real time. No risk to the host.",
  },
  {
    id: "semgrep_scan",
    type: "Tool",
    typeClass: "hp-tag-tool",
    name: "Semgrep Scan",
    desc: "Performs static analysis with Semgrep auto-config on the host, surfacing CWE and OWASP-tagged findings as structured JSON.",
  },
  {
    id: "triage_agent",
    type: "LLM Agent",
    typeClass: "hp-tag-agent",
    name: "Triage Agent",
    desc: "Filters false positives, assigns a security score 0–100, and returns a structured verdict: clean or fix. Uses .with_structured_output() — no hallucination.",
  },
  {
    id: "synthesizer_agent",
    type: "LLM Agent",
    typeClass: "hp-tag-agent",
    name: "Synthesizer Agent",
    desc: "Patches every confirmed vulnerability without breaking functionality. Feeds back into E2B verification and Semgrep re-audit — up to 3 iterations.",
  },
  {
    id: "finalize",
    type: "Logic",
    typeClass: "hp-tag-logic",
    name: "Finalize",
    desc: "Assembles the final secure code, score history per iteration, and the complete audit trail for every finding detected and patched.",
  },
];

const FEATURES = [
  {
    icon: "🛡️",
    title: "Real-time Security Scoring",
    desc: "Each scan produces a 0–100 security score that tracks across iterations, giving you a measurable improvement curve — not a binary pass/fail.",
  },
  {
    icon: "⚡",
    title: "Live SSE Pipeline Streaming",
    desc: "Every node transition emits a Server-Sent Event. Watch the pipeline think in real time — no polling, no page reloads.",
  },
  {
    icon: "🔁",
    title: "Autonomous Feedback Loops",
    desc: "Patched code is automatically re-executed and re-scanned. The system iterates until clean or the cap is reached — zero manual intervention.",
  },
  {
    icon: "🔬",
    title: "Sandboxed Execution",
    desc: "All code runs inside E2B microVMs — network-isolated, ephemeral, and safe. The host is never exposed to untrusted code.",
  },
  {
    icon: "🧠",
    title: "Structured LLM Outputs",
    desc: "Agents use Pydantic structured output — no JSON parsing, no hallucinated formats. The triage verdict is always machine-readable.",
  },
  {
    icon: "📋",
    title: "Full Audit Trail",
    desc: "Every iteration snapshot, finding, and patch is recorded. You get a complete forensic history of how the code became secure.",
  },
];

const TECH_STACK = [
  "FastAPI",
  "LangGraph",
  "Gemini 2.0 Flash",
  "Semgrep",
  "E2B Sandbox",
  "Next.js",
  "Pydantic",
  "Server-Sent Events",
  "LangChain",
  "Uvicorn",
  "TypeScript",
  "Python",
];

/* ── Animated Pipeline Visualizer ─────────────────────────── */
function PipelineVisualizer() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [doneIndices, setDoneIndices] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const runPipeline = () => {
      setActiveIndex(0);
      setDoneIndices([]);
      setScore(0);

      PIPELINE_NODES.forEach((_, i) => {
        setTimeout(
          () => {
            setActiveIndex(i);
            if (i > 0) setDoneIndices((prev) => [...prev, i - 1]);
            // Score climbs during triage/synthesize
            if (i >= 3) setScore(Math.min(100, (i - 2) * 35));
          },
          i * 1800 + 400
        );
      });

      // Finish all
      setTimeout(
        () => {
          setDoneIndices(PIPELINE_NODES.map((_, i) => i));
          setActiveIndex(-1);
          setScore(100);
        },
        PIPELINE_NODES.length * 1800 + 600
      );
    };

    runPipeline();
    intervalRef.current = setInterval(runPipeline, PIPELINE_NODES.length * 1800 + 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const getNodeState = (i: number) => {
    if (doneIndices.includes(i) && activeIndex !== i) return "done";
    if (activeIndex === i) return "active";
    return "idle";
  };

  return (
    <div className="hp-pipeline-viz">
      <div className="hp-pipeline-title">Live pipeline simulation</div>
      {PIPELINE_NODES.map((node, i) => {
        const state = getNodeState(i);
        return (
          <div key={node.id}>
            <div className={`hp-pipeline-node ${state}`}>
              <div className="hp-node-icon">{node.icon}</div>
              <div className="hp-node-info">
                <div className="hp-node-name">{node.label}</div>
                <div className="hp-node-desc">{node.desc}</div>
              </div>
              <div
                className={`hp-node-status ${
                  state === "active"
                    ? "hp-status-running"
                    : state === "done"
                      ? "hp-status-done"
                      : "hp-status-idle"
                }`}
              >
                {state === "active"
                  ? "running"
                  : state === "done"
                    ? "✓ done"
                    : "waiting"}
              </div>
            </div>
            {i < PIPELINE_NODES.length - 1 && (
              <div className={`hp-pipeline-connector ${state === "done" || state === "active" ? "active" : ""}`} />
            )}
          </div>
        );
      })}
      <div className="hp-score-bar">
        <div className="hp-score-label">
          <span>Security Score</span>
          <span className="hp-score-value">{score}/100</span>
        </div>
        <div className="hp-score-track">
          <div
            className="hp-score-fill"
            style={{ width: `${score}%`, transition: "width 1s ease" }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Scroll fade-in hook ──────────────────────────────────── */
function useFadeOnScroll() {
  useEffect(() => {
    const els = document.querySelectorAll(".hp-fade-up");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Typing cursor for hero title ────────────────────────── */
function TypingCursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "3px",
        height: "1em",
        background: "var(--green-acid)",
        marginLeft: "4px",
        verticalAlign: "text-bottom",
        animation: "pulse 1s step-start infinite",
      }}
    />
  );
}

/* ── Screenshots Gallery Component ────────────────────────── */
const SCREENSHOTS = [
  {
    id: "welcome",
    tab: "1. Welcome",
    src: "/Screenshot 2026-06-19 at 17.59.27.png",
    title: "CodeSentinel Workspace",
    sub: "Interactive coding and security assistant welcome screen",
    tag: "IDE welcome",
    tagClass: "hp-tag-ide",
  },
  {
    id: "prompt",
    tab: "2. Prompting",
    src: "/Screenshot 2026-06-19 at 21.30.59.png",
    title: "Prompt Mode and Secure Execution",
    sub: "Describe requirements in natural language and generate secure code",
    tag: "Prompt",
    tagClass: "hp-tag-code",
  },
  {
    id: "pipeline",
    tab: "3. Pipeline Loop",
    src: "/Screenshot 2026-06-19 at 21.38.49.png",
    title: "LangGraph Security Triaging",
    sub: "Evaluating code security scoring and triaging issues",
    tag: "Live Loop",
    tagClass: "hp-tag-live",
  },
  {
    id: "logs",
    tab: "4. Execution Logs",
    src: "/Screenshot 2026-06-19 at 21.39.12.png",
    title: "E2B MicroVM Execution Logs",
    sub: "Real-time pipeline logs surfacing compilation or execution errors",
    tag: "Logs",
    tagClass: "hp-tag-scan",
  },
  {
    id: "patching",
    tab: "5. Auto-Patching",
    src: "/Screenshot 2026-06-19 at 21.44.47.png",
    title: "Autonomous Patching Feedback Loop",
    sub: "Synthesizer agent rewriting vulnerable sections in the codebase",
    tag: "Patching",
    tagClass: "hp-tag-live",
  },
  {
    id: "report",
    tab: "6. Audit Report",
    src: "/Screenshot 2026-06-19 at 21.45.30.png",
    title: "Comprehensive Security Audits",
    sub: "Vulnerability triage report with precise line ranges, OWASP tags, and mitigations",
    tag: "Audit",
    tagClass: "hp-tag-scan",
  },
];

function ScreenshotsGallery() {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeItem = SCREENSHOTS[activeIndex];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? SCREENSHOTS.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === SCREENSHOTS.length - 1 ? 0 : prev + 1));
  };

  return (
    <section className="hp-gallery-section hp-section">
      <div className="hp-gallery-header hp-fade-up">
        <div className="hp-eyebrow">IDE Tour</div>
        <h2 className="hp-h2">
          See <span>CodeSentinel</span> in Action
        </h2>
        <p className="hp-lead">
          Explore the workflow of our automated developer-security assistant.
        </p>
      </div>

      <div className="hp-gallery-tabs hp-fade-up">
        {SCREENSHOTS.map((item, idx) => (
          <button
            key={item.id}
            className={`hp-gallery-tab ${idx === activeIndex ? "active" : ""}`}
            onClick={() => setActiveIndex(idx)}
          >
            {item.tab}
          </button>
        ))}
      </div>

      <div className="hp-gallery-frame hp-fade-up">
        <div className="hp-gallery-chrome">
          <div className="hp-gallery-chrome-dot" />
          <div className="hp-gallery-chrome-dot" />
          <div className="hp-gallery-chrome-dot" />
          <div className="hp-gallery-chrome-bar">
            <span className="hp-gallery-chrome-lock">🔒</span>
            <span className="hp-gallery-chrome-url">
              localhost:3000/ide?step={activeItem.id}
            </span>
          </div>
        </div>

        <div className="hp-gallery-img-wrap">
          <img
            key={activeItem.id}
            src={activeItem.src}
            alt={activeItem.title}
            className="hp-gallery-img entering"
          />

          <div className="hp-gallery-caption">
            <div>
              <div className="hp-gallery-caption-text">{activeItem.title}</div>
              <div className="hp-gallery-caption-sub">{activeItem.sub}</div>
            </div>
            <span className={`hp-gallery-caption-tag ${activeItem.tagClass}`}>
              {activeItem.tag}
            </span>
          </div>
        </div>
      </div>

      <div className="hp-gallery-nav hp-fade-up">
        <button className="hp-gallery-arrow" onClick={handlePrev} aria-label="Previous screenshot">
          ←
        </button>
        <div className="hp-gallery-dots">
          {SCREENSHOTS.map((_, idx) => (
            <button
              key={idx}
              className={`hp-gallery-dot ${idx === activeIndex ? "active" : ""}`}
              onClick={() => setActiveIndex(idx)}
              aria-label={`Go to screenshot ${idx + 1}`}
            />
          ))}
        </div>
        <button className="hp-gallery-arrow" onClick={handleNext} aria-label="Next screenshot">
          →
        </button>
      </div>
    </section>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function Home() {
  useFadeOnScroll();

  return (
    <main className="homepage">
      {/* Background layers */}
      <div className="hp-grid-bg" />
      <div className="hp-orb hp-orb-1" />
      <div className="hp-orb hp-orb-2" />

      <div className="hp-content">
        {/* ── Navbar ── */}
        <nav className="hp-nav">
          <Link href="/" className="hp-nav-logo">
            <div className="hp-nav-logo-icon">
              <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1L1 4v4c0 3.5 2.9 6.8 7 8 4.1-1.2 7-4.5 7-8V4L8 1z" />
              </svg>
            </div>
            Code<span className="hp-nav-accent">Sentinel</span>
          </Link>

          <ul className="hp-nav-links">
            <li>
              <a href="#pipeline">Pipeline</a>
            </li>
            <li>
              <a href="#features">Features</a>
            </li>
            <li>
              <a href="#about">About</a>
            </li>
            <li>
              <Link href="/ide" className="hp-nav-cta">
                Launch IDE
              </Link>
            </li>
          </ul>
        </nav>

        {/* ── Hero ── */}
        <section className="hp-hero">
          <div className="hp-hero-inner">
            {/* Left: copy */}
            <div>
              <div className="hp-hero-badge">
                <div className="hp-hero-badge-dot" />
                Multi-Agent DevSecOps Pipeline
              </div>

              <h1 className="hp-hero-title">
                Code that writes,
                <br />
                executes &amp; secures
                <br />
                <span className="hp-hero-title-accent">
                  itself.
                  <TypingCursor />
                </span>
              </h1>

              <p className="hp-hero-desc">
                Describe what you want. CodeSentinel generates Node.js code,
                runs it in a sandboxed microVM, scans for vulnerabilities with
                Semgrep, and patches them — autonomously, in real time.
              </p>

              <div className="hp-hero-actions">
                <Link href="/ide" className="hp-btn-primary">
                  <span>⚡</span> Launch IDE
                </Link>
                <a href="#pipeline" className="hp-btn-ghost">
                  See the pipeline →
                </a>
              </div>

              <div className="hp-hero-stats">
                <div>
                  <div className="hp-hero-stat-val">6</div>
                  <div className="hp-hero-stat-label">Pipeline Nodes</div>
                </div>
                <div>
                  <div className="hp-hero-stat-val">3</div>
                  <div className="hp-hero-stat-label">LLM Agents</div>
                </div>
                <div>
                  <div className="hp-hero-stat-val">0–100</div>
                  <div className="hp-hero-stat-label">Security Score</div>
                </div>
              </div>
            </div>

            {/* Right: animated pipeline */}
            <PipelineVisualizer />
          </div>
        </section>

        {/* ── Tech stack marquee ── */}
        <div className="hp-tech-section">
          <div className="hp-tech-label">Built with</div>
          <div style={{ overflow: "hidden" }}>
            <div className="hp-tech-track">
              {[...TECH_STACK, ...TECH_STACK].map((t, i) => (
                <div key={i} className="hp-tech-item">
                  <div className="hp-tech-dot" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── How It Works ── */}
        <div id="pipeline" className="hp-pipeline-section hp-section-full">
          <div className="hp-section">
            <div className="hp-pipeline-header hp-fade-up">
              <div className="hp-eyebrow">How It Works</div>
              <h2 className="hp-h2">
                A <span>6-node state machine</span>
                <br />
                that never stops until clean.
              </h2>
              <p className="hp-lead" style={{ margin: "0 auto" }}>
                LangGraph orchestrates every step. Three LLM agents collaborate
                with two tool nodes in a feedback loop — patching, re-running,
                and re-scanning until the security score satisfies the triage
                verdict.
              </p>
            </div>

            <div className="hp-nodes-grid hp-fade-up">
              {NODE_CARDS.map((card) => (
                <div key={card.id} className="hp-node-card">
                  <div className="hp-nc-tag">
                    <span className={`hp-nc-tag-type ${card.typeClass}`}>
                      {card.type}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.6rem",
                        opacity: 0.5,
                      }}
                    >
                      {card.id}
                    </span>
                  </div>
                  <div className="hp-nc-name">{card.name}</div>
                  <div className="hp-nc-desc">{card.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <section id="features" className="hp-section">
          <div className="hp-fade-up">
            <div className="hp-eyebrow">Capabilities</div>
            <h2 className="hp-h2">
              Everything a <span>secure pipeline</span> needs.
            </h2>
            <p className="hp-lead">
              Not a linter. Not a formatter. A full autonomous security
              pipeline that catches real vulnerabilities and patches them —
              without breaking your code.
            </p>
          </div>

          <div className="hp-features-grid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="hp-feature-card hp-fade-up"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="hp-feature-icon">{f.icon}</div>
                <div className="hp-feature-title">{f.title}</div>
                <div className="hp-feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Screenshots Gallery ── */}
        <ScreenshotsGallery />

        {/* ── Stats ── */}
        <div id="about" className="hp-section-full" style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-dim)", borderBottom: "1px solid var(--border-dim)" }}>
          <div className="hp-section">
            <div className="hp-stats-grid hp-fade-up">
              <div className="hp-stat-card">
                <div className="hp-stat-number">3×</div>
                <div className="hp-stat-label">Max Security Iterations</div>
              </div>
              <div className="hp-stat-card">
                <div className="hp-stat-number">3×</div>
                <div className="hp-stat-label">Dev Retry Loops</div>
              </div>
              <div className="hp-stat-card">
                <div className="hp-stat-number">SSE</div>
                <div className="hp-stat-label">Real-Time Streaming</div>
              </div>
              <div className="hp-stat-card">
                <div className="hp-stat-number">0</div>
                <div className="hp-stat-label">Manual Steps Required</div>
              </div>
            </div>

            {/* Architecture callout */}
            <div className="hp-fade-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <div
                style={{
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.75rem",
                  background: "var(--bg-glass)",
                }}
              >
                <div className="hp-eyebrow" style={{ marginBottom: "1rem" }}>
                  Backend
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                    lineHeight: "2",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--green-acid)" }}>POST</span>{" "}
                    /api/generate → StreamingResponse
                  </div>
                  <div>
                    <span style={{ color: "var(--green-acid)" }}>GET</span>{" "}
                    /health → graph_ready: bool
                  </div>
                  <div style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
                    FastAPI · Uvicorn · LangGraph
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    Gemini 2.0 Flash · Pydantic
                  </div>
                </div>
              </div>
              <div
                style={{
                  border: "1px solid var(--border-dim)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.75rem",
                  background: "var(--bg-glass)",
                }}
              >
                <div className="hp-eyebrow" style={{ marginBottom: "1rem" }}>
                  Security Stack
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                    lineHeight: "2",
                  }}
                >
                  <div>
                    Semgrep{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      — static analysis, OWASP / CWE tags
                    </span>
                  </div>
                  <div>
                    E2B{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      — isolated microVM execution
                    </span>
                  </div>
                  <div>
                    Triage Agent{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      — structured score + verdict
                    </span>
                  </div>
                  <div>
                    Synthesizer{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      — autonomous patch loop
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ── */}
        <section className="hp-cta-section hp-section hp-fade-up">
          <div className="hp-cta-terminal">
            <span className="cmd-prefix">$</span> codesentinel run --prompt
            &quot;build me a REST API&quot; --secure
          </div>
          <h2 className="hp-cta-h2">
            Your code.
            <br />
            <span style={{ color: "var(--green-acid)" }}>Zero known vulns.</span>
          </h2>
          <p className="hp-cta-lead">
            Open the IDE, describe what you need, and let the pipeline do the
            rest. No setup. No config. Just secure code.
          </p>
          <div className="hp-cta-actions">
            <Link href="/ide" className="hp-btn-primary">
              <span>⚡</span> Open CodeSentinel IDE
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hp-btn-ghost"
            >
              View on GitHub
            </a>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ borderTop: "1px solid var(--border-dim)" }}>
          <div className="hp-footer">
            <div className="hp-footer-copy">
              © 2026 CodeSentinel — Agentic Code Security Pipeline
            </div>
            <div className="hp-footer-links">
              <a href="#pipeline">Pipeline</a>
              <a href="#features">Features</a>
              <Link href="/ide">IDE</Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
