from typing import TypedDict, List, Optional, Any
from typing_extensions import Annotated
import operator
from pydantic import BaseModel, Field

class SemgrepFinding(BaseModel):
    check_id: str = Field(description="The unique identifier for the Semgrep rule")
    message: str = Field(description="The description of the vulnerability finding")
    severity: str = Field(description="The severity level of the finding: ERROR, WARNING, or INFO")
    line: int = Field(description="The line number where the finding was detected")
    cwe: List[str] = Field(default_factory=list, description="List of CWE identifiers associated with the finding")
    owasp: List[str] = Field(default_factory=list, description="List of OWASP category identifiers associated with the finding")

class TriageOutput(BaseModel):
    verdict: str = Field(description="The verdict of the triage: 'fix' (if real security vulnerabilities need patching) or 'clean' (if no fixes are needed)")
    security_score: int = Field(description="The security score assigned to the code, from 0 (very insecure) to 100 (fully secure)")
    findings_to_fix: List[SemgrepFinding] = Field(default_factory=list, description="List of real security findings that the Synthesizer agent must fix")
    reasoning: str = Field(description="Explanation and justification for the verdict and security score")

class PipelineState(TypedDict):
    project_id: Optional[str]
    user_prompt: str
    language: str
    current_code: str
    execution_stdout: str
    execution_stderr: str
    execution_success: bool
    dev_retries: int
    raw_semgrep_findings: List[dict]
    triage_output: Optional[TriageOutput]
    security_score: int
    security_iterations: int
    final_code: str
    # When True, the START edge skips developer_agent and routes directly to semgrep_scan.
    # Set by the API when the user submits their own code for analysis.
    skip_developer: Optional[bool]
    # State fields that accumulate updates
    stage_events: Annotated[List[dict], operator.add]
    score_history: Annotated[List[int], operator.add]
    audit_trail: Annotated[List[dict], operator.add]

