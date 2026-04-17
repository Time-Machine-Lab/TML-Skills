## ADDED Requirements

### Requirement: New skill identity and entry package
The system SHALL provide a brand-new skill package named `bilibili-growth-ops` with a distinct main entry, and SHALL NOT depend on `bilibili-api-skill` as its engineering base.

#### Scenario: User sees the new skill
- **WHEN** the skill is installed or listed in the workspace
- **THEN** the user SHALL see the new identity `Bilibili Growth Ops`
- **AND** the skill SHALL present itself as a Bilibili growth operations system rather than an API utility

### Requirement: Main skill SHALL route by lifecycle stage
The main skill SHALL act as a project map and route users and agents based on their current lifecycle stage.

#### Scenario: First-time use routes to bootstrap
- **WHEN** no runtime workspace or account state is available
- **THEN** the main skill SHALL route the user to initialization and environment setup guidance

#### Scenario: Existing operator routes to the right layer
- **WHEN** the runtime workspace already exists
- **THEN** the main skill SHALL route the user toward product management, strategy/task work, or record inspection based on intent

### Requirement: Runtime workspace SHALL use a generic cross-agent default path
The system SHALL initialize its runtime workspace under a generic cross-agent path by default, and SHALL allow runtime-root overrides.

#### Scenario: Default runtime path is used
- **WHEN** the user does not provide any runtime-root override
- **THEN** the system SHALL use `~/.tml/skills/bilibili-growth-ops` as the default runtime workspace

#### Scenario: Runtime path is overridden
- **WHEN** the user provides a runtime-root via supported configuration input
- **THEN** the system SHALL initialize and operate from the provided runtime workspace instead of the default path

### Requirement: Bootstrap SHALL validate execution prerequisites
The system SHALL validate runtime prerequisites before allowing operational workflows to continue.

#### Scenario: Unsupported environment is detected
- **WHEN** required runtime prerequisites such as Node version are not satisfied
- **THEN** the system SHALL stop bootstrap
- **AND** SHALL return a clear remediation message instead of proceeding with a partial setup

#### Scenario: Missing runtime structure is detected
- **WHEN** the runtime workspace exists but required directories or files are missing
- **THEN** the system SHALL surface the missing items
- **AND** SHALL provide a deterministic repair path
