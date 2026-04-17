# 记录与审核

## 适用场景

- 查看评论、回复、私信等关键动作历史
- 做去重判断
- 做发送前节流判断
- 审核新阶段首轮外发
- 任务中断后恢复

## 默认入口

```bash
node scripts/ops.js records list --operationType video_comment
node scripts/ops.js records cooldown-policy-get
node scripts/ops.js records cooldown-policy-set --operationType direct_message --cooldownSeconds 180 --windowMinutes 60 --maxInWindow 20
node scripts/ops.js records cooldown-check --operationType video_comment
node scripts/ops.js records dedupe-check --operationType direct_message --targetType user --targetUserMid "<mid>"
node scripts/ops.js task review-start --taskId "<task-id>" --stageId "<stage-id>"
node scripts/ops.js task recover --taskId "<task-id>"
node scripts/ops.js task pause --taskId "<task-id>" --reason "<原因>"
node scripts/ops.js task resume --taskId "<task-id>" --reason "<原因>"
```

## 关键原则

- 普通读取事件不进关键动作记录 `OperationRecord`
- 只有评论、评论回复、私信这类重量级真实外发动作才进 `OperationRecord`
- 每条真实外发动作都要附一段简短说明，说明发送依据、目的或意义；最好控制在 100 字内
- 去重判断优先看关键动作记录 `OperationRecord`
- 节流判断也优先看关键动作记录 `OperationRecord`
- 节流检查至少要回答两件事：距离上一次发送过去了多久、当前窗口内是否已经发得过密
- 节流规则只在一个地方管理：用 `records cooldown-policy-get / set / reset` 维护中心规则
- 真实外发前，统一以 `records cooldown-check` 的返回为准
- 如果用户用自然语言提出节流要求，Agent 应先翻译成精确的 `records cooldown-policy-set` 更新，再继续执行外发
- 任务主控状态以任务文件为准
- 恢复时同时参考任务文件和事实层
