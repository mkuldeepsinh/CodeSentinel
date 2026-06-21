"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Caught global root layout exception:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div style={{
          width: "100vw",
          height: "100vh",
          background: "#0a0a0a",
          color: "#ff7b72",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1.5rem",
          fontFamily: "monospace",
          padding: "2rem",
          boxSizing: "border-box"
        }}>
          <div style={{ fontSize: "3rem" }}>⚠️</div>
          <h2 style={{ color: "#f0f6fc", margin: 0, fontSize: "1.5rem" }}>
            Critical Application Error
          </h2>
          <p style={{ color: "#8b949e", margin: 0, textAlign: "center", maxWidth: 600, fontSize: "0.95rem" }}>
            A critical exception occurred in the root layout.
          </p>
          
          <pre style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: "6px",
            padding: "1.2rem",
            width: "100%",
            maxWidth: "800px",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            fontSize: "0.85rem",
            color: "#c9d1d9",
            maxHeight: "400px"
          }}>
            <strong>{error.name}: {error.message}</strong>
            {"\n\n"}
            {error.stack}
          </pre>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={() => reset()}
              style={{
                background: "#21262d",
                border: "1px solid #30363d",
                color: "#c9d1d9",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "0.95rem"
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
