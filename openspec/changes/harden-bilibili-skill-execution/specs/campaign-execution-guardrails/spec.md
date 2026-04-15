## ADDED Requirements

### Requirement: Campaign next-step planning SHALL be authoritative
The system SHALL treat the campaign loop as an authoritative scheduler rather than a suggestion-only layer. For any active campaign, the next-step planner SHALL evaluate current campaign runtime, unread activity, pacing windows, and remaining budgets, then return exactly one primary next action or one blocking state with a concrete reason and next eligible time.

#### Scenario: Active video is still cooling down
- **WHEN** a campaign has an active video and the minimum public-action gap has not elapsed
- **THEN** the next-step planner SHALL return a blocked public-action state for that video
- **THEN** the result SHALL include the blocking reason and a `notBefore` timestamp

#### Scenario: No active video is selected
- **WHEN** a campaign has remaining public budget and no active video is reserved for execution
- **THEN** the next-step planner SHALL return candidate selection as the next primary action

#### Scenario: Inbox work must preempt public outreach
- **WHEN** unread private messages, unread comment replies, or a wait-for-reply thread is present for the campaign context
- **THEN** the next-step planner SHALL return inbox-follow-up as the next primary action before any new public outreach step

### Requirement: Campaign pacing SHALL be enforced at send time and status time by the same rules
The system SHALL use one shared pacing evaluator for campaign planning, campaign status, next-step planning, and send-time validation. That evaluator MUST enforce per-hour campaign budgets, per-video quality-tier reply limits, minimum public-action gaps, cross-video hop windows, and active-video dwell limits.

#### Scenario: Hourly public budget is exhausted before total budget is exhausted
- **WHEN** a campaign still has total runtime budget remaining but the current hourly public-action allowance has been consumed
- **THEN** campaign status SHALL show the campaign as blocked for additional public outreach in the current window
- **THEN** send-time validation SHALL reject further public sends for the same reason

#### Scenario: Video dwell time has elapsed
- **WHEN** the active video has exceeded its allowed dwell window for its quality tier
- **THEN** the next-step planner SHALL stop recommending additional public replies on that video
- **THEN** the planner SHALL recommend inbox handling or candidate rotation instead

#### Scenario: Status and send guard evaluate the same campaign
- **WHEN** campaign status reports that a public action is blocked
- **THEN** a subsequent campaign-bound `thread send` for the same blocked action SHALL be rejected by the same policy rather than silently succeeding

### Requirement: Intent escalation SHALL gate DM promotion
The system SHALL only allow campaign-driven DM escalation when a lead has high-intent signals or an existing DM conversation. Medium-intent leads MUST remain in public reply flow unless the user explicitly upgrades their intent through new interaction.

#### Scenario: Medium-intent lead remains in public flow
- **WHEN** a lead asks follow-up questions or shows mild interest without requesting contact or expressing clear adoption intent
- **THEN** the campaign planner SHALL recommend public reply only
- **THEN** campaign-driven DM escalation SHALL be blocked for that lead

#### Scenario: High-intent lead is eligible for DM escalation
- **WHEN** a lead explicitly asks how to contact, join, obtain materials, or shows clear adoption or purchasing intent
- **THEN** the planner SHALL allow a DM continuation step in addition to public reply handling

#### Scenario: Cold DM lacks prior signal
- **WHEN** a campaign attempts to open a DM without prior conversation and without high-intent evidence
- **THEN** the action SHALL be classified as blocked or high-risk
- **THEN** the operator output SHALL tell the agent to continue public or inbox context gathering instead
