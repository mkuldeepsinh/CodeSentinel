# CodeSentinel — Orchestrator Graph Diagram

This diagram visualizes the LangGraph state machine flow, agents, tool nodes, and conditional loops.

```mermaid
flowchart TD
    START([START]) --> developer_agent[developer_agent]
    developer_agent --> e2b_execute[e2b_execute]
    
    e2b_execute -->|error + retries &lt; 3| developer_agent
    e2b_execute -->|success or max retries| semgrep_scan[semgrep_scan]
    
    semgrep_scan --> triage_agent[triage_agent]
    
    triage_agent -->|verdict = clean| finalize[finalize]
    triage_agent -->|verdict = fix| synthesizer_agent[synthesizer_agent]
    
    synthesizer_agent --> e2b_verify[e2b_verify]
    
    e2b_verify -->|broke execution| synthesizer_agent
    e2b_verify -->|still runs| semgrep_scan
    
    finalize --> END([END])

    style START fill:#34a853,stroke:#333,stroke-width:2px,color:#fff
    style END fill:#ea4335,stroke:#333,stroke-width:2px,color:#fff
    style developer_agent fill:#4285f4,stroke:#333,stroke-width:1px,color:#fff
    style triage_agent fill:#4285f4,stroke:#333,stroke-width:1px,color:#fff
    style synthesizer_agent fill:#4285f4,stroke:#333,stroke-width:1px,color:#fff
    style e2b_execute fill:#fbbc05,stroke:#333,stroke-width:1px,color:#000
    style e2b_verify fill:#fbbc05,stroke:#333,stroke-width:1px,color:#000
    style semgrep_scan fill:#fbbc05,stroke:#333,stroke-width:1px,color:#000
    style finalize fill:#9333ea,stroke:#333,stroke-width:1px,color:#fff
```

### Node Description
* **Blue Nodes**: LLM Agents (`gemini-2.0-flash`).
* **Yellow Nodes**: Functional Tools (E2B sandbox execution and Semgrep scanning).
* **Purple Node**: Finalizer and formatter logic.
