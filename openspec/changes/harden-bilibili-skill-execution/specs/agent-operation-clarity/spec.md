## ADDED Requirements

### Requirement: Module documentation SHALL describe executable entrypoints precisely
Each top-level module document in the skill SHALL describe its purpose, entry conditions, exact commands, required flags, key outputs, and explicit non-goals. The documentation SHALL be detailed enough that an agent can choose the right command path without inferring hidden workflow.

#### Scenario: Agent enters a module for the first time
- **WHEN** an agent reads a module document to decide its next command
- **THEN** the document SHALL identify the exact commands for that module
- **THEN** the document SHALL state which flags are mandatory and which outputs the agent should inspect before proceeding

#### Scenario: Agent is in the wrong module
- **WHEN** the current task belongs to another module or requires a prerequisite step
- **THEN** the document SHALL state which module to switch to and why

### Requirement: Outreach documentation SHALL expose the real execution path and timing defaults
The outreach-plan documentation and related references SHALL name the actual public send path, explain how campaign planning relates to thread sending, and list the default pacing windows used for safe execution.

#### Scenario: Agent wants to send a public reply during a campaign
- **WHEN** the agent reads outreach-plan guidance
- **THEN** the documentation SHALL identify the campaign-bound public send entrypoint explicitly rather than implying that planning commands perform the send
- **THEN** the documentation SHALL explain the gating relationship between `campaign run`, `campaign next`, `campaign status`, and `thread send`

#### Scenario: Agent tunes campaign timing
- **WHEN** the agent needs to understand public gaps, inbox-check cadence, or cross-video switching windows
- **THEN** the documentation SHALL state the default timing values and where those values are enforced

### Requirement: Candidate collection documentation SHALL expose pacing controls and pool semantics
The video-candidate-pool documentation SHALL describe the risk-control timing parameters of collection, the candidate lifecycle states, and the difference between collecting, reserving, consuming, and manually reviewing a candidate.

#### Scenario: Agent wants to slow collection for risk control
- **WHEN** the agent reads candidate collection guidance
- **THEN** the documentation SHALL show the available pacing flags and their default windows
- **THEN** the documentation SHALL explain when to tune them upward for safer collection

#### Scenario: Agent reviews candidate state before execution
- **WHEN** the agent inspects a pool with mixed candidate states
- **THEN** the documentation SHALL explain what each lifecycle state means and which states are eligible for execution
