"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import "@/components/auth/authModal.css";

export default function GitHubCallbackPage() {
  const router = useRouter();
  const { verifyGitHubCode } = useAuthStore();
  const [status, setStatus] = useState("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (!code) {
      setStatus("error");
      setErrorMsg("GitHub authorization code not found in URL callback.");
      return;
    }

    const verify = async () => {
      const success = await verifyGitHubCode(code);
      if (success) {
        setStatus("success");
        setTimeout(() => {
          router.push("/ide");
        }, 1000);
      } else {
        setStatus("error");
        setErrorMsg("Failed to authorize GitHub session on the backend.");
      }
    };

    verify();
  }, [router, verifyGitHubCode]);

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      background: "var(--bg-base)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: "1.5rem",
      color: "var(--text-primary)",
      fontFamily: "var(--font-ui)"
    }}>
      {status === "verifying" && (
        <div className="sso-loading-container">
          <div className="sso-spinner"></div>
          <div className="sso-popup-title" style={{ fontSize: "1.1rem", fontWeight: 500 }}>
            Connecting to GitHub...
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="sso-loading-container">
          <div className="sso-success-checkmark">✓</div>
          <div className="sso-popup-title" style={{ color: "var(--accent-green)" }}>
            Authenticated successfully! Redirecting to workspace...
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="sso-loading-container" style={{ maxWidth: 400, padding: 20 }}>
          <div style={{ fontSize: "2.5rem", color: "var(--accent-red)", marginBottom: 15 }}>⚠️</div>
          <div className="sso-popup-title" style={{ fontSize: "1.2rem", color: "var(--accent-red)", marginBottom: 10 }}>
            Connection Failed
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: 20 }}>
            {errorMsg}
          </p>
          <button
            onClick={() => router.push("/")}
            className="auth-submit-btn"
            style={{ padding: "8px 20px" }}
          >
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
