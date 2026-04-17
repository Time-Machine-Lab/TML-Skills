## ADDED Requirements

### Requirement: Main skill routes users through explicit modules
The Bilibili skill bundle SHALL expose a single main entry skill that classifies the user's current stage and routes them to the appropriate module instead of requiring the agent to infer the full workflow from low-level scripts alone.

#### Scenario: User requests first-time setup
- **WHEN** the user enters the bundle with a setup or login goal
- **THEN** the main skill routes the user to the initialization module and presents setup-specific next steps instead of generic campaign or send commands

#### Scenario: User requests campaign execution
- **WHEN** the user enters the bundle with a promotion or execution goal
- **THEN** the main skill routes the user to the outreach-plan module and references the prepared product context and candidate-video pool before any send action is suggested

### Requirement: Bundle modules are disclosed progressively
The bundle SHALL define distinct modules for overview, initialization, product definition, candidate-video collection, outreach planning, and inbox follow-up, and each module SHALL expose only the context, commands, and responsibilities needed for its stage.

#### Scenario: User is reading the overview
- **WHEN** the user asks what the skill does or how to start
- **THEN** the overview module explains the module map, the recommended stage order, and the handoff conditions between modules

#### Scenario: User is working inside a specific module
- **WHEN** the user is routed into a specific module such as candidate-video collection
- **THEN** the module limits its guidance to that domain's assets, commands, and decisions instead of re-explaining unrelated inbox or send operations

### Requirement: High-risk operations declare their boundary and escalation rule
The modular architecture SHALL explicitly mark low-level direct send and search operations as high-risk actions and SHALL define when the workflow must escalate from normal module guidance into explicit confirmation or guarded execution.

#### Scenario: User is about to bypass the high-level flow
- **WHEN** a user or agent attempts to jump directly to raw send or repeated search operations without the required context
- **THEN** the architecture documentation and routing guidance identify the bypass as high risk and point back to the correct high-level module or guarded command

#### Scenario: Module recommends a guarded action
- **WHEN** a module needs a direct action such as a raw message send or repeated search
- **THEN** the module includes the risk rationale, preconditions, and the confirmation boundary required before the action proceeds
