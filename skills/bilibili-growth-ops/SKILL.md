---
name: bilibili-growth-ops
description: 用于搭建和运行 B 站增长运营系统的技能包。当用户要初始化运行环境、登录 B 站、建立产品库、生成策略任务、查询操作记录，或按“指令 / 功能包 / 策略 / 任务”分层推进 B 站引流工作时，优先使用这个技能包。
---

# B 站增长运营系统

这个技能包是一套面向 B 站场景的增长运营系统。

它的核心分层是：

- `command`：原子指令
- `capability`：由 Agent 驱动执行的功能包
- `strategy`：由功能包、指令边界和提示词导向共同组成的推广打法模板
- `task`：基于产品和策略生成的可持续任务容器；具体任务内容由 Agent 生成，不是预先写死的业务模板
- `OperationRecord`：关键动作记录，用于回溯真实外发事实

## 起步入口

先判断当前处于哪个阶段，再进入对应文档：

- 首次安装、环境初始化、扫码登录：读 [references/onboarding.md](references/onboarding.md)
- 命令一览、命令释义、批量查命令说明：读 [references/command-catalog.md](references/command-catalog.md)
- 产品建档、资料导入、素材管理：读 [references/product-workspace.md](references/product-workspace.md)
- 策略、任务、主副 agent 协作：读 [references/strategy-task-work.md](references/strategy-task-work.md)
- 历史动作、去重、验收、恢复：读 [references/records-and-review.md](references/records-and-review.md)

## 运行规则

- 默认运行目录：`~/.tml/skills/bilibili-growth-ops`
- 支持通过命令参数或环境变量覆盖 `runtime-root`
- 首版只支持单账号
- 首版只内置一套基础策略
- 默认执行模式是“先审核后执行（`review-first`）”
- 新阶段的首轮外发必须先审核
- 真实外发动作必须写入关键动作记录 `OperationRecord`

## 主要命令

统一入口：

```bash
node scripts/ops.js <group> <command> [...options]
```

高频分组：

- `command`
- `runtime`
- `product`
- `auth`
- `account`
- `video`
- `comment`
- `notification`
- `dm`
- `records`
- `capability`
- `strategy`
- `task`

## 推荐阅读顺序

1. `runtime bootstrap`
2. `command list`
3. `auth qr-start`
4. `auth qr-poll`
5. `product create` / `product ingest`
6. `strategy list`
7. `task create`
8. `task plan-next`
9. `task review-start`
10. `task reconcile`
11. `records list`

## 使用建议

- 不要把这个技能包当成“纯接口集合”
- 先选层级，再选命令
- 如果不理解某个命令，先用 `command explain` 批量查清楚再执行
- 如果用户用自然语言调整节流规则，先由 Agent 翻译成精确的 `records cooldown-policy-set`，再继续后续动作
- 能用功能包或任务解决的问题，不要退化成大量零散命令
- 外发前先做去重检查和阶段审核
- 节流规则统一由 `records cooldown-policy-get / set / reset` 管理，发送前统一看 `records cooldown-check`
- 主 Agent 负责任务主控状态
- 副 Agent 负责被派发的能力包或阶段片段
- 如果副 Agent 执行了真实动作，必须立即写入关键动作记录 `OperationRecord`
