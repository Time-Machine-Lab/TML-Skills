# Bilibili Growth Ops Verification

## Contract Alignment

### API Contract

- `docs/api/bilibili-growth-ops.md` is implemented by [scripts/ops.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/ops.js) and [commands.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/commands.js)
- Runtime bootstrap and doctor flow are implemented in [bootstrap.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/runtime/bootstrap.js)
- Product commands are implemented in [product.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/workflows/product.js)
- Capability / Strategy / Task commands are implemented in [catalog.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/workflows/catalog.js) and [task.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/workflows/task.js)
- Bilibili auth, video, comment, notification, and DM commands are implemented in [auth.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/bilibili/auth.js) and [client.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/bilibili/client.js)

### SQLite Contract

- `docs/sql/bilibili-growth-ops-fact-store.md` is implemented by [sqlite.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/sqlite.js) and [store.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/store.js)
- The first-release tables are present: `meta`, `accounts`, `products`, `bilibili_users`, `bilibili_videos`, `bilibili_comments`, `operation_records`
- `OperationRecord` query and dedupe flows are implemented in [store.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/store.js) and exposed in [commands.js](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops/scripts/lib/commands.js)

## Test Coverage

Executed on April 17, 2026 with Node `22.22.2`.

- `npx -y node@22 --test`
  - passed `runtime bootstrap`
  - passed `fact store persistence + dedupe`
  - passed `task generation + review-first transition`
  - passed `delegated execution pause/resume/recovery`
  - passed `baseline strategy smoke path`

- `npx -y node@22 --test test/smoke.test.js`
  - passed the single-account baseline strategy path for:
    - public comment outreach
    - reply follow-up
    - high-intent DM escalation

## Governance Review

- Reviewed against [TML-Spec-Coding-工作流规范.md](/Users/mac/Code/TML-Skills/docs/spec/TML-Spec-Coding-%E5%B7%A5%E4%BD%9C%E6%B5%81%E8%A7%84%E8%8C%83.md)
- Reviewed against [delivery-constitution.md](/Users/mac/Code/TML-Skills/docs/governance/delivery-constitution.md)
- Reviewed against [delivery-protocol.md](/Users/mac/Code/TML-Skills/docs/governance/delivery-protocol.md)
- The new skill is isolated under [skills/bilibili-growth-ops](/Users/mac/Code/TML-Skills/skills/bilibili-growth-ops)
- Runtime data is stored under a generic runtime root
- Structured facts are stored in SQLite, while task control remains file-based
- The first release stays within the agreed guardrails:
  - single account
  - one built-in baseline strategy
  - stage-level `review-first`
  - high-intent DM escalation only
