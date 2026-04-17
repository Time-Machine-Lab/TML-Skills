# 命令总览

## 适用场景

- 不清楚当前有哪些命令可用
- 看到了命令名，但不清楚它到底是干什么的
- 主 Agent 或副 Agent 拿到一组命令后，需要快速消除歧义
- 用户用自然语言提出新规则，Agent 需要先确认应该调用哪条精确命令

## 默认入口

```bash
node scripts/ops.js command list
node scripts/ops.js command list --group task
node scripts/ops.js command explain --ids "video.search,comment.send,task.plan-next"
```

## 核心理解

- 命令说明已经集中收敛到 `assets/catalog/commands.json`
- `command list` 适合先看命令总览
- `command explain` 适合批量查看命令作用、必填参数和关键提醒
- `command explain` 支持混合输入
  - `task.plan-next`
  - `task.plan_next`
  - `task plan-next`

## 使用建议

- 如果先想看某一类命令，先用 `command list --group <group>`
- 如果已经拿到一组命令名，直接用 `command explain --ids "..."`
- 如果是外发前的命令，重点看它是否会写入关键动作记录 `OperationRecord`，以及有哪些风险提醒
- 如果是节流相关需求，优先查看 `records.cooldown-policy-get`、`records.cooldown-policy-set`、`records.cooldown-check`
