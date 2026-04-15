# Command Routing

## 作用

这份索引用来回答三个问题：

1. 这个命令属于哪个模块
2. 默认什么时候该用它
3. 什么时候不该用它

## 高层命令优先级

默认优先级从高到低：

1. `system`
2. `product`
3. `candidate`
4. `campaign`
5. `watch`
6. `inbox`
7. `thread`

新架构只保留上面这 7 组高层命令。

## 模块 -> 命令映射

| 模块 | 首选命令 | 作用 |
| --- | --- | --- |
| `init` | `init start`, `auth qr-generate`, `auth qr-poll`, `system doctor` | 初始化环境和登录态 |
| `product` | `product setup`, `product doctor`, `product summarize` | 建立产品资料和话术上下文 |
| `video-candidate-pool` | `candidate collect`, `candidate list`, `candidate get`, `candidate next`, `candidate update-status` | 建池、查池、预留候选视频、清池 |
| `outreach-plan` | `campaign plan`, `campaign run`, `campaign status`, `campaign next`, `campaign focus`, `thread send --channel comment --campaign ...` | 执行公开触达 |
| `inbox-follow-up` | `watch run`, `watch state`, `inbox unread`, `inbox replies`, `inbox dm-sessions`, `inbox list`, `thread continue`, `thread draft`, `thread send` | 跟进未读和已产生线索 |

## 常见任务 -> 默认命令

| 任务 | 默认命令 |
| --- | --- |
| 看现在缺什么 | `system doctor` |
| 看推广路径怎么走 | `system workflow --goal stable` |
| 建产品 | `product setup` |
| 看产品是否够用 | `product doctor` |
| 建候选池 | `candidate collect` |
| 看最新候选池 | `candidate list` |
| 看候选池细节 | `candidate get` |
| 开始 campaign | `campaign plan` -> `campaign run` |
| 看当前最该做哪一步 | `campaign next` |
| 预留下一个视频 | `candidate next --campaign "<campaign_id>"` |
| 发公开主评论或回复 | `thread send --channel comment --campaign "<campaign_id>" ...` |
| 看实时未读摘要 | `inbox unread` |
| 看评论回复入口 | `inbox replies` |
| 看私信会话入口 | `inbox dm-sessions` |
| 看未读和线程优先级 | `inbox list` |
| 继续聊某个用户 | `thread continue` |
| 生成回复 | `thread draft` |
| 统一发送 | `thread send` |

## 关键路由规则

- `campaign run` 只创建运行态，不直接发送
- `campaign next` 是 campaign 里的权威调度命令
- `candidate next` 在 campaign 内表示“预留视频”，不是立即执行公开动作
- `thread send --channel comment --campaign ...` 才是真正的公开视频发送入口
- `thread send --channel dm --campaign ...` 只有高意向或已存在 DM 上下文时才适合用
- `inbox unread` 是 follow-up 的第一入口，优先回答“现在是否需要停下公开动作去处理线索”
- `inbox replies` / `inbox dm-sessions` 是显式详情命令，优先于让 agent 自己解析混合聚合输出

## 一个最稳的默认心智

如果 agent 不确定：

1. 先 `system doctor`
2. 再判断是 `product`、`candidate`、`campaign` 还是 `inbox/thread`
3. 如果已经在 campaign 里，先 `campaign next`
4. 如果当前问题无法归类，回到模块文档重新定位
