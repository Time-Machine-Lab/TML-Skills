## Why

现有的 `bilibili-api-skill` 已经不适合作为二期基础。二期的目标不再是整理一组 B 站接口，而是建立一套新的、可长期运行的 B 站增长运营系统，包括产品库、策略、任务文档、事实层、原子指令层，以及主副 `Agent` 协作闭环。现在需要把这套新系统正式定义出来，并用一个新的 skill 承载，而不是继续在旧 skill 上叠加。

## What Changes

- Create a brand-new skill package named `bilibili-growth-ops` instead of extending `bilibili-api-skill`.
- Define a new main-skill entry, runtime workspace, and initialization/bootstrap flow that work across different agent environments instead of binding to OpenClaw-specific paths.
- Introduce a new product knowledge library that can ingest arbitrary product materials, normalize them into the product library, and expose promotable points for downstream strategy execution.
- Introduce a new SQLite-backed fact store for account state, Bilibili entities, and `OperationRecord`, replacing log-driven state tracking.
- Introduce a new Bilibili adapter and atomic command layer that reuses only limited low-level request knowledge from the old skill, not its architecture or command surface.
- Introduce one centralized outbound throttle policy surface so agents can inspect and update send pacing precisely while users continue to express those adjustments in natural language.
- Introduce a new `Capability` / `Strategy` / `TaskSpec` orchestration model, with file-based task documents and stage-oriented execution.
- Introduce a main/sub-agent collaboration loop where the main `Agent` plans and dispatches, while subagents take ownership of a capability or task segment and return results.
- Default the first release to single-account execution, one built-in baseline strategy, stage-level review-first execution, and high-intent DM escalation only.

## Capabilities

### New Capabilities
- `skill-entry-and-runtime-bootstrap`: Defines the new `bilibili-growth-ops` skill identity, main entry, cross-agent bootstrap flow, runtime-root conventions, and environment checks.
- `product-knowledge-library`: Defines how product information, assets, and initial extraction notes are stored so agents can derive promotable points from arbitrary product materials.
- `bilibili-command-and-fact-store`: Defines the Bilibili adapter layer, atomic command surface, SQLite-backed domain store, and `OperationRecord` write/query behavior.
- `strategy-task-orchestration`: Defines `Capability`, `Strategy`, and `TaskSpec`, including file-based task control, stage outputs, and baseline strategy composition.
- `main-sub-agent-execution`: Defines the collaboration model between the main `Agent` and subagents, including task delegation, stage review, writeback boundaries, and recovery flow.

### Modified Capabilities
- None.

## Impact

- Affected skill surface: new package under `skills/bilibili-growth-ops/`
- Affected design source: phase-2 documents currently stored under `skills/bilibili-api-skill/iterate/phase2/`
- Affected runtime model: new `runtime-root`, new task file layout, new product library, new fact store, new command layer, and new execution loop
- Existing `skills/bilibili-api-skill/` is no longer treated as the engineering base; only limited low-level Bilibili request behavior may be referenced
- Implementation should add explicit contract docs under `docs/api/` and `docs/sql/` for the new command surface and SQLite storage before business-code tasks begin
