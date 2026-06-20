"""
test_full_nodejs.py
--------------------
Full end-to-end CodeSentinel pipeline test using a REAL medium-level Node.js task.
ALL agents run for real — no mocks. LLM + E2B sandbox + Semgrep all active.

Task: Build a Node.js Express REST API with:
  - POST /register  (hashed password storage with bcrypt)
  - POST /login     (JWT token issuance)
  - GET  /profile   (protected route, JWT middleware)
  - Input validation
  - Rate limiting

Run with:
    python test_full_nodejs.py
"""

import os
import sys
import asyncio
import time
from dotenv import load_dotenv, find_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv(find_dotenv())

# ── Colour helpers ────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BLUE   = "\033[94m"
MAGENTA= "\033[95m"

NODE_COLORS = {
    "developer_agent":   BLUE,
    "sandbox_execute":       CYAN,
    "semgrep_scan":      YELLOW,
    "triage_agent":      MAGENTA,
    "synthesizer_agent": RED,
    "sandbox_verify":        CYAN,
    "finalize":          GREEN,
}

def color(text, c): return f"{c}{text}{RESET}"
def header(text):   print(f"\n{BOLD}{CYAN}{'═'*65}{RESET}\n{BOLD}{CYAN}  {text}{RESET}\n{BOLD}{CYAN}{'═'*65}{RESET}")
def section(text):  print(f"\n{BOLD}{text}{RESET}")
def ok(text):       print(f"  {GREEN}✔{RESET}  {text}")
def warn(text):     print(f"  {YELLOW}⚠{RESET}  {text}")
def err(text):      print(f"  {RED}✘{RESET}  {text}")
def info(text):     print(f"  {BLUE}→{RESET}  {text}")

# ── Medium-level Node.js prompt ───────────────────────────────────
NODEJS_PROMPT = """
Build a self-contained Node.js script (single file, no external DB — use in-memory store)
that implements a minimal secure REST API using only the built-in 'http' module (no express):

Endpoints:
  POST /register   - accepts JSON { username, password }
                     - validate: username 3-30 chars alphanumeric, password 8+ chars
                     - store hashed password using Node's crypto.pbkdf2Sync (salt + hash)
                     - return 201 { message: "User registered" } or 400 on bad input / duplicate

  POST /login      - accepts JSON { username, password }
                     - verify credentials against stored hash
                     - return 200 { token: <jwt_like_token> } using crypto.createHmac (HS256 manual JWT)
                     - return 401 on bad credentials

  GET  /profile    - requires Authorization: Bearer <token> header
                     - decode and verify the HMAC token
                     - return 200 { username, registeredAt } or 401 on missing/invalid token

  GET  /health     - return 200 { status: "ok" }

Requirements:
  - Use ONLY Node.js built-in modules (http, crypto, url) — no npm packages
  - Implement proper HMAC-SHA256 JWT signing with a secret key
  - Use crypto.pbkdf2Sync for password hashing with random salt
  - Handle JSON parse errors gracefully
  - Set appropriate Content-Type: application/json headers
  - The server should listen on port 3000 and print "Server running on port 3000"
  - Include a self-test at the end: register a user, login, and call /profile — print results
"""

async def run_pipeline():
    from graph.graph import build_graph
    from tracing import get_run_metadata, get_run_tags

    header("CodeSentinel — Full Pipeline Test")
    info(f"Task: Medium-level Node.js REST API with JWT + Crypto")
    info(f"Language: javascript")
    info(f"Models: Developer={os.environ.get('DEVELOPER_MODEL','gemini-2.5-flash-lite')} | "
         f"Triage={os.environ.get('TRIAGE_MODEL','gemini-2.5-flash')} | "
         f"Synthesizer={os.environ.get('SYNTHESIZER_MODEL','gemini-2.5-flash')}")

    graph = build_graph()

    initial_state = {
        "user_prompt":         NODEJS_PROMPT.strip(),
        "language":            "javascript",
        "current_code":        "",
        "execution_stdout":    "",
        "execution_stderr":    "",
        "execution_success":   False,
        "dev_retries":         0,
        "raw_semgrep_findings": [],
        "triage_output":       None,
        "security_score":      0,
        "security_iterations": 0,
        "final_code":          "",
        "stage_events":        [],
        "score_history":       [],
        "audit_trail":         [],
    }

    run_config = {
        "tags":     get_run_tags("javascript"),
        "metadata": get_run_metadata(NODEJS_PROMPT, "javascript"),
    }

    # ── Tracking state ────────────────────────────────────────────
    node_order   = []
    node_timings = {}
    final_state  = dict(initial_state)
    pipeline_start = time.time()

    print()
    section("▶  Pipeline running …")

    async for event in graph.astream(initial_state, config=run_config):
        for node_name, state_update in event.items():
            t_start = time.time()
            node_order.append(node_name)
            nc = NODE_COLORS.get(node_name, RESET)

            print(f"\n{BOLD}{nc}┌─ [{node_name}]{RESET}")

            # Merge update into final_state
            for k, v in state_update.items():
                if k in ("stage_events", "score_history", "audit_trail"):
                    final_state[k] = final_state.get(k, []) + (v if isinstance(v, list) else [v])
                else:
                    final_state[k] = v

            # ── Per-node display ──────────────────────────────────
            if node_name == "developer_agent":
                code = state_update.get("current_code", "")
                retries = state_update.get("dev_retries", 1)
                info(f"Attempt #{retries} — generated {len(code)} chars of code")
                if code:
                    preview = code[:300].replace('\n', '\n     ')
                    print(f"  {BLUE}Code preview:{RESET}\n     {preview}\n     …")

            elif node_name == "sandbox_execute":
                success = state_update.get("execution_success", False)
                stdout  = state_update.get("execution_stdout", "")
                stderr  = state_update.get("execution_stderr", "")
                if success:
                    ok(f"Docker sandbox execution PASSED")
                    if stdout:
                        print(f"  {GREEN}stdout:{RESET}")
                        for line in stdout.strip().split('\n')[:10]:
                            print(f"    {line}")
                else:
                    err(f"Docker sandbox execution FAILED")
                    if stderr:
                        print(f"  {RED}stderr:{RESET}")
                        for line in stderr.strip().split('\n')[:8]:
                            print(f"    {line}")

            elif node_name == "semgrep_scan":
                findings = state_update.get("raw_semgrep_findings", [])
                if findings:
                    warn(f"Semgrep found {len(findings)} potential issue(s):")
                    for f in findings:
                        sev = f.get("severity", "?")
                        cid = f.get("check_id", "?")
                        msg = f.get("message", "")[:80]
                        print(f"    [{sev}] {cid}")
                        print(f"           {msg}")
                else:
                    ok("Semgrep: No issues found")

            elif node_name == "triage_agent":
                to = state_update.get("triage_output")
                score = state_update.get("security_score", 0)
                if to:
                    verdict_color = GREEN if to.verdict == "clean" else RED
                    print(f"  {BOLD}Verdict:{RESET} {verdict_color}{to.verdict.upper()}{RESET}  |  "
                          f"{BOLD}Score:{RESET} {score}/100")
                    print(f"  {MAGENTA}Reasoning:{RESET} {to.reasoning[:200]}")
                    if to.findings_to_fix:
                        warn(f"Findings to fix: {len(to.findings_to_fix)}")
                        for f in to.findings_to_fix:
                            print(f"    • [{f.severity}] {f.check_id} — {f.message[:70]}")

            elif node_name == "synthesizer_agent":
                code  = state_update.get("current_code", "")
                iters = state_update.get("security_iterations", 0)
                ok(f"Synthesizer patched code (iteration {iters}) — {len(code)} chars")

            elif node_name == "sandbox_verify":
                success = state_update.get("execution_success", False)
                stdout  = state_update.get("execution_stdout", "")
                stderr  = state_update.get("execution_stderr", "")
                if success:
                    ok("Verification PASSED — patched code still runs correctly")
                    if stdout:
                        for line in stdout.strip().split('\n')[:8]:
                            print(f"    {line}")
                else:
                    err("Verification FAILED — patch broke execution")
                    if stderr:
                        for line in stderr.strip().split('\n')[:5]:
                            print(f"    {line}")

            elif node_name == "finalize":
                ok("Pipeline FINALIZED — code is clean and functional")

            elapsed = time.time() - t_start
            node_timings[node_name] = node_timings.get(node_name, 0) + elapsed
            print(f"  {BLUE}⏱  {elapsed:.1f}s{RESET}")
            print(f"{nc}└{'─'*50}{RESET}")

    # ── Summary ───────────────────────────────────────────────────
    total_time = time.time() - pipeline_start
    header("Pipeline Summary")

    section("Node execution order:")
    for i, n in enumerate(node_order, 1):
        nc = NODE_COLORS.get(n, RESET)
        t  = node_timings.get(n, 0)
        print(f"  {i:2}. {nc}{n:<22}{RESET}  {t:.1f}s")

    section("Security Score History:")
    history = final_state.get("score_history", [])
    for i, s in enumerate(history):
        bar = "█" * (s // 10) + "░" * (10 - s // 10)
        color_s = GREEN if s >= 80 else (YELLOW if s >= 50 else RED)
        print(f"  Iteration {i+1}: {color_s}{bar} {s}/100{RESET}")

    final_score = final_state.get("security_score", 0)
    final_code  = final_state.get("final_code", "")
    triage_out  = final_state.get("triage_output")
    verdict     = triage_out.verdict if triage_out else "unknown"

    section("Final Result:")
    ok(f"Final security score : {GREEN if final_score>=80 else YELLOW}{final_score}/100{RESET}")
    ok(f"Triage verdict       : {GREEN if verdict=='clean' else RED}{verdict.upper()}{RESET}")
    ok(f"Final code length    : {len(final_code)} chars")
    ok(f"Total pipeline time  : {total_time:.1f}s")
    ok(f"Dev retries          : {final_state.get('dev_retries', 0)}")
    ok(f"Security iterations  : {final_state.get('security_iterations', 0)}")

    if final_code:
        section("Final Code (first 60 lines):")
        lines = final_code.split('\n')
        for i, line in enumerate(lines[:60], 1):
            print(f"  {BLUE}{i:3}{RESET}  {line}")
        if len(lines) > 60:
            print(f"  ... ({len(lines) - 60} more lines)")

    print(f"\n{BOLD}{GREEN}{'═'*65}{RESET}")
    print(f"{BOLD}{GREEN}  ✅  FULL PIPELINE TEST COMPLETE{RESET}")
    print(f"{BOLD}{GREEN}{'═'*65}{RESET}\n")


if __name__ == "__main__":
    if not os.environ.get("GOOGLE_API_KEY"):
        err("GOOGLE_API_KEY not set. Check your .env file.")
        sys.exit(1)

    if not os.environ.get("DOCKER_AVAILABLE"):
        err("DOCKER_AVAILABLE not set. Check your .env file.")
        sys.exit(1)

    asyncio.run(run_pipeline())
