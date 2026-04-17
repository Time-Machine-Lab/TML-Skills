# 策略与任务协作

## 适用场景

- 查看内置功能包
- 选择推广策略
- 生成任务
- 让主 Agent 规划下一阶段
- 为副 Agent 准备派工片段

## 默认入口

```bash
node scripts/ops.js capability list
node scripts/ops.js strategy list
node scripts/ops.js task create --product "<slug>" --strategy baseline-comment-reply-dm
node scripts/ops.js task status --task-id "<task-id>"
node scripts/ops.js task plan-next --task-id "<task-id>"
node scripts/ops.js task delegate-prepare --task-id "<task-id>"
node scripts/ops.js task review-start --task-id "<task-id>" --stage-id "<stage-id>"
node scripts/ops.js task review-approve --task-id "<task-id>" --stage-id "<stage-id>"
node scripts/ops.js task reconcile --task-id "<task-id>" --result-file "</绝对路径/result.json>"
```

## 核心理解

- 功能包（`Capability`）负责完成一类相对完整的工作
- 策略（`Strategy`）是推广心法模板，不是简单的功能包组合；它统一规定阶段顺序、功能包调用、指令边界和提示词导向
- 任务（`Task`）是产品与策略生成出来的持续任务容器，用来承接真实执行过程
- `Task` 不是预先写死的一套业务任务模板；具体步骤、批次、补充说明应由 Agent 结合产品信息和当前任务上下文生成
- `assets/templates/task` 里的文件只是任务运行文档的壳，用来统一 `TASK.md`、`WORKLOG.md`、派工单和审核单的样式
- 主 Agent 做规划、审核、回写
- 副 Agent 做被派发的能力包或阶段片段

## 任务与模板的边界

- `Strategy` 决定这套推广怎么打
- `Task` 决定这一次具体怎么做
- `assets/templates/task` 不负责写死任务内容，只负责生成任务运行容器里的文档骨架

可以直接这样理解：

- `Strategy` 提供打法主线和边界
- `Task` 由 Agent 基于“产品资料 + 策略模板”生成
- task 模板目录只负责把这些内容落成统一格式的任务文档

当前实现里，`Strategy` 的阶段主线会成为任务的初始骨架；但具体的执行细节、批次安排、补充文件和阶段内说明，仍然应该由 Agent 在任务目录里继续生成和维护。

## 进入下一步

- 如果需要看历史动作与回溯，转到 [records-and-review.md](records-and-review.md)
