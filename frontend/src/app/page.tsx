"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
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
    id: "sandbox_execute",
    label: "sandbox_execute",
    desc: "Runs code in isolated Docker container",
    type: "tool",
    icon: "BOX",
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
    id: "sandbox_execute",
    type: "Tool",
    typeClass: "hp-tag-tool",
    name: "Sandbox Execute",
    desc: "Runs the generated code inside an isolated Docker container, capturing stdout, stderr, and exit code in real time. npm packages are auto-installed. No risk to the host.",
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
    const els = document.querySelectorAll(".hp-fade-up, .hp-fade-left, .hp-fade-right");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

/* ── Loop typing effect for entire hero title ───────────────── */
function TitleTypistEffect() {
  const fullText = "Code that writes,\nexecutes & secures\nitself.";
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [speed, setSpeed] = useState(60);

  useEffect(() => {
    const handleTyping = () => {
      if (!isDeleting) {
        const nextText = fullText.slice(0, displayedText.length + 1);
        setDisplayedText(nextText);
        setSpeed(60);

        if (nextText === fullText) {
          setSpeed(3000); // 3 seconds pause at full text
          setIsDeleting(true);
        }
      } else {
        const nextText = fullText.slice(0, displayedText.length - 1);
        setDisplayedText(nextText);
        setSpeed(25); // fast backspacing

        if (nextText === "") {
          setSpeed(600); // 0.6 seconds pause before retyping
          setIsDeleting(false);
        }
      }
    };

    const timeout = setTimeout(handleTyping, speed);
    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, speed]);

  return (
    <>
      {displayedText.split("\n").map((line, i, arr) => {
        if (i === 2) {
          return (
            <span key={i} className="hp-hero-title-accent">
              {line}
            </span>
          );
        }
        return (
          <span key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
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

/* ── Screenshots Showcase Component ───────────────────────── */
const SCREENSHOTS_TOUR = [
  {
    id: "chat",
    tag: "AI Assistant",
    tagClass: "hp-tag-ide",
    src: "/ide-tour-1.png",
    title: "Interactive <span>Coding Companion</span>",
    desc: "Leverage a built-in AI assistant to chat and start development tasks. Directly prompt to create files, debug code, or trigger the automated multi-agent pipeline.",
    highlights: [
      { label: "Prompt to Code", sub: "Instantly translate natural language into projects" },
      { label: "Dual Chat Modes", sub: "Seamlessly toggle between general chat and pipeline execution" },
      { label: "Error Capture", sub: "Catches compilation or syntax exceptions instantly" }
    ]
  },
  {
    id: "editor",
    tag: "Code Editor",
    tagClass: "hp-tag-code",
    src: "/ide-tour-2.png",
    title: "Modern <span>DevSecOps Workspace</span>",
    desc: "Review, format, and execute generated source files from a unified editor. Control development cycles using actions like Run Code, Prettier Formatting, and Scan & Secure.",
    highlights: [
      { label: "Advanced Code Actions", sub: "Integrated Prettier formatting and runtime controls" },
      { label: "Pipeline Progress Tracker", sub: "Visual feedback of all agent states (Triage, Synthesizer, etc.)" },
      { label: "Vulnerability Scorecard", sub: "Live security score reflecting codebase health" }
    ]
  },
  {
    id: "pipeline",
    tag: "Live Loop",
    tagClass: "hp-tag-live",
    src: "/ide-tour-3.png",
    title: "Real-Time <span>Agent Trace Logs</span>",
    desc: "Audit full execution logs streamed directly from sandbox runtimes. Follow compile, test, and security analysis steps as they happen line-by-line.",
    highlights: [
      { label: "Multi-Agent Trace", sub: "Server-Sent Events streaming from background compiler agents" },
      { label: "Semgrep SAST Integration", sub: "Scan logs indicating CWE issues and security verdicts" },
      { label: "Triage & Score Output", sub: "Live score verification and actionable fix summaries" }
    ]
  },
  {
    id: "terminal",
    tag: "Docker Terminal",
    tagClass: "hp-tag-scan",
    src: "/ide-tour-4.png",
    title: "Isolated <span>Docker PTY Terminal</span>",
    desc: "Access the runtime container directly from an interactive command terminal. Auto-loads code changes and manages secure port forwarding for local testing.",
    highlights: [
      { label: "Ephemeral Container Shell", sub: "Fully isolated, secure Docker workspace for code execution" },
      { label: "Port Forwarding Active", sub: "Forwards ports dynamically (e.g. port 3000 to host 3002)" },
      { label: "Live Code Synchronization", sub: "Auto-synchronizes editor file changes into the container PTY" }
    ]
  }
];

function ScreenshotsShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const containerHeight = rect.height;
      const scrolledOffset = -rect.top;
      const viewportHeight = window.innerHeight;
      const scrollableRange = containerHeight - viewportHeight;

      if (scrolledOffset < 0) {
        setActiveStep(0);
        return;
      }
      if (scrolledOffset > scrollableRange) {
        setActiveStep(SCREENSHOTS_TOUR.length - 1);
        return;
      }

      const pct = scrolledOffset / scrollableRange;
      const step = Math.min(SCREENSHOTS_TOUR.length - 1, Math.max(0, Math.round(pct * (SCREENSHOTS_TOUR.length - 1))));
      setActiveStep(step);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    
    // Trigger initially
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const scrollToStep = (idx: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const containerTop = rect.top + scrollTop;
    const containerHeight = rect.height;
    const viewportHeight = window.innerHeight;
    const scrollableRange = containerHeight - viewportHeight;
    const targetScroll = containerTop + (idx / (SCREENSHOTS_TOUR.length - 1)) * scrollableRange + 10;

    window.scrollTo({
      top: targetScroll,
      behavior: "smooth",
    });
  };

  return (
    <section ref={containerRef} className="hp-sticky-showcase-container">
      <div className="hp-sticky-showcase-sticky">
        <div className="hp-sticky-showcase-inner hp-section">
          {/* Left Side: Navigation Indicators & Text Description Stack */}
          <div className="hp-sticky-left-col">
            <div className="hp-showcase-nav-track">
              {SCREENSHOTS_TOUR.map((item, idx) => (
                <button
                  key={item.id}
                  className={`hp-showcase-nav-btn ${idx === activeStep ? "active" : ""}`}
                  onClick={() => scrollToStep(idx)}
                  aria-label={`Go to step ${idx + 1}`}
                >
                  <span className="hp-showcase-nav-num">0{idx + 1}</span>
                  <span className="hp-showcase-nav-line" />
                </button>
              ))}
            </div>

            <div className="hp-sticky-desc-stack">
              {SCREENSHOTS_TOUR.map((item, idx) => (
                <div
                  key={item.id}
                  className={`hp-sticky-desc-item ${idx === activeStep ? "active" : ""}`}
                >
                  <span className={`hp-showcase-tag ${item.tagClass}`}>
                    {item.tag}
                  </span>
                  <h3
                    className="hp-showcase-row-title"
                    dangerouslySetInnerHTML={{ __html: item.title }}
                  />
                  <p className="hp-showcase-row-desc">{item.desc}</p>
                  
                  <div className="hp-showcase-highlights">
                    {item.highlights.map((hl, hlIdx) => (
                      <div key={hlIdx} className="hp-showcase-hl-item">
                        <span className="hp-showcase-hl-icon">✓</span>
                        <div className="hp-showcase-hl-text">
                          <strong>{hl.label}</strong>
                          <span>{hl.sub}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side: Pinned Images Stack */}
          <div className="hp-sticky-img-stack">
            {SCREENSHOTS_TOUR.map((item, idx) => (
              <div
                key={item.id}
                className={`hp-sticky-img-frame ${idx === activeStep ? "active" : ""}`}
              >
                <div className="hp-showcase-frame">
                  <div className="hp-showcase-chrome">
                    <div className="hp-showcase-chrome-dot" />
                    <div className="hp-showcase-chrome-dot" />
                    <div className="hp-showcase-chrome-dot" />
                    <div className="hp-showcase-chrome-bar">
                      <span className="hp-showcase-chrome-lock">🔒</span>
                      <span className="hp-showcase-chrome-url">
                        localhost:3000/ide?step={item.id}
                      </span>
                    </div>
                  </div>
                  <div className="hp-showcase-img-wrap">
                    <img
                      src={item.src}
                      alt={item.tag}
                      className="hp-showcase-img"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function Home() {
  useFadeOnScroll();
  const { user, setAuthModalOpen } = useAuthStore();
  const router = useRouter();

  const handleLaunchIDE = (e: React.MouseEvent) => {
    e.preventDefault();
    if (user) {
      router.push("/ide");
    } else {
      setAuthModalOpen(true);
    }
  };

  useEffect(() => {
    // Enable page scrolling dynamically on mount
    document.documentElement.classList.add("homepage-active");
    document.body.classList.add("homepage-active");

    return () => {
      // Disable scrolling again on unmount (e.g. when navigating to /ide)
      document.documentElement.classList.remove("homepage-active");
      document.body.classList.remove("homepage-active");
    };
  }, []);

  return (
    <main className="homepage">
      {/* Background layers */}
      <div className="hp-grid-bg" />
      <div className="hp-orb hp-orb-1" />
      <div className="hp-orb hp-orb-2" />

      <div className="hp-content">
        {/* ── Navbar ── */}
        <nav className="hp-nav">
          <Link href="/" className="hp-nav-logo-text">
            CodeSentinel
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
              <a href="/ide" onClick={handleLaunchIDE} className="hp-nav-cta">
                Launch IDE
              </a>
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
                <TitleTypistEffect />
                <TypingCursor />
              </h1>

              <p className="hp-hero-desc">
                Describe what you want. CodeSentinel generates Node.js code,
                runs it in a sandboxed microVM, scans for vulnerabilities with
                Semgrep, and patches them — autonomously, in real time.
              </p>

              <div className="hp-hero-actions">
                <a href="/ide" onClick={handleLaunchIDE} className="hp-btn-primary">
                  <span>⚡</span> Launch IDE
                </a>
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

        {/* ── Screenshots Gallery ── */}
        <ScreenshotsShowcase />

        {/* ── Demo Video Showcase ── */}
        <section className="hp-section hp-video-section">
          <div className="hp-fade-up">
            <div className="hp-eyebrow">Interactive Demo</div>
            <h2 className="hp-h2">
              See CodeSentinel <span>in Action</span>
            </h2>
            <p className="hp-lead" style={{ maxWidth: "700px", margin: "0 auto" }}>
              Watch how our multi-agent DevSecOps pipeline coordinates developer, execution, and security scanner agents to write, test, and patch code autonomously.
            </p>
          </div>
          <div className="hp-video-wrapper hp-fade-up">
            <iframe
              src="https://drive.google.com/file/d/1Gbbkl-GmEjGqYXzjmH2GwPw13Hx7kAag/preview"
              className="hp-video-iframe"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        </section>

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
            <a href="/ide" onClick={handleLaunchIDE} className="hp-btn-primary">
              <span>⚡</span> Open CodeSentinel IDE
            </a>
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
              <a href="/ide" onClick={handleLaunchIDE}>IDE</a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
