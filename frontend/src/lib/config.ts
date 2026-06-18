/**
 * Global runtime config — reads from Next.js public env vars.
 * NEXT_PUBLIC_API_URL must be set in .env.local (or injected at build time).
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
