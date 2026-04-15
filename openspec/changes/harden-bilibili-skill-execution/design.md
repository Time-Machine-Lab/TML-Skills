## Context

`refactor-bilibili-skill-modules` solved the first problem: the skill now presents a clean top-level chain of `init -> product -> video-candidate-pool -> outreach-plan -> inbox-follow-up`. The remaining problem is deeper: runtime behavior is still split between documented expectations and loosely coordinated commands. `campaign run` creates state but does not drive a stable execution loop, `candidate next` consumes videos too early for crash recovery, and several timing / escalation rules exist in prose without being fully enforced.

The user explicitly wants the new skill to fully embrace the new workflow with no legacy mental model, no compatibility layer, and no agent guessing. This design therefore treats the next step as execution hardening rather than another documentation-only pass.

There are no existing `docs/api` or `docs/sql` contracts for this area, and the current scope does not introduce a new external interface or database. The change is internal to the skill bundle, its runtime JSON state, and its operator-facing documentation.

## Goals / Non-Goals

**Goals:**
- Make the campaign loop authoritative enough for long-running agent operation without requiring the agent to invent its own pacing logic.
- Prevent premature loss of candidate videos by introducing a recoverable reservation lifecycle.
- Make public outreach and inbox follow-up coordination explicit and enforced.
- Convert intent escalation and risk timing from prose into runtime rules and operator-visible status.
- Remove remaining ambiguity from module docs, command docs, and risk references.

**Non-Goals:**
- Building a fully autonomous daemon that sends messages without any command-level control.
- Adding new external APIs, remote services, or database dependencies.
- Preserving old command semantics when they conflict with the new, more controllable execution model.
- Reintroducing any compatibility wording or migration path for the previous flat-skill workflow.

## Decisions

### 1. Keep the command surface centered on existing high-level commands, but make `campaign next` authoritative
The skill already has the right high-level surfaces: `campaign`, `candidate`, `watch`, `inbox`, and `thread`. The design keeps that surface stable and upgrades `campaign next` from “suggestion builder” into the single authoritative next-step planner for campaign execution.

`campaign next` should return:
- the next allowed action kind
- the gating reason when blocked
- the earliest `notBefore` timestamp
- the relevant video / thread context
- whether execution must hand off to inbox-follow-up

This is preferred over introducing a brand-new orchestration command because it reduces command sprawl while still giving the agent a clear loop driver.

### 2. Introduce candidate reservation before final consumption
Today, a candidate is marked `consumed` as soon as it is selected. That makes recovery brittle and burns inventory on any failed send, operator interruption, or crash. The design adds a reserved execution state:

```text
new / approved -> reserved -> consumed
                       \-> approved (release / expiry / failure)
                       \-> blacklisted
```

Reserved candidates must store campaign ownership and reservation timestamps. Startup and status flows should reconcile expired reservations back into an executable state instead of silently losing them.

This is preferred over keeping the current eager-consume model because long-running campaigns need restart safety and auditable inventory control.

### 3. Use one shared pacing evaluator for status, planning, and send-time guards
The current design exposes pacing in plan output, but send-time enforcement only covers part of that policy. The new design uses one shared evaluator for:
- `campaign status`
- `campaign next`
- `thread send --channel comment|dm --campaign ...`

That evaluator should account for:
- per-hour campaign budgets
- per-video reply caps by quality tier
- minimum gap between public actions on the same video
- minimum cross-video hop window
- video dwell expiry
- inbox preemption when unread activity exists

This is preferred over separate “status logic” and “send guard logic” because conflicting answers confuse the agent and undermine trust in the scheduler.

### 4. Treat inbox activity as a first-class preemption signal
Public outreach and follow-up are intentionally separate modules, but they still need one handoff contract. The design requires the campaign loop to yield to inbox-follow-up when:
- unread private messages exist
- unread comment replies exist
- the current thread is in a wait-for-reply state
- a high-intent lead is ready for DM continuation

This preserves the user’s intended model: outreach creates leads; inbox-follow-up consumes live signals. It also keeps the agent from mindlessly continuing public actions while existing leads are waiting.

### 5. Encode medium/high intent escalation into rules, not just examples
The user’s intended policy is already clear:
- medium intent -> public reply only
- high intent -> public reply plus DM follow-up when appropriate

The runtime design makes this a guarded transition rather than a stylistic recommendation. DM escalation should require one of:
- explicit contact / join / resource request
- clear product adoption / purchasing / long-term usage intent
- an existing DM conversation with recent engagement

Cold DM without signal remains blocked or high-risk. This is preferred over leaving escalation fully manual because the skill’s main failure mode has been over-reliance on agent inference.

### 6. Rewrite operator docs around exact commands, required flags, outputs, and timing defaults
The module docs should be treated as part of the execution system, not just as narrative help. Each module document and key reference should include:
- purpose and entry conditions
- exact command entrypoints
- required flags and optional tuning flags
- output fields the agent should inspect
- timing / risk defaults
- “do not use this for” guidance

Special attention is required for:
- `outreach-plan.md`: must name the actual public send path, not only campaign planning commands
- `video-candidate-pool.md`: must document pacing flags exposed by `candidate collect`
- `risk-policy.md`: must spell out enforced timing windows rather than generic warnings

This is preferred over lighter prose edits because the problem to solve is operator ambiguity, not wording polish.

## Risks / Trade-offs

- [Risk] Harder pacing guards may make campaigns feel slower than the current loose flow. -> Mitigation: expose `notBefore`, remaining budgets, and block reasons so the slowdown is explainable and intentional.
- [Risk] Candidate reservation adds more runtime state and reconciliation logic. -> Mitigation: keep the state machine narrow, persist reservation metadata explicitly, and reconcile stale reservations on load.
- [Risk] Tight intent gating may reduce short-term DM volume. -> Mitigation: optimize for controllability and lead quality rather than raw outbound volume; keep public reply paths available for medium-intent users.
- [Risk] Rewriting docs and command semantics together can create temporary implementation churn. -> Mitigation: implement runtime guards and docs in the same change so the published docs always match the actual behavior.
- [Risk] A command-driven loop is still not a fully autonomous worker. -> Mitigation: make `campaign next` deterministic enough that an external agent loop can safely run for long periods without inventing its own scheduler.

## Migration Plan

1. Define the new requirements for campaign guardrails, candidate lifecycle, and operator clarity in OpenSpec specs.
2. Refactor campaign runtime state so selected videos become reserved before they are consumed.
3. Centralize pacing and escalation checks into a shared evaluator used by `campaign status`, `campaign next`, and `thread send`.
4. Update module docs and references so command semantics and timings match the new runtime behavior exactly.
5. Verify recovery behavior with interrupted candidate selection, blocked pacing windows, unread-preemption, and long-running watch/campaign coordination.

No compatibility layer is planned. The new execution model should replace the current weaker semantics directly.

## Open Questions

- Should reservation expiry be a fixed default window or a per-scheme parameter exposed in campaign settings?
- Should `campaign next` directly emit an executable send payload skeleton, or only an authoritative action plan plus context?
- How much manual override should remain for forcing DM escalation in edge cases without reintroducing guesswork?
- Should long-running execution eventually gain a dedicated `campaign loop` command, or is a hardened `campaign next` sufficient for the team’s agent-driven workflow?
