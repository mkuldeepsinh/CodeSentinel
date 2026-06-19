"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import "@/components/auth/authModal.css";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const { verifyGoogleToken } = useAuthStore();
  const [status, setStatus] = useState("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1)); // strip '#'
    const idToken = params.get("id_token");

    if (!idToken) {
      setStatus("error");
      setErrorMsg("Google authentication token not found in URL callback.");
      return;
    }

    const verify = async () => {
      const success = await verifyGoogleToken(idToken);
      if (success) {
        setStatus("success");
        setTimeout(() => {
          router.push("/ide");
        }, 1000);
      } else {
        setStatus("error");
        setErrorMsg("Failed to verify Google session with backend.");
      }
    };

    verify();
  }, [router, verifyGoogleToken]);

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
            Verifying Google token...
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
            Authentication Failed
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
