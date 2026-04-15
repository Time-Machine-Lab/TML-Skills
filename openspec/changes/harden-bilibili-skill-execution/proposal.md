## Why

`bilibili-api-skill` 已经完成模块化重构，但当前运行面仍偏“建议式”，还没有把长时间执行所需的节奏、候选池状态流转、意向升级和文档命令说明收敛成可执行约束。继续放任这些关键规则停留在描述层，会让 agent 在长跑引流任务中重新回到猜测和不一致状态。

## What Changes

- Harden the outreach runtime so `campaign` becomes an authoritative execution controller rather than a loose bookkeeping layer.
- Add an explicit candidate-pool lifecycle with reservation, recovery, and restart-safe state transitions before a video is truly consumed.
- Enforce campaign-level pacing with per-hour budgets, per-video dwell limits, inbox-preemption rules, and intent-based DM escalation gates.
- Rewrite module and reference docs so the agent can see exact command entrypoints, required flags, timing defaults, and “when not to use” guidance without guessing.
- **BREAKING** Change candidate consumption semantics so `candidate next` reserves a video first instead of immediately marking it consumed.
- **BREAKING** Tighten `campaign next` / `campaign status` semantics so scheduler output and send-time guards use the same blocking rules.

## Capabilities

### New Capabilities
- `campaign-execution-guardrails`: Defines the authoritative campaign loop, pacing gates, inbox handoff, video dwell limits, and intent-based escalation rules for long-running outreach.
- `candidate-pool-lifecycle`: Defines candidate reservation, recovery, and final consumption semantics so BVID pools remain controllable across failures and restarts.
- `agent-operation-clarity`: Defines the documentation and command-surface requirements that make the skill comfortable for agents to use without implicit assumptions.

### Modified Capabilities

- None.

## Impact

- Affected runtime modules: `skills/bilibili-api-skill/scripts/lib/campaigns.js`, `skills/bilibili-api-skill/scripts/lib/video-pools.js`, `skills/bilibili-api-skill/scripts/lib/tracker.js`, `skills/bilibili-api-skill/scripts/lib/engagement.js`, `skills/bilibili-api-skill/scripts/bili.js`
- Affected operator docs: `skills/bilibili-api-skill/SKILL.md`, `skills/bilibili-api-skill/operations/*.md`, `skills/bilibili-api-skill/references/*.md`
- Affected runtime state: campaign JSON payloads, candidate-pool item state, and any status fields used to recover after interruption
- No `docs/api/*.yaml` or `docs/sql/*.sql` additions are required for this change because the scope is internal CLI/runtime orchestration rather than external service or database contracts
