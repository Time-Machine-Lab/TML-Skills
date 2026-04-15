## 1. Campaign Execution Hardening

- [x] 1.1 Refactor campaign runtime evaluation so `campaign status`, `campaign next`, and campaign-bound `thread send` use one shared pacing and blocking policy
- [x] 1.2 Add hourly budget enforcement, video dwell expiry, and inbox-preemption checks to the shared campaign evaluator
- [x] 1.3 Tighten campaign DM escalation so medium-intent leads stay in public flow and only high-intent or existing-DM leads can promote to DM

## 2. Candidate Pool Lifecycle

- [x] 2.1 Extend candidate-pool state to support reservation metadata and a recoverable `reserved` lifecycle state
- [x] 2.2 Change candidate selection so `candidate next` reserves first and only marks `consumed` after qualifying execution succeeds
- [x] 2.3 Add stale-reservation reconciliation and operator-visible state details for restart safety and auditability

## 3. Agent-Facing Documentation

- [x] 3.1 Rewrite `SKILL.md`, `operations/outreach-plan.md`, and `operations/video-candidate-pool.md` so exact commands, required flags, outputs, and timing defaults are explicit
- [x] 3.2 Update `references/risk-policy.md`, `references/command-routing.md`, and related references so they match the hardened runtime semantics exactly
- [x] 3.3 Remove any remaining wording that suggests planning commands perform execution directly or that leaves campaign/public-send routing implicit

## 4. Verification

- [x] 4.1 Smoke-check candidate reservation, release/recovery, and campaign-bound sending flows against the new runtime semantics
- [x] 4.2 Verify long-running campaign status output reports block reasons, `notBefore`, budgets, and inbox-preemption consistently
- [x] 4.3 Re-run documentation and command-surface checks to confirm the skill can be operated without legacy assumptions or hidden workflow guessing
