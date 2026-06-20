/**
 * Global runtime config — reads from Next.js public env vars.
 * NEXT_PUBLIC_API_URL must be set in .env.local (or injected at build time).
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * WebSocket base URL for the Docker PTY terminal endpoint.
 * Derived automatically from API_BASE (http→ws, https→wss).
 */
export const API_WS_BASE =
  process.env.NEXT_PUBLIC_API_WS_URL ??
  API_BASE.replace(/^http(s?):\/\//, (_, s) => `ws${s}://`);
