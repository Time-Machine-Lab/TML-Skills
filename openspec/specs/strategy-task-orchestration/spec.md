# strategy-task-orchestration Specification

## Purpose
TBD - created by archiving change create-bilibili-growth-ops-skill. Update Purpose after archive.
## Requirements
### Requirement: Capability packages SHALL define reusable work units
The system SHALL define `Capability` packages as reusable work units with clear purpose, inputs, outputs, command dependencies, and agent judgment points.

#### Scenario: Agent reads a capability package
- **WHEN** an agent opens a capability definition
- **THEN** the agent SHALL be able to understand what the capability does, what inputs it needs, what outputs it produces, and which commands it may use

### Requirement: Strategy packages SHALL define promotion打法
The system SHALL define `Strategy` packages as promotion打法 templates rather than simple feature bundles.

#### Scenario: User selects a strategy
- **WHEN** the user chooses a strategy for a product
- **THEN** the system SHALL provide stage structure, stage goals, stage entry/exit conditions, and do/do-not rules for that strategy

### Requirement: TaskSpec SHALL be generated from Product and Strategy
The system SHALL generate a `TaskSpec` from a selected product and strategy, and SHALL store task control as files rather than as a heavy database object.

#### Scenario: Task is created
- **WHEN** a user confirms a product and a strategy
- **THEN** the system SHALL create a task workspace with `TASK.md`, `WORKLOG.md`, and stage output storage
- **AND** SHALL record the selected product and strategy in the task definition

### Requirement: First release SHALL include one built-in baseline strategy
The system SHALL include one built-in baseline strategy in the first release.

#### Scenario: Built-in baseline strategy is used
- **WHEN** the user does not provide a custom strategy
- **THEN** the system SHALL offer a baseline flow of public comment outreach, comment-reply follow-up, and high-intent DM escalation

### Requirement: Task files SHALL support stage control and recovery
The system SHALL keep enough task state in task files to support staged execution, pause, resume, and cooperative review.

#### Scenario: Task is paused and resumed
- **WHEN** a running task is paused after a stage or interrupted mid-flow
- **THEN** the task files SHALL preserve enough context for the main agent to resume from a known stage boundary

