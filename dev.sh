#!/usr/bin/env bash
# dev.sh — start CodeSentinel backend + frontend together
# Usage: ./dev.sh
# Stop: Ctrl+C (kills both processes)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

cleanup() {
  echo -e "\n${YELLOW}Stopping all processes...${RESET}"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup SIGINT SIGTERM EXIT

echo -e "${CYAN}[backend]${RESET} Starting FastAPI on http://localhost:8000"
cd "$BACKEND"
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | sed "s/^/$(printf "${CYAN}[backend]${RESET}") /" &
BACKEND_PID=$!

echo -e "${GREEN}[frontend]${RESET} Starting Next.js on http://localhost:3000"
cd "$FRONTEND"
npm run dev 2>&1 | sed "s/^/$(printf "${GREEN}[frontend]${RESET}") /" &
FRONTEND_PID=$!

echo -e "${YELLOW}Both running. Ctrl+C to stop.${RESET}"
wait "$BACKEND_PID" "$FRONTEND_PID"
