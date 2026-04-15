---
name: bilibili-api-skill
description: 用于 B 站(Bilibili)账号初始化、产品建档、候选视频池构建、公开引流计划与私信/评论跟进的模块化技能包。当用户要登录 B 站、建立推广产品、构建 BVID 候选池、执行引流计划、查看评论/私信或跟进会话时，优先使用这个技能，并优先走高层模块与内置 Node 脚本而不是临时猜测流程。
---

# Bilibili 模块化技能包

## 1. 使用方式

先判断用户当前处于哪个阶段，再进入对应模块。不要一上来直接拼底层接口，也不要把 live search 当主循环。

这个 skill 的默认目标只有一条主链路：

`init -> product -> video-candidate-pool -> outreach-plan -> inbox-follow-up`

如果 agent 不确定现在该用哪个命令，优先回到模块文档，不要自行猜测未记录的入口。

模块地图：

- 概览：`operations/overview.md`
- 初始化：`operations/init.md`
- 产品建档：`operations/product.md`
- 视频候选池：`operations/video-candidate-pool.md`
- 引流计划：`operations/outreach-plan.md`
- 跟进回复：`operations/inbox-follow-up.md`

策略参考：

- 审计映射：`references/module-audit-map.md`
- 命令路由：`references/command-routing.md`
- 意向分级：`references/intent-grading.md`
- 风险策略：`references/risk-policy.md`
- 候选池评分：`references/candidate-scoring.md`

## 2. 默认阶段顺序

1. `init`
2. `product`
3. `video-candidate-pool`
4. `outreach-plan`
5. `inbox-follow-up`

如果用户目标只是巡检，则优先：

- `system doctor`
- `system workflow --goal stable`
- `watch state`
- `campaign status`
- `trace recent`

## 3. 首次安装与初始化

首次拿到这个 skill 后，先在 skill 根目录执行：

```bash
npm install
```

然后按初始化模块执行：

```bash
node scripts/bili.js init start --runtime-root </绝对路径> --reset true
node scripts/bili.js auth qr-generate
node scripts/bili.js auth qr-poll
node scripts/bili.js system doctor
```

## 4. 关键路由规则

- 新账号 / 新运行目录 / 登录缺失：进入 `init`
- 需要建立推广对象、补卖点或联系方式：进入 `product`
- 需要先准备可控的 BVID 列表：进入 `video-candidate-pool`
- 已有候选池，准备公开触达：进入 `outreach-plan`
- 有未读私信或评论回复，要继续聊：进入 `inbox-follow-up`

如果只是要看“现在离可执行还有多远”，优先：

```bash
node scripts/bili.js system doctor
node scripts/bili.js product doctor --slug "<slug>"
node scripts/bili.js candidate list --product "<slug>"
node scripts/bili.js watch state
```

## 5. 高层主链路

默认按这条链路驱动 agent：

1. `node scripts/bili.js init start ...`
2. `node scripts/bili.js auth qr-generate`
3. `node scripts/bili.js auth qr-poll`
4. `node scripts/bili.js product setup ...`
5. `node scripts/bili.js candidate collect --product "<slug>" --target-count 30`
6. `node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme candidate-pool-v1`
7. `node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme candidate-pool-v1`
8. `node scripts/bili.js campaign next --id "<campaign_id>"`
9. `node scripts/bili.js candidate next --product "<slug>" --campaign "<campaign_id>"`
10. `node scripts/bili.js thread draft --id "<BV>" --product "<slug>" --channel comment --objective "video-root-comment"`
11. `node scripts/bili.js thread send --channel comment --campaign "<campaign_id>" --id "<BV>" --product "<slug>" --content "<text>" --yes`
12. `node scripts/bili.js inbox unread --product "<slug>"`
13. `node scripts/bili.js inbox list --product "<slug>" --campaign "<campaign_id>"`
14. `node scripts/bili.js thread continue --mid <mid> --product "<slug>"`
15. `node scripts/bili.js thread draft --mid <mid> --product "<slug>"`
16. `node scripts/bili.js thread send --channel dm --mid <mid> --product "<slug>" --campaign "<campaign_id>" --content "<text>" --yes`

说明：

- `campaign run` 只负责创建 campaign 实例和预算快照，不直接发评论。
- `campaign next` 是当前 campaign 的权威调度入口，用来判断现在应该继续当前视频、切下一个候选视频，还是先切回 inbox；它返回的 `nextSteps` 里已经包含当前应执行的草稿 / 发送骨架。
- `candidate next` 现在是“预留候选视频”，不是立即 `consumed`。
- 真正的公开发送入口是 `thread send --channel comment --campaign ...`。
- `thread draft --id "<BV>" --product "<slug>" --channel comment --objective "video-root-comment"` 用来给视频主评论直接出草稿，不需要自己再拼 `inbound-text`。

## 6. Agent 规则

- 优先高层命令：`system`、`product`、`candidate`、`campaign`、`inbox`、`thread`
- 默认优先用 `campaign next` 判断下一步，再决定是否调用 `candidate next` / `thread send`
- live search 不是日常执行主动作；优先先建候选池，再消费候选池
- follow-up 是独立循环，优先看 unread，再决定是否拉详情
- follow-up 第一优先命令是 `inbox unread`，不是让 agent 自己从 `watch state` 或 `inbox list` 里猜未读
- 命中 `403`、`352`、`412`、冷却、budget block 时先退避
- 公开区回复要短、像真人、带钩子，不要直接发群号/二维码
- 中意向默认只评论回复；高意向或已存在 DM 上下文时，才允许 campaign 内升级私信
- 不要手写 `sleep && thread send && sleep && thread send` 这类链式命令；每一步都回到 `campaign next`、`inbox list`、`thread continue` 或 `thread draft`
- 不要在没有 `campaign` 的情况下发送视频主评论
- 对私信和评论回复，默认先 `thread draft`，再决定是否 `thread send`
- 不要把 skill JSON 再 pipe 给 `python3 -c`、`ruby -e`、`perl -e` 做二次格式化；直接读取原始字段并用自然语言汇报
- 不要复述旧 campaign / 旧 session 的结论；每次先重新执行当前 `campaign status` / `campaign next` / `inbox unread`

## 7. 模块选择速查

| 当前问题 | 先看哪里 | 默认命令 |
| --- | --- | --- |
| 账号没登 / 运行目录没初始化 | `operations/init.md` | `init start`, `auth qr-generate`, `auth qr-poll`, `system doctor` |
| 产品资料不完整 | `operations/product.md` | `product setup`, `product doctor`, `product summarize` |
| 需要准备视频来源 | `operations/video-candidate-pool.md` | `candidate collect`, `candidate list`, `candidate get` |
| 要开始公开触达 | `operations/outreach-plan.md` | `campaign plan`, `campaign run`, `campaign next`, `candidate next`, `thread send --channel comment` |
| 已有未读线索要继续聊 | `operations/inbox-follow-up.md` | `watch run`, `inbox unread`, `inbox replies`, `inbox dm-sessions`, `inbox list`, `thread continue`, `thread draft`, `thread send` |

## 8. 常用命令

```bash
node scripts/bili.js system doctor
node scripts/bili.js product summarize --slug "<slug>"
node scripts/bili.js candidate collect --product "<slug>" --target-count 30 --min-interval-sec 5 --max-interval-sec 10 --keyword-pause-min-sec 8 --keyword-pause-max-sec 15
node scripts/bili.js candidate list --product "<slug>"
node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme candidate-pool-v1
node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme candidate-pool-v1
node scripts/bili.js campaign status --id "<campaign_id>"
node scripts/bili.js campaign next --id "<campaign_id>"
node scripts/bili.js candidate next --product "<slug>" --campaign "<campaign_id>"
node scripts/bili.js thread draft --id "<BV>" --product "<slug>" --channel comment --objective "video-root-comment"
node scripts/bili.js thread send --channel comment --campaign "<campaign_id>" --id "<BV>" --content "<text>" --yes
node scripts/bili.js inbox unread --product "<slug>"
node scripts/bili.js inbox replies --product "<slug>"
node scripts/bili.js inbox dm-sessions --product "<slug>"
node scripts/bili.js system set-post-action-pauses --video-comment-sec 90 --comment-reply-sec 20 --dm-sec 20
node scripts/bili.js inbox list --product "<slug>" --campaign "<campaign_id>"
node scripts/bili.js thread continue --mid <mid> --product "<slug>"
node scripts/bili.js thread draft --mid <mid> --product "<slug>"
node scripts/bili.js thread send --channel dm --mid <mid> --product "<slug>" --campaign "<campaign_id>" --content "<text>" --yes
```

## 9. 运行态约定

- 默认运行目录：`~/.openclaw/state/bilibili-api-skill`
- 运行态目录包含：
  - `products/`
  - `data/video-pools/`
  - `data/campaigns/`
  - `data/watch-state.json`
- 不要把真实 cookie、refresh token、日志、产品资料写回 skill 包本身

关键运行态语义：

- `candidate next` 会把候选视频标记为 `reserved`
- `reserved` 默认保留 30 分钟，过期后会自动释放回可执行状态
- campaign 绑定的评论发送成功后，预留的视频才会转成 `consumed`
- `campaign status` 与 `thread send --campaign ...` 使用同一套节奏 / 预算 / inbox-preemption 规则
- `inbox unread` 是 follow-up 的实时未读摘要入口；`watch state` 更偏 watcher 本地状态
- `inbox replies` 会直接返回评论回复的命令骨架；`inbox dm-sessions` 会直接返回私信续聊命令骨架
- 每次成功发送后，返回 JSON 里的 `postActionGuidance` 会明确告诉 agent 建议暂停多久、何时继续
- 默认暂停值来自 settings：视频评论后 `90s`、评论回复后 `20s`、私信后 `20s`
- 如果高层输出和底层命令有冲突，优先相信高层模块链路，不要为了“快一点”绕过 draft、cooldown 或 campaign

## 10. 后续迭代方式

如果要继续改这个 skill，默认继续走 OpenSpec + spec coding：

1. 先用 `openspec propose <change-name>` 或 Codex 的 `openspec-propose` 生成 proposal / design / specs / 实施清单
2. 讨论清楚模块边界、风险策略、运行态目录和验证方式
3. 再用 `openspec-apply-change` 按实施清单落实现
4. 实现后至少补一轮 `candidate`、`system doctor`、`watch`、`campaign`、`thread` 的 smoke check
