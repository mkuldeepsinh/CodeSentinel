"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Caught client-side exception:", error);
  }, [error]);

  return (
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
      fontFamily: "var(--font-jetbrains, monospace)",
      padding: "2rem",
      boxSizing: "border-box"
    }}>
      <div style={{ fontSize: "3rem" }}>⚠️</div>
      <h2 style={{ color: "#f0f6fc", margin: 0, fontSize: "1.5rem" }}>
        Application Error
      </h2>
      <p style={{ color: "#8b949e", margin: 0, textAlign: "center", maxWidth: 600, fontSize: "0.95rem" }}>
        An unhandled exception occurred in the client-side rendering.
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
            fontSize: "0.9rem"
          }}
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.href = "/"}
          style={{
            background: "#238636",
            border: "1px solid #2ea44f",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "0.9rem"
          }}
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}
