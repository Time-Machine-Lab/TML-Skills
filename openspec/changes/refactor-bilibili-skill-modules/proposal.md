## Why

`bilibili-api-skill` 目前虽然已经积累了较多底层脚本能力，但对外仍主要表现为一个大而平的主 skill，导致用户入口混乱、agent 需要自行猜测流程、渐进式披露失效。随着团队希望把它升级成可长期维护的 B 站引流工作流，需要把技能结构、候选视频采集、引流执行和私信跟进显式模块化，并把高风险动作纳入稳定的策略层。

## What Changes

- Rework `bilibili-api-skill` into a main routing skill plus explicit submodules/references for overview, initialization, product setup, candidate-video collection, outreach planning, and inbox follow-up.
- Introduce a dedicated candidate-video pool workflow that uses `scripts/bilibili-mcp-lite.mjs` for batch collection by keyword, applies built-in pacing between requests, and persists a reusable BVID pool instead of searching continuously during campaign execution.
- Define keyword-local scoring for candidate videos within the most recent 90 days so cold keywords are judged relative to their own result set instead of against global absolute thresholds.
- Split “public outreach plan” from “private-message/comment follow-up” so campaign execution creates leads while inbox tracking consumes unread private messages and unread comment replies through a separate loop.
- Tighten product-driven execution rules so reply strategy, lead grading, risk policy, and module boundaries are explicit rather than inferred ad hoc by the agent.

## Capabilities

### New Capabilities
- `skill-module-architecture`: Define the modular architecture, responsibilities, and disclosure flow for the Bilibili skill bundle, including main-skill routing and submodule boundaries.
- `video-candidate-pool`: Define how product keywords are expanded into batch video collection, paced search requests, keyword-local scoring, pool persistence, and controlled BVID consumption.
- `outreach-followup-modules`: Define the contract between outreach-plan execution and inbox/private-message follow-up, including unread-driven polling, intent grading entry points, and risk-aware escalation paths.

### Modified Capabilities

- None.

## Impact

- Affected skill package: `skills/bilibili-api-skill/`
- Affected entry and module docs: `SKILL.md`, new sub-skills/references, and supporting documentation
- Affected collection script: `scripts/bilibili-mcp-lite.mjs`
- Affected orchestration/runtime areas: campaign planning, discovery, watch/inbox/thread guidance, and candidate-pool persistence under runtime state
- No project-level `docs/api` or `docs/sql` contract changes are expected for this refactor
