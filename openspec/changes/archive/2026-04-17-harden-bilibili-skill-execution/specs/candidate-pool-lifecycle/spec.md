## ADDED Requirements

### Requirement: Candidate selection SHALL reserve before consuming
The system SHALL reserve a candidate video for a campaign before the video is marked consumed. A reserved candidate MUST record ownership and reservation timing so the runtime can distinguish “selected for current work” from “successfully used.”

#### Scenario: Candidate is selected for a campaign
- **WHEN** a campaign requests the next candidate video
- **THEN** the selected candidate SHALL transition to `reserved`
- **THEN** the reservation SHALL record the owning campaign identifier and reservation timestamp
- **THEN** the candidate SHALL NOT transition to `consumed` until a qualifying execution step succeeds

#### Scenario: Reserved candidate is successfully used
- **WHEN** a reserved candidate leads to a successful campaign-bound public execution step that finalizes usage
- **THEN** the candidate SHALL transition from `reserved` to `consumed`
- **THEN** the runtime SHALL record the final consumption timestamp

### Requirement: Candidate reservations SHALL be recoverable
The system SHALL recover gracefully from interrupted execution. Reserved candidates MUST be releasable back into executable inventory when the reservation expires, is cancelled, or fails before completion.

#### Scenario: Execution fails after reservation
- **WHEN** a candidate is reserved and the downstream execution step fails before final completion
- **THEN** the system SHALL allow that candidate to return to an executable non-consumed state
- **THEN** the state transition SHALL preserve a failure reason for auditability

#### Scenario: Process restarts with stale reservations
- **WHEN** the runtime loads a candidate pool containing expired or stale reserved candidates
- **THEN** the system SHALL reconcile those candidates back into a reusable state or an explicit review-needed state
- **THEN** the system SHALL NOT silently leave them permanently unavailable

### Requirement: Candidate selection SHALL avoid duplicate concurrent use
The system SHALL prevent the same candidate from being actively selected by multiple campaigns at the same time unless an operator explicitly releases it.

#### Scenario: Another campaign requests a reserved candidate
- **WHEN** a candidate is already reserved by one active campaign
- **THEN** candidate selection for a different campaign SHALL skip that candidate
- **THEN** the selector SHALL continue to the next eligible candidate

#### Scenario: Operator manually reviews a reserved candidate
- **WHEN** an operator inspects a candidate pool containing reserved items
- **THEN** the candidate metadata SHALL show reservation owner, reservation time, and current state clearly enough to decide whether to keep, release, or blacklist the video
