# outreach-followup-modules Specification

## Purpose
TBD - created by archiving change refactor-bilibili-skill-modules. Update Purpose after archive.
## Requirements
### Requirement: Outreach planning consumes prepared candidate pools instead of live search
The outreach-plan module SHALL consume a prepared BVID pool as its default video source and SHALL avoid repeated live keyword search during normal execution except when a refresh or refill condition is explicitly triggered.

#### Scenario: Normal campaign execution
- **WHEN** a scheme-based outreach run starts
- **THEN** the planner selects the next candidate from the prepared BVID pool rather than issuing a new search request for every cycle

#### Scenario: Pool refresh is required
- **WHEN** the candidate pool is exhausted, stale, or explicitly refreshed by the operator
- **THEN** the workflow routes back to the candidate-video module instead of silently resuming uncontrolled live search

### Requirement: Outreach actions and inbox follow-up are separate loops
The system SHALL model public outreach actions and inbox/private-message follow-up as separate modules with separate state and responsibilities, so lead creation and lead handling do not compete inside one opaque execution loop.

#### Scenario: Outreach plan creates new leads
- **WHEN** the outreach module posts a comment, replies in a thread, or triggers a private-message escalation
- **THEN** the resulting lead is made available to the follow-up module without requiring the outreach loop to also own the later inbox tracking work

#### Scenario: Follow-up loop is running
- **WHEN** the inbox-follow-up module is active
- **THEN** it processes unread-driven follow-up tasks without issuing unrelated candidate discovery or public outreach actions

### Requirement: Follow-up polling is driven by unread indicators
The inbox-follow-up module SHALL use unread private-message counts and unread comment-reply signals as the primary trigger for deeper message retrieval instead of continuously polling all tracked sessions.

#### Scenario: No unread activity exists
- **WHEN** unread private-message and unread reply indicators both show no new activity
- **THEN** the follow-up loop performs no deep per-session sync for that cycle

#### Scenario: Unread activity exists
- **WHEN** unread indicators show new private messages or new comment replies
- **THEN** the module retrieves the relevant message or reply details for those unread items and prepares the appropriate follow-up action

### Requirement: Intent grading controls escalation path
The modular workflow SHALL classify interaction opportunities into at least medium-intent and high-intent paths, and the grade SHALL determine whether the workflow replies publicly only or replies publicly and opens a private-message follow-up.

#### Scenario: Medium-intent comment
- **WHEN** a candidate interaction is graded as medium intent
- **THEN** the outreach plan limits the action to the public reply path by default and does not immediately send a private message

#### Scenario: High-intent interaction
- **WHEN** a candidate interaction is graded as high intent
- **THEN** the workflow allows a coordinated public reply plus private-message follow-up path and records that escalation for the follow-up module

