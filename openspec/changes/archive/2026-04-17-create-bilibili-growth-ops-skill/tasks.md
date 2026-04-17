## 1. Contracts and skill scaffold

- [x] 1.1 Add `docs/api/` contracts for the new `bilibili-growth-ops` command surface and runtime entrypoints
- [x] 1.2 Add `docs/sql/` contracts for the SQLite fact store, including `Account`, `Product`, Bilibili entities, and `OperationRecord`
- [x] 1.3 Scaffold the new package under `skills/bilibili-growth-ops/` with package metadata, `SKILL.md`, and top-level folder structure
- [x] 1.4 Scaffold the main-skill routing documents for onboarding, product work, strategy/task work, and record inspection

## 2. Runtime workspace and product library

- [x] 2.1 Implement runtime-root resolution with the default path `~/.tml/skills/bilibili-growth-ops` and supported overrides
- [x] 2.2 Implement runtime bootstrap, environment checks, and repair/doctor flow
- [x] 2.3 Implement product workspace generation with `PRODUCT.md`, assets storage, and task container directories
- [x] 2.4 Implement initial product ingestion and product-knowledge extraction flow for arbitrary product materials

## 3. Fact store and Bilibili command layer

- [x] 3.1 Implement the SQLite fact store and data access layer for the defined domain entities
- [x] 3.2 Implement single-account login/session persistence using local restricted runtime files
- [x] 3.3 Implement the Bilibili adapter layer for the required auth, account, video, comment, notification, and DM abilities
- [x] 3.4 Implement the atomic command layer with structured results, risk hints, and next-step guidance
- [x] 3.5 Implement `OperationRecord` write/query flows for real outbound actions and deduplication checks

## 4. Capability, strategy, and task orchestration

- [x] 4.1 Implement the `Capability` workspace structure, templates, and command-binding model
- [x] 4.2 Implement the `Strategy` workspace structure and one built-in baseline strategy
- [x] 4.3 Implement `TaskSpec` generation from `Product + Strategy`
- [x] 4.4 Implement task workspace generation with `TASK.md`, `WORKLOG.md`, and stage output storage

## 5. Main/sub-agent execution loop

- [x] 5.1 Implement the main-agent planning flow and delegated task-segment model for subagents
- [x] 5.2 Implement stage-level review-first execution and first-round approval handling
- [x] 5.3 Implement explicit writeback boundaries between subagent action results and main-agent task state updates
- [x] 5.4 Implement pause, resume, and recovery flow using task files plus recorded facts

## 6. Verification and governed alignment

- [x] 6.1 Verify implementation alignment with the new `docs/api/` and `docs/sql/` contracts
- [x] 6.2 Add tests for runtime bootstrap, fact-store persistence, task generation, and delegated execution recovery
- [x] 6.3 Run end-to-end smoke checks for the single-account baseline strategy path: comment outreach, reply follow-up, and high-intent DM escalation
- [x] 6.4 Review the new skill against `docs/spec/` and `docs/governance/` requirements before marking the change apply-ready
