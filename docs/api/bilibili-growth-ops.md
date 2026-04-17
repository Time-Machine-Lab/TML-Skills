# B 站增长运营系统 API 约定

## 文档目的

这份文档用于说明 `bilibili-growth-ops` 第一版的命令边界、运行入口和结果约定。

重点关注：

- 每个动作对应一条清晰命令
- 命令返回结构稳定，便于 Agent 消费和协作
- 运行环境、产品库、B 站动作、任务编排都通过统一入口推进

## 统一入口

主 CLI 入口：

```bash
node scripts/ops.js <group> <command> [...options]
```

常见示例：

```bash
node scripts/ops.js command list
node scripts/ops.js runtime bootstrap
node scripts/ops.js product create --name "TML"
node scripts/ops.js auth qr-start
node scripts/ops.js video search --keyword "AI 编程"
node scripts/ops.js task create --product tml --strategy baseline-comment-reply-dm
```

## 结果结构

所有命令都应返回统一 JSON 包装：

```json
{
  "ok": true,
  "command": "video.search",
  "runtimeRoot": "/Users/example/.tml/skills/bilibili-growth-ops",
  "data": {},
  "riskHints": [],
  "nextSteps": [],
  "writes": [],
  "timestamp": "2026-04-17T12:00:00.000Z"
}
```

字段说明：

- `ok`：是否成功
- `command`：稳定的命令 id
- `runtimeRoot`：当前实际使用的运行目录
- `data`：主结果载荷
- `riskHints`：风险提醒、节流提醒或审核提醒
- `nextSteps`：建议的后续动作
- `writes`：本次命令写入的文件或事实
- `timestamp`：返回时间

## 命令分组

### 1. 命令目录

用于命令发现和命令释义。

#### `command.list`
- 用途：查看集中命令目录里的命令列表
- 可选输入：`group`
- 输出：命令摘要列表

#### `command.explain`
- 用途：批量查看一组命令的作用、参数和关键提醒
- 必填输入：`ids`
- 可选输入：`group`
- 输出：命令详情，以及未命中的命令 id

### 2. 运行环境

用于运行目录初始化和环境检查。

#### `runtime.paths`
- 用途：查看当前实际生效的运行目录和关键路径
- 可选输入：`runtimeRoot`
- 输出：解析后的 runtime 路径

#### `runtime.bootstrap`
- 用途：初始化运行目录、SQLite 文件、内置功能包、内置策略和模板资源
- 可选输入：`runtimeRoot`、`repair`
- 输出：创建结果、检查结果、修复摘要

#### `runtime.doctor`
- 用途：检查 Node 版本、SQLite 能力、runtime 结构和 session 状态
- 可选输入：`runtimeRoot`
- 输出：检查项、缺失项和修复提示

#### `runtime.repair`
- 用途：补齐缺失的运行目录或基础文件，不破坏现有用户数据
- 可选输入：`runtimeRoot`
- 输出：已修复项和剩余阻塞项

### 3. 产品

用于产品库管理。

#### `product.create`
- 用途：在 SQLite 中创建产品事实，并初始化产品工作区
- 必填输入：`name`
- 可选输入：`slug`、`summary`、`runtimeRoot`
- 输出：产品 id、slug、工作区路径
  - 产品工作区会包含 `PRODUCT.md`、`PRODUCT-INSIGHT.md` 和产品信息提炼指引

#### `product.list`
- 用途：查看事实层中的产品列表
- 可选输入：`status`
- 输出：产品摘要列表

#### `product.get`
- 用途：查看单个产品及其工作区指针
- 必填输入：`slug`
- 输出：产品事实和工作区路径

#### `product.ingest`
- 用途：把产品资料导入产品工作区
- 必填输入：`slug`
- 可选输入：`source` 或 `text`
- 可选输入：`title`、`kind`、`runtimeRoot`
- 输出：写入的资料文件、抽取摘要、产品摘要刷新结果
  - 导入后应继续按照产品信息提炼指引更新 `PRODUCT-INSIGHT.md`

### 4. 登录与会话

用于单账号登录态管理。

#### `auth.qr_start`
- 用途：启动二维码登录
- 可选输入：`runtimeRoot`
- 输出：`qrcodeKey`、登录链接、终端二维码文本、保存后的 session 指针

#### `auth.qr_poll`
- 用途：轮询二维码登录状态，成功后持久化当前受管账号会话
- 可选输入：`qrcodeKey`
- 输出：登录状态、账号摘要、session 状态

#### `auth.session_get`
- 用途：检查当前 session 健康度
- 可选输入：`runtimeRoot`
- 输出：session 摘要、有效性状态、刷新提示

#### `auth.session_refresh`
- 用途：在上游支持刷新时刷新当前 cookie session
- 可选输入：`runtimeRoot`
- 输出：刷新后的 session 摘要

### 5. 账号

#### `account.self_get`
- 用途：拉取当前受管账号资料
- 可选输入：`runtimeRoot`
- 输出：账号资料和同步摘要

### 6. 视频

#### `video.search`
- 用途：按关键词搜索 B 站视频
- 必填输入：`keyword`
- 可选输入：`page`、`limit`、`raw`、`runtimeRoot`
- 输出：视频列表
  - 默认不复用受管账号登录态，而是使用匿名搜索上下文，降低搜索风控概率

#### `video.get`
- 用途：通过 `bvid`、`aid` 或完整链接获取单个视频详情
- 必填输入：`id`
- 输出：标准化后的视频详情

### 7. 评论

#### `comment.list`
- 用途：读取视频主评论列表
- 必填输入：`id` 或 `oid`
- 可选输入：`page`、`size`、`sort`
- 输出：标准化评论列表

#### `comment.scan`
- 用途：扫描主评论流，用于线索挖掘和跟进判断
- 必填输入：`id` 或 `oid`
- 可选输入：`mode`、`nextOffset`、`seekRpid`
- 输出：标准化主评论流和分页信息

#### `comment.send`
- 用途：发送公开评论或评论回复
- 必填输入：`id` 或 `oid`、`message`、`reason`
- 可选输入：`root`、`parent`、`taskId`、`stageId`、`skipDedupe`
- 输出：发送结果，以及写入的关键动作记录 `OperationRecord`
  - `reason` 用于记录本次发送的依据、目的或意义，建议简短
  - 如果动作属于某个任务阶段，应同时传入 `taskId` 和 `stageId`
  - 真实发送前会先调用 `records.cooldown-check`
  - 具体节流规则以 `records.cooldown-check` 返回为准；如需调整，应先用 `records cooldown-policy-set` 更新中心规则

### 8. 通知

#### `notification.unread_get`
- 用途：查看回复、@、系统消息等未读摘要
- 可选输入：`runtimeRoot`
- 输出：未读摘要
  - 这是只读命令，不应写入关键动作记录 `OperationRecord`

#### `notification.reply_list`
- 用途：查看评论回复通知
- 可选输入：`id`、`replyTime`
- 输出：标准化回复通知
  - 这是只读命令，不应写入关键动作记录 `OperationRecord`

### 9. 私信

#### `dm.session_list`
- 用途：查看私信会话列表
- 可选输入：`sessionType`、`groupFold`、`unfollowFold`、`sortRule`
- 输出：标准化私信会话列表
  - 这是只读命令，不应写入关键动作记录 `OperationRecord`

#### `dm.message_list`
- 用途：查看某个私信会话的消息历史
- 必填输入：`talkerId`
- 可选输入：`sessionType`、`beginSeqno`、`size`
- 输出：标准化私信消息列表
  - 这是只读命令，不应写入关键动作记录 `OperationRecord`

#### `dm.send`
- 用途：向目标用户发送一条私信
- 必填输入：`receiverId`、`message`、`reason`
- 可选输入：`msgType`、`devId`、`timestamp`、`taskId`、`stageId`、`skipDedupe`
- 输出：发送结果，以及写入的关键动作记录 `OperationRecord`
  - `reason` 用于记录本次发送的依据、目的或意义，建议简短
  - 如果动作属于某个任务阶段，应同时传入 `taskId` 和 `stageId`
  - 真实发送前会先调用 `records.cooldown-check`
  - 具体节流规则以 `records.cooldown-check` 返回为准；如需调整，应先用 `records cooldown-policy-set` 更新中心规则

### 10. 记录

#### `records.list`
- 用途：查看关键动作记录 `OperationRecord` 历史
- 可选输入：`accountId`、`taskId`、`stageId`、`operationType`、`targetType`、`targetUserMid`、`targetVideoBvid`、`limit`
- 输出：分页记录列表

#### `records.cooldown_policy_get`
- 用途：查看中心化节流规则
- 可选输入：`operationType`
- 输出：默认规则、已持久化规则、当前生效规则
- 说明：如果不传 `operationType`，会返回全部操作类型的规则快照

#### `records.cooldown_policy_set`
- 用途：精确更新某类外发动作的中心化节流规则
- 必填输入：`operationType`
- 可选输入：`cooldownSeconds`、`windowMinutes`、`maxInWindow`、`recentLimit`、`replace`
- 输出：更新后的规则快照
- 说明：
  - 默认是局部更新，只覆盖本次传入的字段
  - 如果 `replace=true`，则用本次字段整体替换该操作类型的已持久化规则
  - 适合 Agent 把用户的自然语言要求翻译成精确规则更新

#### `records.cooldown_policy_reset`
- 用途：重置中心化节流规则
- 可选输入：`operationType`
- 输出：重置后的规则快照
- 说明：如果不传 `operationType`，会清空全部自定义节流规则

#### `records.cooldown_check`
- 用途：根据当前账号近期真实动作记录，返回当前生效的节流规则，并判断当前是否满足外发冷却与窗口频率要求
- 必填输入：`operationType`
- 可选输入：`accountId`
- 输出：是否允许继续发送、近期动作摘要、建议等待时间和当前生效规则
- 说明：中心化规则和当前节流判断都应以这里的返回为准

#### `records.dedupe_check`
- 用途：判断是否已存在相似真实动作，避免重复触达
- 必填输入：`operationType`、`targetType`
- 可选输入：`targetUserMid`、`targetVideoBvid`、`targetCommentRpid`、`dedupeKey`、`withinHours`
- 输出：去重命中结果和记录摘要

### 11. 功能包

#### `capability.list`
- 用途：查看运行环境中可用的功能包
- 可选输入：`runtimeRoot`
- 输出：功能包摘要列表

#### `capability.get`
- 用途：查看单个功能包定义、frontmatter 和执行说明章节
- 必填输入：`slug`
- 输出：功能包详情

### 12. 策略

#### `strategy.list`
- 用途：查看运行环境中可用的策略模板
- 可选输入：`runtimeRoot`
- 输出：策略摘要列表

#### `strategy.get`
- 用途：读取单个策略模板，包括阶段设计、功能包映射、指令边界和提示词导向
- 必填输入：`slug`
- 输出：策略详情

### 13. 任务

#### `task.create`
- 用途：基于产品与策略创建任务工作区，包括任务容器和初始阶段骨架
- 必填输入：`product`、`strategy`
- 可选输入：`title`
- 输出：任务 id、任务路径、初始阶段摘要
  - 任务工作区是运行容器，不是写死的业务模版
  - 具体执行说明、批次安排和补充文件，应由 agent 在任务目录中继续生成

#### `task.status`
- 用途：查看任务控制状态
- 必填输入：`taskId`
- 输出：任务摘要、当前阶段、审核状态和暂停状态

#### `task.plan_next`
- 用途：让主 Agent 计算当前下一步可执行阶段
- 必填输入：`taskId`
- 输出：下一步阶段判断、审核要求、阶段重点和建议动作

#### `task.delegate_prepare`
- 用途：为副 Agent 生成一份边界明确的派工单
- 必填输入：`taskId`
- 可选输入：`stageId`、`capability`
- 输出：派工单路径和派工摘要

#### `task.review_start`
- 用途：在阶段首轮真实外发前生成审核单
- 必填输入：`taskId`、`stageId`
- 输出：审核单路径、草案摘要和审核要求

#### `task.review_approve`
- 用途：批准当前阶段首轮审核
- 必填输入：`taskId`、`stageId`
- 可选输入：`note`
- 输出：审核状态更新

#### `task.reconcile`
- 用途：把副 Agent 或阶段执行结果回写到任务状态里
- 必填输入：`taskId`
- 可选输入：`resultFile`、`stageId`、`status`、`note`
- 输出：更新后的任务状态和阶段回写摘要
  - 如果结果文件里没有明确状态，建议显式传入 `status`
  - 没有明确完成信号时，阶段不会被默认标记为完成

#### `task.pause`
- 用途：暂停任务
- 必填输入：`taskId`
- 可选输入：`reason`
- 输出：暂停后的任务状态摘要

#### `task.resume`
- 用途：恢复任务
- 必填输入：`taskId`
- 可选输入：`reason`
- 输出：恢复后的任务状态摘要

#### `task.recover`
- 用途：结合任务文件和事实层恢复任务控制视角
- 必填输入：`taskId`
- 输出：恢复结果摘要和任务范围内的事实摘要
  - 恢复时应优先检查当前 `taskId` 下的关键动作记录 `OperationRecord`

## 第一版治理规则

- 第一版只支持一个受管账号
- 新的外发阶段首轮必须走“先审核后执行（`review-first`）”
- 平台只读命令不应写入关键动作记录 `OperationRecord`
- 只有评论、评论回复、私信这类重量级真实动作才应写入关键动作记录 `OperationRecord`
- 每条 `OperationRecord` 都必须包含 `reason`
- 真实外发前必须先通过去重检查和节流检查
- 节流规则应集中通过 `records cooldown-policy-set` / `records cooldown-policy-reset` 管理，不要在策略、功能包或单次发送里分散写死
- 任务主控状态必须保持文件化
- `dm.send` 只用于高意向升级场景
