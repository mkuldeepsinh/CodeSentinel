import { create } from "zustand";
import { API_BASE } from "@/lib/config";

export interface User {
  id: string;
  email: string;
  provider: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isAuthModalOpen: boolean;
  
  signup: (email: string, password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  ssoLogin: (email: string, provider: "google" | "github") => Promise<boolean>;
  logout: () => void;
  checkSession: () => void;
  setError: (err: string | null) => void;
  setAuthModalOpen: (open: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,
  isAuthModalOpen: false,

  setError: (err) => set({ error: err }),
  setAuthModalOpen: (open) => set({ isAuthModalOpen: open, error: null }),

  checkSession: () => {
    if (typeof window === "undefined") return;
    const storedToken = localStorage.getItem("codesentinel_token");
    const storedUser = localStorage.getItem("codesentinel_user");
    if (storedToken && storedUser) {
      try {
        set({
          token: storedToken,
          user: JSON.parse(storedUser) as User,
        });
      } catch {
        localStorage.removeItem("codesentinel_token");
        localStorage.removeItem("codesentinel_user");
      }
    }
  },

  signup: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        set({ error: data.detail || "Sign up failed.", isLoading: false });
        return false;
      }
      localStorage.setItem("codesentinel_token", data.token);
      localStorage.setItem("codesentinel_user", JSON.stringify(data.user));
      set({ token: data.token, user: data.user, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message || "Network error. Please try again.", isLoading: false });
      return false;
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        set({ error: data.detail || "Login failed.", isLoading: false });
        return false;
      }
      localStorage.setItem("codesentinel_token", data.token);
      localStorage.setItem("codesentinel_user", JSON.stringify(data.user));
      set({ token: data.token, user: data.user, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message || "Network error. Please try again.", isLoading: false });
      return false;
    }
  },

  ssoLogin: async (email, provider) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(`${API_BASE}/api/auth/sso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, provider }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        set({ error: data.detail || "SSO Login failed.", isLoading: false });
        return false;
      }
      localStorage.setItem("codesentinel_token", data.token);
      localStorage.setItem("codesentinel_user", JSON.stringify(data.user));
      set({ token: data.token, user: data.user, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message || "Network error. Please try again.", isLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("codesentinel_token");
    localStorage.removeItem("codesentinel_user");
    set({ token: null, user: null, error: null });
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  },
}));
