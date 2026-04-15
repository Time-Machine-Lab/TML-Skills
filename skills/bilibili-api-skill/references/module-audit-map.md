# Bilibili Skill 审计映射

## 现有运行时能力 -> 目标模块

### overview

- `scripts/lib/doctor.js`
- `scripts/bili.js` 顶层帮助与资源分发

### init

- `scripts/lib/init.js`
- `scripts/lib/auth.js`
- `scripts/lib/config.js`
- `scripts/lib/doctor.js`

### product

- `scripts/lib/products.js`

### video-candidate-pool

- `scripts/bilibili-mcp-lite.mjs`
- 新增：`scripts/lib/video-pools.js`

### outreach-plan

- `scripts/lib/campaigns.js`
- `scripts/lib/engagement.js`

### inbox-follow-up

- `scripts/lib/watch.js`
- `scripts/lib/orchestrator.js`
- `scripts/lib/comment-threads.js`
- `scripts/lib/scheduler.js`
- `scripts/lib/tracker.js`
- `scripts/lib/engagement.js`

## 现阶段问题

- 对外只有一个大 Skill，模块边界没有显式暴露
- live search 仍然容易被误当成主流程
- 引流执行与私信跟进没有被表达成两个循环
- 风控、意向分级和候选池评分大多埋在代码或 prompt 里，不够显式
