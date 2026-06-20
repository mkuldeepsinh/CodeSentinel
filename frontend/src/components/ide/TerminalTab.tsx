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
  const cleanedUp    = useRef(false);

  const cleanup = useCallback(() => {
    if (cleanedUp.current) return;
    cleanedUp.current = true;
    wsRef.current?.close();
    termRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined") return;
    cleanedUp.current = false;

    let term: XTerminal;
    let fitAddon: FitAddonInstance;
    let resizeObserver: ResizeObserver;

    const init = async () => {
      // Dynamic import — avoids SSR crash since xterm uses `window`
      const { Terminal }  = await import("@xterm/xterm");
      const { FitAddon }  = await import("@xterm/addon-fit");

      if (!containerRef.current || cleanedUp.current) return;

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
      const url = `${API_WS_BASE}/ws/terminal/${sessionId}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send initial resize
        ws.send(`__RESIZE__:${term.cols},${term.rows}`);
      };

      ws.onmessage = (evt) => {
        term.write(typeof evt.data === "string" ? evt.data : "");
      };

      ws.onerror = () => {
        term.write(
          "\r\n\x1b[31m[CodeSentinel] WebSocket error — is the backend running?\x1b[0m\r\n"
        );
      };

      ws.onclose = () => {
        if (!cleanedUp.current) {
          term.write("\r\n\x1b[33m[CodeSentinel] Terminal session closed.\x1b[0m\r\n");
        }
      };

      // Forward keystrokes to container
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Resize observer — tell both xterm and the PTY when panel resizes
      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`__RESIZE__:${term.cols},${term.rows}`);
        }
      });
      resizeObserver.observe(containerRef.current!);
    };

    init().catch(console.error);

    return () => {
      resizeObserver?.disconnect();
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
