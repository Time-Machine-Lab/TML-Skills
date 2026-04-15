# Video Candidate Pool 模块

## 作用

负责把产品关键词转换成可重复消费的 BVID 候选池，而不是在推广执行阶段持续 live search。

## 本模块负责的事情

- 生成或接收关键词
- 批量调用 `scripts/bilibili-mcp-lite.mjs` 搜索视频
- 在页与页、词与词之间做节流
- 过滤 90 天内视频
- 基于“单关键词内部相对表现”评分
- 去重、合并、落盘候选池
- 接收用户手动提供的 BVID seed
- 为 campaign 预留下一条可执行视频

## 默认节流参数

`candidate collect` 如果不显式传参，默认节奏是：

- 页间等待：`5-10s`
- 关键词间等待：`8-15s`
- 页大小：`20`
- 每词页数：`2`
- 最大年龄：`90` 天

这些参数就是候选池模块的第一层风控护栏。

## 推荐命令

```bash
node scripts/bili.js candidate collect --product "<slug>" --target-count 30 --min-interval-sec 5 --max-interval-sec 10 --keyword-pause-min-sec 8 --keyword-pause-max-sec 15
node scripts/bili.js candidate list --product "<slug>"
node scripts/bili.js candidate get --id "<pool_id>"
node scripts/bili.js candidate next --product "<slug>" --campaign "<campaign_id>"
node scripts/bili.js candidate update-status --id "<pool_id>" --bvid "<BV>" --status approved
```

## 命令说明

### `candidate collect`

作用：按产品关键词或手工关键词建立新候选池。

常用参数：

- `--product "<slug>"`
  从产品资料自动导出关键词
- `--keywords "词1,词2"`
  手动指定关键词，和产品关键词可同时使用
- `--pages-per-keyword 2`
  每个关键词抓几页
- `--page-size 20`
  每页抓取条数，上限 20
- `--target-count 30`
  目标候选数
- `--max-age-days 90`
  只保留多少天内的视频
- `--min-interval-sec 5`
  同一关键词不同页之间的最小等待秒数
- `--max-interval-sec 10`
  同一关键词不同页之间的最大等待秒数
- `--keyword-pause-min-sec 8`
  不同关键词之间的最小等待秒数
- `--keyword-pause-max-sec 15`
  不同关键词之间的最大等待秒数
- `--manual-bvids "BV1...,BV2..."`
  直接注入外部 BVID seed

输出里重点看：

- `pool.id`
- `pool.topCandidates`
- `warnings`
- `byKeyword`
- `itemsPreview`

### `candidate list`

作用：查看已有候选池摘要，适合先判断“有没有池”“哪一个池最新”“目前池里有没有太多 reserved / consumed”。

输出里重点看：

- `statusCounts`
- `readyCount`
- `topCandidates`

### `candidate get`

作用：查看某个池的完整内容，包括：

- `items`
- `keywordScores`
- `sourceKeywords`
- `poolStatus`
- `reservedAt`
- `reservationExpiresAt`
- `campaignId`

### `candidate next`

作用：从候选池里取下一条可执行视频，并把它标记为 `reserved`。

注意：

- 它不再立即标记 `consumed`
- 默认适合在 `campaign` 正在执行时使用
- 如果同一个 campaign 已经预留了视频，会优先返回这条已预留项
- 预留默认保留 `30` 分钟，过期会自动释放回可执行状态

### `candidate update-status`

作用：手动调整池内某个视频状态。

可用状态：

- `new`
- `approved`
- `reserved`
- `consumed`
- `blacklisted`

## 候选池状态语义

- `new`
  新进入池，尚未人工确认，但仍可执行
- `approved`
  已确认可执行
- `reserved`
  已经被当前 campaign 预留，等待后续公开动作
- `consumed`
  已经完成成功消费
- `blacklisted`
  明确不再使用

默认执行资格：

- 可直接执行：`new`、`approved`
- 不应重复选择：`reserved`、`consumed`、`blacklisted`

## 推荐执行顺序

1. `candidate collect`
2. `candidate list`
3. `candidate get`
4. 如有必要用 `candidate update-status` 清理明显不想用的视频
5. 进入 `outreach-plan` 后再用 `candidate next --campaign ...`

## 关键规则

- 搜索不是主循环，而是建池步骤
- 评分按关键词内部做相对分析，不用全局绝对门槛压死冷门词
- 如果某个广义词下已经有足够多的高相关结果，低相关结果会被明显降权或挤出推荐序列
- 手工 BVID seed 会进入同一个池，但来源会标记为外部提供
- 公开执行阶段默认消费候选池，不再重复大规模搜索
- 候选视频必须先 `reserved`，成功公开动作后才会变成 `consumed`

## 不要这样用

- 不要每轮 campaign 都重新全量搜词
- 不要跳过 `candidate get` 就直接盲目消费陌生池
- 不要把 `candidate next` 当成“重新搜索”的替代，它只消费已有池
- 不要把 `reserved` 误解成已经执行成功
