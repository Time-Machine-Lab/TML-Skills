## ADDED Requirements

### Requirement: Main agent SHALL own planning and delegation
The system SHALL use a main agent that owns global planning, task judgment, delegation, and execution summary.

#### Scenario: Main agent coordinates a task
- **WHEN** a task is running
- **THEN** the main agent SHALL remain responsible for deciding what segment to execute next
- **AND** SHALL decide whether work stays local or is delegated

### Requirement: Subagents SHALL own delegated task segments
The system SHALL treat subagents as delegated workers for a capability or task segment, not as single-command wrappers.

#### Scenario: Capability is delegated
- **WHEN** the main agent delegates a capability run
- **THEN** the subagent SHALL own that delegated work segment
- **AND** MAY execute multiple atomic commands inside that segment before returning results

#### Scenario: Task phase is delegated
- **WHEN** the main agent delegates a stage fragment from `TaskSpec`
- **THEN** the subagent SHALL work against that stage fragment as a bounded assignment instead of a single command call

### Requirement: First release SHALL use stage-level review-first execution
The system SHALL default to review-first execution with stage-level approval in the first release.

#### Scenario: First execution round is prepared
- **WHEN** the system reaches a new execution stage that includes outbound content
- **THEN** it SHALL produce stage results and drafts for review before unrestricted execution continues

#### Scenario: Same stage continues after approval
- **WHEN** the first review for a stage is approved
- **THEN** the system MAY continue within that stage without forcing per-item approval

### Requirement: Writeback boundaries SHALL be explicit
The system SHALL keep writeback boundaries explicit between the main agent and subagents.

#### Scenario: Subagent completes outbound work
- **WHEN** a subagent executes a real outbound action
- **THEN** the system SHALL write the corresponding `OperationRecord`
- **AND** SHALL return execution results to the main agent for task-level state reconciliation

#### Scenario: Task control state is updated
- **WHEN** `TASK.md` or `WORKLOG.md` needs a stage-level state update
- **THEN** the main agent SHALL remain the authority for that update

### Requirement: The execution loop SHALL support pause, resume, and recovery
The system SHALL support pausing, resuming, and recovering delegated work without losing task control.

#### Scenario: Delegated work is interrupted
- **WHEN** a subagent run is interrupted or fails
- **THEN** the main agent SHALL be able to recover using task files and recorded facts
- **AND** SHALL avoid treating the interrupted work as invisible or unrecoverable
