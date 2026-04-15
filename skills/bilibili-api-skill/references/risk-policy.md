# Risk Policy

## 低风险动作

- 查看 doctor / status / summary
- 查看产品资料
- 查看候选池
- 查看 inbox / thread 上下文

## 中风险动作

- 批量采集候选视频
- 在候选池上做状态流转
- 评论区继续回复已有上下文

## 高风险动作

- 没有上下文的主动私信
- 高频 live search
- 绕过 `campaign next`
- 绕过 `thread draft` / `thread send`
- 公开区直接发群号、二维码、外链

## 默认处置

- 高风险动作默认要回到对应模块重新确认
- 私信没有上下文时，优先补上下文而不是直接发送
- search 命中风控时，先退避，再考虑刷新或缩减采集
- campaign 绑定的公开动作如果命中 budget / cooldown / inbox-preemption block，先按 `campaign status` / `campaign next` 指示等待或切回 inbox

## 默认时间护栏

- 候选池页间等待：`5-10s`
- 候选池词间等待：`8-15s`
- campaign 候选切换：`120s`
- campaign inbox 检查：`180s`
- 同视频公开动作最小间隔：`20s`
- 跨视频切换缓冲：`60-120s`
- 候选预留过期：`30` 分钟
- 发视频主评论后的建议暂停：`90s`
- 发评论回复后的建议暂停：`20s`
- 发私信后的建议暂停：`20s`

这 3 个值不应该写死在 prompt 里。统一由 settings 控制，并通过发送成功后的 `postActionGuidance` 返回给 agent。

## 意向升级护栏

- `medium intent`：默认只公开回复，不升级私信
- `high intent`：允许公开回复后继续私信
- 已存在 DM 上下文：允许继续私信
- 无上下文冷启动 DM：高风险，默认拦截

## 风险与模块关系

| 动作 | 默认模块 | 说明 |
| --- | --- | --- |
| 查看系统状态 | `overview / init` | 风险最低 |
| 建产品资料 | `product` | 中低风险 |
| 建候选池 | `video-candidate-pool` | 中风险，受搜索风控影响 |
| 公开触达 | `outreach-plan` | 中高风险，必须受 budget、cadence、dwell、inbox-preemption 控制 |
| 跟进私信 | `inbox-follow-up` | 中高风险，必须先有上下文 |
| 绕开 `thread` 主链路 | `thread` | 高风险，默认不建议 |
