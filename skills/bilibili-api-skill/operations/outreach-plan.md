# Outreach Plan 模块

## 作用

负责基于候选池执行公开触达、评论区停留和引导私信的节奏化动作。

这个模块的关键点是：

- `campaign run` 不直接发任何公开动作
- `campaign next` 是权威调度入口
- 真正的公开发送入口是 `thread send --channel comment --campaign ...`

## 进入本模块前必须满足

- 已完成登录和环境初始化
- 已有可用产品资料
- 已经建立候选池
- 最好已经建立 `watch` 基线

## 本模块负责的事情

- 选择或预留当前要处理的视频
- 维护当前聚焦视频与视频停留节奏
- 根据视频质量控制单视频内动作预算
- 先公开互动，再按意向决定是否升级到私信
- 在出现 inbox 信号时让 campaign 主动让路

## 默认时间与风控窗口

- 候选视频切换节奏：`120s`
- inbox 检查节奏：`180s`
- 同视频公开动作最小间隔：`20s`
- 跨视频切换最小缓冲：`60s`
- 跨视频切换建议上限：`120s`
- 单视频停留上限：
  - `low`: `2-4` 分钟
  - `medium`: `5-10` 分钟
  - `high`: `10-25` 分钟

## 推荐命令

```bash
node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme candidate-pool-v1
node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme candidate-pool-v1
node scripts/bili.js campaign status --id "<campaign_id>"
node scripts/bili.js campaign next --id "<campaign_id>"
node scripts/bili.js candidate next --product "<slug>" --campaign "<campaign_id>"
node scripts/bili.js campaign focus --id "<campaign_id>" --video "<BV>" --video-quality medium
node scripts/bili.js thread discover-comments --id "<BV>" --product "<slug>" --limit 15
node scripts/bili.js inbox unread --product "<slug>"
node scripts/bili.js thread send --channel comment --campaign "<campaign_id>" --id "<BV>" --content "<text>" --yes
node scripts/bili.js campaign inbox-check --id "<campaign_id>"
```

## 命令说明

### `campaign plan`

作用：先看预算、节奏、单小时动作上限和推荐动作顺序。

输出里重点看：

- `budgets.perHour`
- `budgets.total`
- `pacing`
- `executionModel`
- `recommendedSequence`

### `campaign run`

作用：创建一个可跟踪的 campaign 实例，让后续公开视频动作和 inbox 检查都挂到同一个 campaign 上。

不要误解：

- 它不会直接发评论
- 它不会自动切视频
- 它只是创建运行态和预算上下文

### `campaign status`

作用：看当前 campaign 已做了哪些动作、预算还剩多少、当前是否被 block、下一步该做什么。

输出里重点看：

- `statusSummary.blockedReasons`
- `statusSummary.nextAction`
- `statusSummary.nextActionReason`
- `statusSummary.nextActionNotBefore`
- `budget.currentHour`
- `focus`
- `inboxPressure`

### `campaign next`

作用：给当前 campaign 返回“现在最应该做的一步”。

它会在这些方向里做权威判断：

- `candidate-next`
- `focus-video`
- `inbox`
- `cooldown`
- `review`

如果结果里有 `notBefore`，表示在这个时间之前不应该继续对应动作。

### `candidate next`

作用：从候选池里预留下一条视频给当前 campaign。

注意：

- 现在是 `reserved`，不是立即 `consumed`
- 同一个 campaign 如果已经预留了视频，会优先返回当前预留项
- 如果当前还有聚焦视频没处理完，campaign 规则会阻止你继续切新视频

### `campaign focus`

作用：手动指定当前聚焦视频，适合人工判断某个视频质量较高时延长停留。

常用参数：

- `--id "<campaign_id>"`
- `--video "<BV>"`
- `--video-quality low|medium|high`
- `--reason "<why stay>"`

### `thread send --channel comment`

作用：这是本模块里真正执行公开发送的命令。

最常见的两种形式：

```bash
node scripts/bili.js thread send --channel comment --campaign "<campaign_id>" --id "<BV>" --content "<主评论>" --yes
node scripts/bili.js thread send --channel comment --campaign "<campaign_id>" --id "<BV>" --root <rpid> --content "<回复>" --yes
```

发送前会自动检查：

- campaign 总预算
- campaign 当前小时预算
- inbox 是否应优先处理
- 当前视频是否已超停留上限
- 同视频 20 秒最小间隔
- 跨视频切换缓冲

发送成功后重点看：

- `postActionGuidance.pauseSec`
- `postActionGuidance.resumeAfter`
- `postActionGuidance.prompt`

默认值：

- 发视频主评论后建议暂停 `90s`
- 发评论回复后建议暂停 `20s`

### `thread discover-comments`

作用：主动读取某个视频的评论区，把更像“有需求信号”的评论筛出来，给 agent 二次判断。

适合的场景：

- 某个视频评论区质量高，准备多停留一会
- 不想只发视频主评论，想主动回复别人已有评论
- 评论区里常出现“666”“球”“求”“蹲”“接口”“怎么搞”“收费”这类暗号或需求词

命令示例：

```bash
node scripts/bili.js thread discover-comments --id "<BV>" --product "<slug>" --limit 15
```

输出说明：

- `items[*].signal.level`
  评论区信号强度，分成 `low|medium|high`
- `items[*].signal.reasons`
  为什么这条评论被判成可能有意向
- `items[*].commands`
  对应的 `thread draft` / `thread send` 命令骨架

注意：

- 这是启发式筛选，不是最终判断
- 暗号类评论要交给 agent 结合视频语境再判断，不要机械地全部回复
- 默认优先回复 `high` 和 `medium` 信号评论

如果团队想改这组值，不要改提示词，也不要改代码常量，统一改 settings。

### `campaign inbox-check`

作用：在 campaign 视角下标记一次“我已经回来看过 inbox”，帮助执行从公开触达切回跟进。

通常和下面这个顺序配合：

```bash
node scripts/bili.js inbox unread --product "<slug>"
node scripts/bili.js inbox list --product "<slug>" --campaign "<campaign_id>"
node scripts/bili.js campaign inbox-check --id "<campaign_id>"
```

### `system set-post-action-pauses`

作用：修改发送成功后的默认暂停提示，不改运行主逻辑，只改 agent 在 JSON 返回里看到的建议暂停时间。

```bash
node scripts/bili.js system set-post-action-pauses --video-comment-sec 90 --comment-reply-sec 20 --dm-sec 20
```

这组值的默认含义：

- `--video-comment-sec`
  发视频主评论后，建议暂停多久再继续下一条动作
- `--comment-reply-sec`
  发评论回复后，建议暂停多久再继续下一条动作
- `--dm-sec`
  发私信后，建议暂停多久再继续下一条动作

## 推荐执行顺序

1. `campaign plan`
2. `campaign run`
3. `campaign next`
4. 如果 `campaign next` 指向 `candidate-next`，执行 `candidate next --campaign ...`
5. 如果 `campaign next` 指向 `focus-video`，优先围绕当前视频做公开动作
6. 如果当前视频评论区质量高，先用 `thread discover-comments --id "<BV>" --product "<slug>"` 读评论区，再挑有信号的评论回复
7. 公开发送一律走 `thread send --channel comment --campaign ...`
8. 一旦 `campaign next` 或 `campaign status` 指向 `inbox`，先执行 `inbox unread`，再立刻切回 `inbox-follow-up`

## 高层规则

- 默认从候选池拿视频，不在正常执行环节重复搜
- 公开视频动作优先走 campaign 预算和节奏
- 高质量视频默认不是“发完一条主评论就走”，而是允许继续读评论区并回复信号评论
- 中意向默认只评论回复
- 高意向或已存在 DM 上下文时，才允许升级私信
- 一旦进入等待回复阶段或有 unread 信号，优先切回 `inbox-follow-up`

## 当前模块内怎么做人工研判

默认这样做：

1. 先看 `campaign status --id "<campaign_id>"`，确认 budget、focus、`blockedReasons` 和 `nextActionNotBefore`
2. 再看 `campaign next --id "<campaign_id>"`，确认当前最优动作是继续当前视频、切新视频，还是先 inbox
3. 如果要继续公开视频动作，再看 `candidate get --id "<pool_id>"` 或当前 focus 的评分 / 来源关键词
4. 真正发送时统一走 `thread send --channel comment --campaign ...`

## 不要这样用

- 不要把 `campaign run` 当成自动执行器
- 不要跳过 `campaign next`，自己猜现在该继续公开视频还是该回 inbox
- 不要在没有 `--campaign` 的情况下把公开视频动作混进 campaign 执行
- 不要在 medium intent 线索上直接升级私信
