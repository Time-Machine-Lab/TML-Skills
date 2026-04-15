# Inbox Follow-up 模块

## 作用

负责消费“已经产生的线索”，优先处理未读私信和未读评论回复，而不是继续扩张新的公开触达面。

## 本模块负责的事情

- 用 unread 指标判断是否需要深入拉消息
- 继续已有 DM 会话或评论区线程
- 基于上下文生成草稿
- 按 medium / high intent 分层处理

## 推荐命令

```bash
node scripts/bili.js watch prime
node scripts/bili.js watch run --interval-sec 180 --iterations 0
node scripts/bili.js watch state
node scripts/bili.js inbox unread --product "<slug>"
node scripts/bili.js inbox replies --product "<slug>"
node scripts/bili.js inbox dm-sessions --product "<slug>"
node scripts/bili.js inbox list --product "<slug>"
node scripts/bili.js thread continue --mid <mid> --product "<slug>"
node scripts/bili.js thread draft --mid <mid> --product "<slug>"
node scripts/bili.js thread send --channel dm --mid <mid> --product "<slug>" --content "<text>" --yes
```

## 命令说明

### `watch prime`

作用：建立增量基线，避免把历史消息误判成新消息。

### `watch run`

作用：持续轮询未读私信和评论回复。

常用参数：

- `--interval-sec 180`
- `--iterations 0`

其中 `--iterations 0` 表示持续运行。

### `watch state`

作用：查看最近轮询状态、错误退避、热度分层和近期事件。

输出里重点看：

- `summary.unreadDmThreads`
- `summary.unreadDmMessages`
- `summary.repliesCheckpoint`
- `scheduler.top`
- `recentEvents`

这个命令偏“本地 watcher 运行态”，不是实时未读权威摘要。要看当前实时未读，优先用 `inbox unread`。

### `inbox unread`

作用：用一个显式命令查看“现在到底有没有未读私信 / 评论回复 / 其他消息”，适合作为 follow-up 模块的第一步。

输出里重点看：

- `unread.total`
- `unread.reply`
- `unread.recvReply`
- `summary.unreadDmThreads`
- `summary.unreadDmMessages`
- `topReplyNotifications`
- `topUnreadDmSessions`

如果这里已经给出了 `topReplyNotifications[*].commands` 或 `topUnreadDmSessions[*].commands`，优先直接执行返回的命令骨架，不要自己拼参数。

### `inbox replies`

作用：显式列出评论回复通知，并直接给出评论区草稿 / 发送命令骨架。

输出里重点看：

- `items[*].summary`
- `items[*].commentTarget`
- `items[*].commands`

其中：

- `commentTarget.id` / `commentTarget.oid` 用来定位视频
- `commentTarget.root` 用来定位评论线程
- `commands` 已经给出 `thread draft --id/--oid --root ...` 和 `thread send --channel comment ...`

### `inbox dm-sessions`

作用：显式列出私信会话，并直接给出 thread 级后续命令骨架。

输出里重点看：

- `items[*].mid`
- `items[*].unreadCount`
- `items[*].lastMessage`
- `items[*].commands`

### `inbox list`

作用：根据未读数、最近互动和推荐渠道，列出优先处理的会话。

输出里重点看：

- `overview.unread`
- `overview.replyNotificationCount`
- `overview.dmSessionCount`
- `overview.unreadDmThreads`
- `actionCards[*].commands`

### `thread continue`

作用：把某个用户的上下文、历史消息、推荐渠道和产品资料拼起来。

输出里重点看：

- `recommendedChannel`
- `conversationSummary`
- `dmSession`
- `replyNotifications`
- `suggestedCommands`

如果 `recommendedChannel = comment`，优先看 `replyNotifications[*].commands` 或先回 `inbox replies`，不要自己猜 `--id` / `--root`。

### `thread draft`

作用：根据 thread 上下文生成候选回复草稿。

### `thread send`

作用：统一发送回复，优先通过这个入口完成所有发送动作。

发送成功后重点看：

- `postActionGuidance.pauseSec`
- `postActionGuidance.resumeAfter`
- `postActionGuidance.prompt`
- `nextSteps`

不要忽略这个返回字段。它就是给 agent 的后续节奏提示，用来降低连续动作触发风控的概率。

## 推荐执行顺序

1. `watch prime`
2. `watch run`
3. `watch state`
4. `inbox unread`
5. `inbox replies` / `inbox dm-sessions`
6. `inbox list`
7. `thread continue`
8. `thread draft`
9. `thread send`

## 关键规则

- 先看 `inbox unread`，再决定是否拉详情，不轮询所有人
- follow-up 是独立循环，不负责候选采集
- 如果只是普通意向，不默认升级私信
- 私信继续聊时仍要遵守产品上下文和风险策略
- 命中等待回复状态时，不要强行继续发
- 评论回复优先使用 `inbox replies` 返回的命令骨架，不要自己拼 `--id` / `--oid` / `--root`
- 长时间运行时，只保留一个 `watch run` 实例

## 最小闭环

- 看未读变化：`watch state`
- 持续轮询未读：`watch run --interval-sec 180 --iterations 0`
- 看实时未读摘要：`inbox unread --product "<slug>"`
- 看评论回复入口：`inbox replies --product "<slug>"`
- 看私信未读入口：`inbox dm-sessions --product "<slug>"`
- 看当前最该处理的线索：`inbox list --product "<slug>"`
- 拉某个用户完整上下文：`thread continue --mid <mid> --product "<slug>"`

## 长跑巡检建议

如果任务要连续跑数小时，默认巡检顺序固定为：

1. `watch state`
2. `inbox unread --product "<slug>"`
3. `campaign status --id "<campaign_id>"`
4. `inbox list --product "<slug>" --campaign "<campaign_id>"`
5. `trace recent --limit 20`

这样做的目的：

- `watch state` 看 watcher 自身有没有卡死、退避、锁冲突
- `inbox unread` 看实时未读是否开始堆积
- `campaign status` 看公开动作是否应该让路
- `inbox list` 看下一条具体该处理谁
- `trace recent` 复盘最近动作有没有偏离预期
