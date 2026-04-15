# Overview 模块

## 作用

这是 `bilibili-api-skill` 的总入口。它不负责具体执行，而是负责回答两个问题：

1. 用户现在处在哪个阶段
2. 接下来应该进入哪个模块，而不是直接跳到底层脚本

## 唯一推荐主链路

1. `init`
2. `product`
3. `video-candidate-pool`
4. `outreach-plan`
5. `inbox-follow-up`

只要 agent 对当前阶段有疑问，就优先回到这条链路重新定位。

## 模块选择表

| 场景 | 进入模块 | 原因 |
| --- | --- | --- |
| 新账号、新运行目录、登录失效 | `init` | 先把运行环境和会话打通 |
| 产品资料不完整、需要补卖点/联系方式/素材 | `product` | 先把长期上下文沉淀好 |
| 需要准备可控 BVID 列表 | `video-candidate-pool` | 先建池，再执行 |
| 已有候选池，准备公开触达 | `outreach-plan` | 执行公开动作和视频停留节奏 |
| 已出现未读私信或评论回复 | `inbox-follow-up` | 处理已有线索，不继续扩发送面 |

## 巡检优先命令

```bash
node scripts/bili.js system doctor
node scripts/bili.js system workflow --goal stable
node scripts/bili.js product summarize --slug "<slug>"
node scripts/bili.js candidate list --product "<slug>"
node scripts/bili.js watch state
node scripts/bili.js inbox unread --product "<slug>"
node scripts/bili.js campaign status --id "<campaign_id>"
```

这些命令适合回答“当前能不能开跑”“缺什么”“下一步应该去哪”。

## 不要直接这样做

- 不要跳过 `thread` 模块，直接猜测发送动作
- 不要在没有产品和线程上下文时硬做触达
- 不要还没建候选池，就让 campaign 反复找视频

## 高风险边界

- 直接反复搜视频：高风险，优先先建候选池
- 绕开 `thread draft` / `thread send`：高风险
- 没有产品资料就硬推广：高风险
- 没有上下文就冷启动私信：高风险

如果你只知道“我想推广一个产品”，但不知道从哪下手，默认顺序就是：

1. `system doctor`
2. `product setup`
3. `candidate collect`
4. `campaign plan`
5. `watch run`
6. `inbox unread`
7. `inbox list`
8. `thread continue`
