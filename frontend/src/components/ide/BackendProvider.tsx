"use client";

import { useEffect } from "react";
import { useIDEStore } from "@/store/ideStore";
import { fetchHealth } from "@/lib/api";

/**
 * Polls the backend /health endpoint every 5s.
 * Updates backendOnline + backendHealth in the store.
 */
export default function BackendProvider({ children }: { children: React.ReactNode }) {
  const { setBackendHealth, setBackendOnline } = useIDEStore();

  useEffect(() => {
    let wasOnline = false;
    const check = async () => {
      try {
        const h = await fetchHealth();
        setBackendHealth(h);
        const isOk = h.status === "ok";
        setBackendOnline(isOk);
        if (isOk && !wasOnline) {
          wasOnline = true;
          useIDEStore.getState().syncSessions();
        }
      } catch {
        setBackendHealth(null);
        setBackendOnline(false);
        wasOnline = false;
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [setBackendHealth, setBackendOnline]);

  return <>{children}</>;
}
