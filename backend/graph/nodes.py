import os
import json
import warnings

# Suppress known third-party library warnings that are outside our control:
# - FutureWarning from google-api-core / google-auth about Python 3.9 EOL
# - NotOpenSSLWarning from urllib3 v2 (LibreSSL vs OpenSSL)
warnings.filterwarnings("ignore", category=FutureWarning, module=r"google\..*")
warnings.filterwarnings("ignore", message=r".*NotOpenSSLWarning.*", category=Warning)
warnings.filterwarnings("ignore", message=r".*urllib3 v2 only supports OpenSSL.*")

from graph.state import PipelineState, TriageOutput
from tools.code_utils import execute_in_sandbox
from tools.semgrep_tool import run_semgrep, normalize_finding
import uuid
from database import create_project, get_best_generation, get_latest_generation, create_generation
from embeddings import get_embedding

def get_llm(model_env_var: str, default_model: str):
    """
    Resolves model name from environment variable and returns configured LangChain LLM instance.
    """
    model_name = os.environ.get(model_env_var, default_model)
    
    if model_name.startswith("gemini-"):
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model_name, temperature=0)
    else:
        # Fallback to OpenAI-compatible interface (OpenRouter/Groq/OpenAI)
        try:
            from langchain_openai import ChatOpenAI
            
            # Direct configuration for OpenRouter
            if "openrouter" in model_name or os.environ.get("OPENROUTER_API_KEY"):
                base_url = "https://openrouter.ai/api/v1"
                api_key = os.environ.get("OPENROUTER_API_KEY")
                return ChatOpenAI(
                    model=model_name,
                    temperature=0,
                    base_url=base_url,
                    api_key=api_key
                )
            return ChatOpenAI(model=model_name, temperature=0)
        except ImportError:
            raise ImportError(
                f"To use model '{model_name}', you must install the 'langchain-openai' package in your environment."
            )

def extract_code(text: str) -> str:
    """
    Strips markdown code block markers (like ```python, ```javascript or ```) from LLM outputs.
    """
    text = text.strip()
    if text.startswith("```"):
        # Find the end of the first line (e.g. ```javascript\n)
        first_line_end = text.find("\n")
        if first_line_end != -1:
            text = text[first_line_end:].strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    return text

def get_default_filename(language: str) -> str:
    lang = str(language).lower()
    if lang == "python":
        return "main.py"
    elif lang in ["typescript", "ts"]:
        return "index.ts"
    elif lang in ["go", "golang"]:
        return "main.go"
    elif lang == "rust":
        return "main.rs"
    else:
        return "index.js"

def format_files_for_prompt(code: str, language: str) -> str:
    """
    Formats the workspace files map (JSON) or raw code into a clean text prompt context.
    """
    if not code or not code.strip():
        return "Workspace is empty. No files exist yet."
        
    try:
        data = json.loads(code)
        if isinstance(data, dict) and "files" in data:
            files = data["files"]
            output = "Here is the current workspace files structure and their contents:\n\n"
            output += "Files:\n"
            for filepath in files.keys():
                output += f"- {filepath}\n"
            output += "\n---\n\n"
            for filepath, content in files.items():
                output += f"File: `{filepath}`\n"
                output += f"```{language}\n{content}\n```\n\n"
            return output
    except Exception:
        pass
        
    return f"Current code:\n```{language}\n{code}\n```"

def extract_json_files(content, default_filename: str) -> str:
    """
    Parses content to ensure it's a valid JSON files structure.
    If it's raw code, we wrap it in a default file mapping for backward compatibility.
    """
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and "text" in c:
                parts.append(c["text"])
            elif isinstance(c, str):
                parts.append(c)
            else:
                parts.append(str(c))
        content = "".join(parts)
    elif not isinstance(content, str):
        content = str(content) if content is not None else ""

    cleaned = content.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict) and "files" in data:
            return json.dumps(data)
    except Exception:
        pass
        
    # Fallback to single file mapping
    return json.dumps({
        "files": {
            default_filename: extract_code(content)
        }
    })


def developer_agent(state: PipelineState) -> dict:
    """
    Writes code based on the user requirement and language.
    If execution fails, it uses stderr feedback to fix runtime errors.
    If project_id is provided, it loads and leverages context from the best past generation.
    Supports multi-file projects using a structured JSON layout.
    """
    retries = state.get("dev_retries", 0) + 1
    user_prompt = state["user_prompt"]
    current_code = state.get("current_code", "")
    execution_stderr = state.get("execution_stderr", "")
    language = state.get("language", "javascript")
    
    project_id = state.get("project_id")
    if not project_id:
        project_id = f"project_{str(uuid.uuid4())[:8]}"
        
    best_past_code = ""
    best_past_score = 0
    best_past_findings = []
    
    # Load past memory context if project exists
    latest_gen = get_latest_generation(project_id)
    if latest_gen:
        best_past_code = latest_gen["code"]
        best_past_score = latest_gen["security_score"]
        best_past_findings = latest_gen["findings"]
        # If this is a new run starting on an existing project, pre-populate code
        if not current_code:
            current_code = best_past_code

    # Extract dynamic file context
    code_context = format_files_for_prompt(current_code or best_past_code, language)
    default_filename = get_default_filename(language)

    if retries > 1 and execution_stderr:
        prompt = (
            f"The previous execution failed with the following error:\n"
            f"```\n{execution_stderr}\n```\n\n"
            f"{code_context}\n\n"
            f"Please fix the bugs, adjust the file contents, and return the complete corrected JSON files map matching the requested schema."
        )
    elif best_past_code:
        prompt = (
            f"You are updating/refining a project. Here is the current project files layout and context:\n"
            f"{code_context}\n\n"
            f"The project previously achieved a security score of {best_past_score}/100.\n"
            f"Previously identified security findings to address (if any):\n"
            f"```json\n{json.dumps(best_past_findings, indent=2)}\n```\n\n"
            f"Please update, refine, or add code to satisfy the requirement: {user_prompt}\n"
            f"Ensure all functionality is preserved while addressing findings/updates. "
            f"Return the complete updated JSON files map matching the requested schema."
        )
    else:
        prompt = (
            f"Generate code files that satisfy the following requirements:\n"
            f"```\n{user_prompt}\n```\n\n"
            f"Return the files map matching the requested JSON schema."
        )
        
    system_prompt = (
        f"You are an expert {language} developer. Your goal is to write clean, "
        f"syntactically valid, self-contained code in {language}.\n\n"
        f"IMPORTANT: You must return your response as a valid JSON object matching the schema below. "
        f"Do not include any explanation or markdown wrapping outside of the JSON block.\n\n"
        f"JSON Response Schema:\n"
        f"{{\n"
        f"  \"files\": {{\n"
        f"    \"path/to/file1.ext\": \"file1 content\",\n"
        f"    \"path/to/file2.ext\": \"file2 content\"\n"
        f"  }}\n"
        f"}}\n"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt}
    ]
    
    llm = get_llm("DEVELOPER_MODEL", "gemini-2.5-flash-lite")
    response = llm.invoke(messages)
    code = extract_json_files(response.content, default_filename)
    
    event = {
        "node": "developer_agent",
        "message": f"Developer Agent generated code (attempt {retries})",
        "code_preview": code[:150] + "..." if len(code) > 150 else code
    }
    
    return {
        "project_id": project_id,
        "current_code": code,
        "dev_retries": retries,
        "stage_events": [event]
    }

def sandbox_execute(state: PipelineState) -> dict:
    """
    Executes the current code inside a Docker sandbox container to test functionality.
    """
    code = state["current_code"]
    language = state.get("language", "javascript")
    res = execute_in_sandbox(code, language)
    
    event = {
        "node": "sandbox_execute",
        "message": f"Docker sandbox execution completed. Success: {res['success']}",
        "stdout": res["stdout"],
        "stderr": res["stderr"]
    }
    
    return {
        "execution_stdout": res["stdout"],
        "execution_stderr": res["stderr"],
        "execution_success": res["success"],
        "stage_events": [event]
    }

def semgrep_scan(state: PipelineState) -> dict:
    """
    Runs local Semgrep static analysis scanning on the current code.
    """
    code = state["current_code"]
    language = state.get("language", "javascript")
    raw_findings = run_semgrep(code, language)
    normalized = [normalize_finding(f) for f in raw_findings]
    
    event = {
        "node": "semgrep_scan",
        "message": f"Semgrep scan completed. Found {len(normalized)} issue(s).",
        "findings": normalized
    }
    
    return {
        "raw_semgrep_findings": normalized,
        "stage_events": [event]
    }

def triage_agent(state: PipelineState) -> dict:
    """
    Evaluates Semgrep findings to filter false positives and assign a security score.
    Returns structured TriageOutput.
    """
    code = state["current_code"]
    findings = state.get("raw_semgrep_findings", [])
    user_prompt = state["user_prompt"]
    language = state.get("language", "javascript")
    
    findings_str = json.dumps(findings, indent=2)
    
    prompt = f"""You are a DevSecOps Triage Agent. Analyze the following {language} code written to fulfill this requirement:
Requirement: {user_prompt}

Code:
```{language}
{code}
```

The automated Semgrep scanner found the following potential vulnerabilities:
{findings_str}

Evaluate the findings:
1. Filter out false positives. A finding is a false positive if it does not apply to the context of this script or represents a safe usage.
2. Select only real vulnerabilities that must be fixed.
3. Assign a security score from 0 (very insecure, critical bugs) to 100 (fully secure, no issues). If there are no real vulnerabilities, the score should be 100 and the verdict should be 'clean'.
4. Provide a detailed reasoning for your verdict.
"""
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are a professional security triage engineer. Analyze code and security scanner findings. "
                "Filter out false positives, assess real security risks, and decide on a verdict ('fix' or 'clean') "
                "and security score (0-100)."
            )
        },
        {"role": "user", "content": prompt}
    ]
    
    llm = get_llm("TRIAGE_MODEL", "gemini-2.5-flash")
    structured_llm = llm.with_structured_output(TriageOutput)
    triage_output = structured_llm.invoke(messages)
    score = triage_output.security_score
    
    event = {
        "node": "triage_agent",
        "message": f"Triage verdict: {triage_output.verdict}. Security Score: {score}.",
        "reasoning": triage_output.reasoning,
        "score": score
    }
    
    # Record snapshot for the audit trail
    snapshot = {
        "iteration": state.get("security_iterations", 0),
        "code": code,
        "score": score,
        "findings": [f.model_dump() for f in triage_output.findings_to_fix]
    }
    
    return {
        "triage_output": triage_output,
        "security_score": score,
        "score_history": [score],
        "audit_trail": [snapshot],
        "stage_events": [event]
    }

def synthesizer_agent(state: PipelineState) -> dict:
    """
    Patches vulnerabilities reported by the Triage agent.
    """
    iterations = state.get("security_iterations", 0) + 1
    code = state["current_code"]
    triage = state["triage_output"]
    findings = triage.findings_to_fix if triage else []
    reasoning = triage.reasoning if triage else ""
    language = state.get("language", "javascript")
    
    findings_str = json.dumps([f.model_dump() for f in findings], indent=2)
    code_context = format_files_for_prompt(code, language)
    default_filename = get_default_filename(language)

    prompt = f"""You are a security patch synthesizer agent. Your task is to secure the code in this workspace:
{code_context}

The Triage Agent identified the following real security vulnerabilities that you must fix:
{findings_str}

Triage Agent Reasoning:
{reasoning}

Instructions:
1. Fix all identified vulnerabilities in their respective files.
2. Ensure you DO NOT break the functionality or requirements of the original code.
3. Write clean, idiomatic code.
4. Return ONLY the updated code files map as a valid JSON object matching the schema.
"""

    system_prompt = (
        f"You are a senior security patch engineer. Patch security vulnerabilities "
        f"in {language} code while strictly preserving functionality.\n\n"
        f"IMPORTANT: You must return your response as a valid JSON object matching the schema below. "
        f"Do not include any explanation or markdown wrapping outside of the JSON block.\n\n"
        f"JSON Response Schema:\n"
        f"{{\n"
        f"  \"files\": {{\n"
        f"    \"path/to/file1.ext\": \"file1 content\",\n"
        f"    \"path/to/file2.ext\": \"file2 content\"\n"
        f"  }}\n"
        f"}}\n"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt}
    ]
    
    llm = get_llm("SYNTHESIZER_MODEL", "gemini-2.5-flash")
    response = llm.invoke(messages)
    patched_code = extract_json_files(response.content, default_filename)
    
    event = {
        "node": "synthesizer_agent",
        "message": f"Synthesizer patched vulnerabilities (iteration {iterations})",
        "code_preview": patched_code[:150] + "..." if len(patched_code) > 150 else patched_code
    }
    
    return {
        "current_code": patched_code,
        "security_iterations": iterations,
        "stage_events": [event]
    }

def sandbox_verify(state: PipelineState) -> dict:
    """
    Executes patched code in a Docker sandbox to confirm the fix didn't break functionality.
    """
    code = state["current_code"]
    language = state.get("language", "javascript")
    res = execute_in_sandbox(code, language)
    
    event = {
        "node": "sandbox_verify",
        "message": f"Verification run: execution success is {res['success']}",
        "stdout": res["stdout"],
        "stderr": res["stderr"]
    }
    
    return {
        "execution_stdout": res["stdout"],
        "execution_stderr": res["stderr"],
        "execution_success": res["success"],
        "stage_events": [event]
    }

def finalize(state: PipelineState) -> dict:
    """
    Sets the final code, saves the project and generation run to long-term memory,
    and logs pipeline completion.
    """
    final_code = state["current_code"]
    project_id = state.get("project_id") or f"project_{str(uuid.uuid4())[:8]}"
    score = state.get("security_score", 0)
    
    triage = state.get("triage_output")
    findings = []
    if triage:
        if hasattr(triage, "findings_to_fix"):
            findings = [f.model_dump() if hasattr(f, "model_dump") else f for f in triage.findings_to_fix]
        elif isinstance(triage, dict) and "findings_to_fix" in triage:
            findings = triage["findings_to_fix"]
            
    # Try saving to long-term database (Postgres or SQLite fallback)
    try:
        # Create/Update project entry
        create_project(
            project_id=project_id,
            name=f"Project {project_id[:8]}",
            prompt=state["user_prompt"],
            language=state.get("language", "javascript")
        )
        # Compute embedding for semantic search
        emb = get_embedding(state["user_prompt"])
        # Save generation
        create_generation(
            project_id=project_id,
            code=final_code,
            security_score=score,
            findings=findings,
            embedding=emb
        )
        db_status = "Saved to long-term memory."
    except Exception as e:
        db_status = f"Database save failed: {str(e)}"
        print(f"finalize node WARNING: {db_status}")
    
    event = {
        "node": "finalize",
        "message": f"Pipeline completed successfully. Code is clean and functional. {db_status}"
    }
    
    return {
        "project_id": project_id,
        "final_code": final_code,
        "stage_events": [event]
    }
