"use client";

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import "./authModal.css";

interface AuthModalProps {
  onSuccess?: () => void;
}

type AuthView = "login" | "signup" | "google_sso" | "github_sso" | "loading" | "success";

export default function AuthModal({ onSuccess }: AuthModalProps) {
  const {
    isAuthModalOpen,
    setAuthModalOpen,
    login,
    signup,
    ssoLogin,
    isLoading,
    error,
    setError,
  } = useAuthStore();

  const [activeView, setActiveView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ssoEmail, setSsoEmail] = useState("");
  const [customSsoEmail, setCustomSsoEmail] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Clear inputs and errors on open/close/switch
  useEffect(() => {
    setEmail("");
    setPassword("");
    setSsoEmail("");
    setCustomSsoEmail(false);
    setError(null);
  }, [activeView, isAuthModalOpen, setError]);

  if (!isAuthModalOpen) return null;

  const handleClose = () => {
    setAuthModalOpen(false);
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    let success = false;
    if (activeView === "login") {
      success = await login(email, password);
    } else {
      success = await signup(email, password);
    }

    if (success) {
      triggerSuccessFlow("Authenticated successfully!");
    }
  };

  const triggerSuccessFlow = (msg: string) => {
    setActiveView("loading");
    setStatusMessage(msg);
    setTimeout(() => {
      setActiveView("success");
      setTimeout(() => {
        setAuthModalOpen(false);
        if (onSuccess) onSuccess();
      }, 1000);
    }, 1500);
  };

  const handleGoogleAccountSelect = async (selectedEmail: string) => {
    setActiveView("loading");
    setStatusMessage("Signing in with Google...");
    const success = await ssoLogin(selectedEmail, "google");
    if (success) {
      triggerSuccessFlow("Google account linked!");
    } else {
      setActiveView("google_sso");
    }
  };

  const handleGitHubAuth = async (selectedEmail: string) => {
    if (!selectedEmail || !selectedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setActiveView("loading");
    setStatusMessage("Authorizing GitHub Connection...");
    const success = await ssoLogin(selectedEmail, "github");
    if (success) {
      triggerSuccessFlow("GitHub authorized successfully!");
    } else {
      setActiveView("github_sso");
    }
  };

  return (
    <div className="auth-overlay" onClick={handleClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close-btn" onClick={handleClose} aria-label="Close modal">
          ✕
        </button>

        {/* ── HEADER ── */}
        {activeView !== "loading" && activeView !== "success" && (
          <div className="auth-header">
            <div className="auth-logo-text">CodeSentinel</div>
            <div className="auth-subtitle">
              {activeView === "login" && "Sign in to access your projects"}
              {activeView === "signup" && "Create a secure account"}
              {activeView === "google_sso" && "Google Single Sign-On"}
              {activeView === "github_sso" && "GitHub Authorization"}
            </div>
          </div>
        )}

        {/* ── TAB CONTROLLER ── */}
        {(activeView === "login" || activeView === "signup") && (
          <div className="auth-tabs">
            <button
              className={`auth-tab-btn ${activeView === "login" ? "active" : ""}`}
              onClick={() => setActiveView("login")}
            >
              Log In
            </button>
            <button
              className={`auth-tab-btn ${activeView === "signup" ? "active" : ""}`}
              onClick={() => setActiveView("signup")}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* ── ERROR MESSAGE ── */}
        {error && activeView !== "loading" && activeView !== "success" && (
          <div className="auth-error-msg">{error}</div>
        )}

        {/* ── LOGIN / SIGNUP CONTENT ── */}
        {(activeView === "login" || activeView === "signup") && (
          <form className="auth-form" onSubmit={handleCredentialSubmit}>
            <div className="auth-form-group">
              <label className="auth-form-label">Email Address</label>
              <div className="auth-input-wrapper">
                <input
                  type="email"
                  className="auth-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="auth-form-group">
              <label className="auth-form-label">Password</label>
              <div className="auth-input-wrapper">
                <input
                  type="password"
                  className="auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="sso-spinner" style={{ width: 16, height: 16, margin: 0 }}></span>
                  Please wait...
                </>
              ) : activeView === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>

            <div className="auth-divider">or continue with</div>

            <div className="auth-sso-container">
              {/* Google Button */}
              <button
                type="button"
                className="auth-sso-btn"
                onClick={() => setActiveView("google_sso")}
                disabled={isLoading}
              >
                <svg className="auth-sso-icon" viewBox="0 0 24 24" width="24" height="24">
                  <path
                    fill="#EA4335"
                    d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.23 2.673 1.24 6.618l4.026 3.147z"
                  />
                  <path
                    fill="#4285F4"
                    d="M16.04 15.34c-1.07.69-2.48 1.12-4.04 1.12-3.75 0-6.91-2.54-8.04-5.97L3.93 13.64A11.96 11.96 0 0 0 12 24c3.24 0 5.97-1.08 7.96-2.91l-3.92-5.75z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.96 13.64A11.94 11.94 0 0 1 3.5 12c0-.57.08-1.12.23-1.65L.23 7.2A11.97 11.97 0 0 0 0 12c0 1.7.35 3.33.98 4.8l2.98-3.16z"
                  />
                  <path
                    fill="#34A853"
                    d="M23.5 12c0-.85-.08-1.68-.23-2.48H12v4.8h6.48c-.28 1.48-1.12 2.73-2.38 3.58l3.92 5.75c2.29-2.11 3.48-5.22 3.48-9.15z"
                  />
                </svg>
                Google
              </button>

              {/* GitHub Button */}
              <button
                type="button"
                className="auth-sso-btn"
                onClick={() => setActiveView("github_sso")}
                disabled={isLoading}
              >
                <svg className="auth-sso-icon" fill="currentColor" viewBox="0 0 24 24" width="24" height="24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                  />
                </svg>
                GitHub
              </button>
            </div>
          </form>
        )}

        {/* ── GOOGLE SSO MOCK POPUP ── */}
        {activeView === "google_sso" && (
          <div className="sso-popup-container">
            <svg className="sso-provider-logo" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.23 2.673 1.24 6.618l4.026 3.147z"
              />
              <path
                fill="#4285F4"
                d="M16.04 15.34c-1.07.69-2.48 1.12-4.04 1.12-3.75 0-6.91-2.54-8.04-5.97L3.93 13.64A11.96 11.96 0 0 0 12 24c3.24 0 5.97-1.08 7.96-2.91l-3.92-5.75z"
              />
              <path
                fill="#FBBC05"
                d="M3.96 13.64A11.94 11.94 0 0 1 3.5 12c0-.57.08-1.12.23-1.65L.23 7.2A11.97 11.97 0 0 0 0 12c0 1.7.35 3.33.98 4.8l2.98-3.16z"
              />
              <path
                fill="#34A853"
                d="M23.5 12c0-.85-.08-1.68-.23-2.48H12v4.8h6.48c-.28 1.48-1.12 2.73-2.38 3.58l3.92 5.75c2.29-2.11 3.48-5.22 3.48-9.15z"
              />
            </svg>
            <div className="sso-popup-title">Choose an account</div>
            <div className="sso-popup-subtitle">to continue to CodeSentinel</div>

            {!customSsoEmail ? (
              <div className="sso-account-list">
                <div
                  className="sso-account-item"
                  onClick={() => handleGoogleAccountSelect("kuldeep@codesentinel.dev")}
                >
                  <div className="sso-account-avatar">K</div>
                  <div className="sso-account-info">
                    <span className="sso-account-name">Kuldeepsinh</span>
                    <span className="sso-account-email">kuldeep@codesentinel.dev</span>
                  </div>
                </div>

                <div
                  className="sso-account-item"
                  onClick={() => handleGoogleAccountSelect("tester@sandbox.io")}
                >
                  <div className="sso-account-avatar">T</div>
                  <div className="sso-account-info">
                    <span className="sso-account-name">DevSecOps Sandbox Tester</span>
                    <span className="sso-account-email">tester@sandbox.io</span>
                  </div>
                </div>

                <div className="sso-account-item" onClick={() => setCustomSsoEmail(true)}>
                  <div className="sso-account-avatar" style={{ fontSize: "1.2rem" }}>+</div>
                  <div className="sso-account-info" style={{ justifyContent: "center" }}>
                    <span className="sso-account-name">Use another email</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="sso-custom-input-box">
                <input
                  type="email"
                  className="auth-input"
                  placeholder="Enter your Google email"
                  value={ssoEmail}
                  onChange={(e) => setSsoEmail(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="auth-submit-btn"
                  onClick={() => handleGoogleAccountSelect(ssoEmail)}
                  style={{ width: "100%", marginTop: "0.5rem" }}
                >
                  Sign In
                </button>
                <button className="sso-back-btn" onClick={() => setCustomSsoEmail(false)}>
                  Back to accounts
                </button>
              </div>
            )}

            <button className="sso-back-btn" onClick={() => setActiveView("login")}>
              Cancel Sign In
            </button>
          </div>
        )}

        {/* ── GITHUB SSO MOCK POPUP ── */}
        {activeView === "github_sso" && (
          <div className="sso-popup-container">
            <svg className="sso-provider-logo" fill="currentColor" viewBox="0 0 24 24" style={{ color: "#f1ede9" }}>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"
              />
            </svg>
            <div className="sso-popup-title">Authorize CodeSentinel</div>
            <div className="sso-popup-subtitle">to connect using your GitHub account</div>

            <div className="sso-github-auth-card">
              <div className="sso-github-logos">
                <span className="sso-account-avatar" style={{ width: 44, height: 44 }}>CS</span>
                <span className="sso-github-arrow">➜</span>
                <div className="sso-github-logo-wrap">
                  <svg fill="currentColor" viewBox="0 0 24 24" width="24" height="24" style={{ color: "#fff" }}>
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                  </svg>
                </div>
              </div>
              <div className="sso-github-text">
                CodeSentinel will receive read access to your email address.
              </div>

              <input
                type="email"
                className="auth-input"
                placeholder="Enter GitHub email (e.g. kuldeep@github.com)"
                value={ssoEmail}
                onChange={(e) => setSsoEmail(e.target.value)}
                style={{ width: "100%" }}
                autoFocus
              />

              <button
                type="button"
                className="sso-github-btn"
                onClick={() => handleGitHubAuth(ssoEmail)}
              >
                Authorize & Continue
              </button>
            </div>

            <button className="sso-back-btn" onClick={() => setActiveView("login")}>
              Cancel Authorization
            </button>
          </div>
        )}

        {/* ── LOADING SCREEN ── */}
        {activeView === "loading" && (
          <div className="sso-loading-container">
            <div className="sso-spinner"></div>
            <div className="sso-popup-title" style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {statusMessage || "Please wait..."}
            </div>
          </div>
        )}

        {/* ── SUCCESS CHECKMARK ── */}
        {activeView === "success" && (
          <div className="sso-loading-container">
            <div className="sso-success-checkmark">✓</div>
            <div className="sso-popup-title" style={{ color: "var(--accent-green)" }}>
              {statusMessage || "Success!"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
