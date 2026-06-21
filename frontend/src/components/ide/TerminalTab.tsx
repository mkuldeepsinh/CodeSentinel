"use client";

/**
 * TerminalTab — Real interactive Docker PTY terminal.
 *
 * Connects via WebSocket to /ws/terminal/{sessionId} and renders
 * a full xterm.js terminal inside the BottomPanel Terminal tab.
 *
 * Protocol:
 *   - Keystroke data   → sent as raw text frames to WebSocket
 *   - "__RESIZE__:c,r" → sent on terminal resize
 *   - Output from PTY  ← received as text frames, written to xterm
 */

import { useEffect, useRef, useCallback } from "react";
import { API_WS_BASE } from "@/lib/config";
import { useIDEStore, FileNode } from "@/store/ideStore";

// ── Types for xterm.js (loaded dynamically to avoid SSR issues) ───────────────
interface XTerminal {
  open: (el: HTMLElement) => void;
  write: (data: string) => void;
  onData: (handler: (data: string) => void) => void;
  dispose: () => void;
  cols: number;
  rows: number;
}

interface FitAddonInstance {
  fit: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TerminalTabProps {
  sessionId: string;
}

export default function TerminalTab({ sessionId }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<XTerminal | null>(null);
  const fitRef       = useRef<FitAddonInstance | null>(null);
  const wsRef        = useRef<WebSocket | null>(null);

  const { 
    activeProjectId, projects, terminalRunRequest, setTerminalRunRequest,
    terminalInputToSend, clearTerminalInput 
  } = useIDEStore();

  const project = projects.find(p => p.id === activeProjectId);
  const lang = (project?.language || "javascript").toLowerCase();
  const image = lang === "python" || lang === "py" ? "python:3.12-alpine" : "node:20-alpine";

  // Handle run requests when terminal is already open
  useEffect(() => {
    console.log("TerminalTab: terminalRunRequest changed:", terminalRunRequest);
    if (terminalRunRequest) {
      const term = termRef.current;
      const ws = wsRef.current;
      console.log("TerminalTab: wsRef.current readyState:", ws ? ws.readyState : "null");
      if (ws && ws.readyState === WebSocket.OPEN) {
        term?.write("\r\n\x1b[35m● Sending code changes to Docker container PTY...\x1b[0m\r\n");
        try {
          const { files, command } = terminalRunRequest;
          const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ files, command }))));
          ws.send(`__LOAD_FILES__:${payload}`);
        } catch (err) {
          term?.write(`\r\n\x1b[31m[CodeSentinel] Error sending code: ${err}\x1b[0m\r\n`);
          console.error("Failed to send code to terminal:", err);
        }
        setTerminalRunRequest(null);
      } else {
        term?.write(`\r\n\x1b[33m[CodeSentinel] WebSocket not ready (state: ${ws ? ws.readyState : "null"}). Deferring run command until connected...\x1b[0m\r\n`);
      }
    }
  }, [terminalRunRequest, setTerminalRunRequest]);

  // Listen for manual inputs (like stop code Ctrl+C signal) to forward to terminal PTY
  useEffect(() => {
    if (terminalInputToSend) {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(terminalInputToSend);
      }
      clearTerminalInput();
    }
  }, [terminalInputToSend, clearTerminalInput]);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;

    let active = true;
    let term: XTerminal;
    let fitAddon: FitAddonInstance;
    let resizeObserver: ResizeObserver;

    const init = async () => {
      // Dynamic import — avoids SSR crash since xterm uses `window`
      const { Terminal }  = await import("@xterm/xterm");
      const { FitAddon }  = await import("@xterm/addon-fit");

      if (!containerRef.current || !active) return;

      term = new Terminal({
        theme: {
          background:  "#0d1117",
          foreground:  "#c9d1d9",
          cursor:      "#58a6ff",
          cursorAccent:"#0d1117",
          black:       "#484f58",
          red:         "#ff7b72",
          green:       "#3fb950",
          yellow:      "#d29922",
          blue:        "#58a6ff",
          magenta:     "#bc8cff",
          cyan:        "#39c5cf",
          white:       "#b1bac4",
        },
        fontFamily:  "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        fontSize:    13,
        lineHeight:  1.4,
        cursorBlink: true,
        cursorStyle: "bar",
        scrollback:  3000,
        allowProposedApi: true,
      }) as unknown as XTerminal;

      fitAddon = new FitAddon() as unknown as FitAddonInstance;
      // @ts-expect-error — loadAddon exists on Terminal but not in our minimal type
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitRef.current  = fitAddon;

      // ── WebSocket connection ────────────────────────────────────────────────
      const url = `${API_WS_BASE}/ws/terminal/${sessionId}?image=${encodeURIComponent(image)}&projectId=${encodeURIComponent(activeProjectId || "")}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      if (!active) {
        ws.close();
        wsRef.current = null;
        term.dispose();
        termRef.current = null;
        return;
      }

      ws.onopen = () => {
        if (!active) return;
        // Send initial resize
        ws.send(`__RESIZE__:${term.cols},${term.rows}`);

        // Check for pending run request on initial connect
        const pending = useIDEStore.getState().terminalRunRequest;
        if (pending) {
          try {
            const { files, command } = pending;
            const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ files, command }))));
            ws.send(`__LOAD_FILES__:${payload}`);
          } catch (err) {
            console.error("Failed to send code to terminal on connect:", err);
          }
          useIDEStore.getState().setTerminalRunRequest(null);
        } else if (activeProjectId) {
          // Load all files of the active project into the container workspace on startup
          try {
            const filesMap: Record<string, string> = {};
            const extractFiles = (node: FileNode) => {
              if (!node) return;
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
            const treeNode = useIDEStore.getState().fileTree.find(n => n.id === activeProjectId);
            if (treeNode) {
              extractFiles(treeNode);
            }
            if (Object.keys(filesMap).length > 0) {
              const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ files: filesMap }))));
              ws.send(`__LOAD_FILES__:${payload}`);
            }
          } catch (err) {
            console.error("Failed to load initial files to terminal on connect:", err);
          }
        }
      };

      ws.onmessage = (evt) => {
        if (!active) return;
        let data = typeof evt.data === "string" ? evt.data : "";
        if (data.includes("__RUN_COMPLETE__")) {
          data = data.replace(/__RUN_COMPLETE__/g, "");
          useIDEStore.getState().setIsRunningCode(false);
        }
        term.write(data);
      };

      ws.onerror = () => {
        if (!active) return;
        useIDEStore.getState().setIsRunningCode(false);
        term.write(
          "\r\n\x1b[31m[CodeSentinel] WebSocket error — is the backend running?\x1b[0m\r\n"
        );
      };

      ws.onclose = () => {
        useIDEStore.getState().setIsRunningCode(false);
        if (active) {
          term.write("\r\n\x1b[33m[CodeSentinel] Terminal session closed.\x1b[0m\r\n");
        }
      };

      // Forward keystrokes to container
      term.onData((data: string) => {
        if (active && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Resize observer — tell both xterm and the PTY when panel resizes
      resizeObserver = new ResizeObserver(() => {
        if (!active) return;
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`__RESIZE__:${term.cols},${term.rows}`);
        }
      });
      resizeObserver.observe(containerRef.current!);
    };

    init().catch(console.error);

    return () => {
      active = false;
      resizeObserver?.disconnect();
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, activeProjectId, image]);

  return (
    <div
      ref={containerRef}
      id="docker-terminal"
      style={{
        width:      "100%",
        height:     "100%",
        background: "#0d1117",
        padding:    "4px 0",
        boxSizing:  "border-box",
        overflow:   "hidden",
      }}
    />
  );
}
