# bilibili-command-and-fact-store Specification

## Purpose
TBD - created by archiving change create-bilibili-growth-ops-skill. Update Purpose after archive.
## Requirements
### Requirement: First release SHALL support single-account execution
The system SHALL support a single managed Bilibili account in the first release and SHALL provide an account session lifecycle for that account.

#### Scenario: User logs in with one account
- **WHEN** the user completes the Bilibili login flow
- **THEN** the system SHALL bind the resulting session to one managed account
- **AND** SHALL make that account available for subsequent operations

### Requirement: Structured facts SHALL be stored in SQLite
The system SHALL store structured domain facts in SQLite, including `Account`, `Product`, `BilibiliUser`, `BilibiliVideo`, `BilibiliComment`, and `OperationRecord`.

#### Scenario: Runtime data is persisted
- **WHEN** the system observes or creates structured entities during operation
- **THEN** the system SHALL persist them in SQLite instead of relying on execution logs as the primary source of truth

### Requirement: The command surface SHALL be atomic and grouped by core Bilibili abilities
The system SHALL expose atomic command capabilities for login/session, account info, video, comment, notification, and direct-message operations.

#### Scenario: Agent invokes a single command
- **WHEN** an agent requests a single Bilibili action
- **THEN** the system SHALL execute one clear atomic command
- **AND** SHALL avoid bundling a multi-stage workflow into the same command

### Requirement: Real outbound actions SHALL create OperationRecord entries
The system SHALL record real outbound actions in `OperationRecord` and SHALL support direct history queries for deduplication and review.

#### Scenario: Comment is sent
- **WHEN** the system successfully posts a public comment
- **THEN** it SHALL create an `OperationRecord` for that action
- **AND** SHALL make the record queryable by account, target, and action type

#### Scenario: Agent checks whether an action already happened
- **WHEN** the system evaluates whether to skip or continue an outreach action
- **THEN** it SHALL be able to query `OperationRecord` directly instead of inferring from logs

### Requirement: Outbound throttle policy SHALL use one centralized rule source
The system SHALL manage outbound throttle policy for public comments, comment replies, and direct messages through one centralized rule source, and SHALL expose command-level read and update paths for that policy.

#### Scenario: Agent checks send pacing before a real outbound action
- **WHEN** an agent evaluates whether a comment, reply, or direct message may be sent
- **THEN** the system SHALL return the currently effective throttle policy together with recent outbound history
- **AND** SHALL use that same policy source for send-time validation

#### Scenario: User changes throttle policy in natural language
- **WHEN** the user asks to change outbound pacing constraints
- **THEN** the agent SHALL be able to translate that request into a precise policy update through the command layer
- **AND** the updated policy SHALL become the single source of truth for subsequent checks and sends

### Requirement: Command results SHALL return structured guidance
The system SHALL return structured command results with next-step guidance and risk-related hints.

#### Scenario: Command completes successfully
- **WHEN** an atomic command returns a successful result
- **THEN** the response SHALL include enough structured information for an agent to understand what happened
- **AND** SHALL include guidance or constraints for what to do next

