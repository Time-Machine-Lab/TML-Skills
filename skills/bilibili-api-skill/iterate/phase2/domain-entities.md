# bilibili-api-skill 二期领域实体设计

## 核心实体

二期核心实体统一为 6 个：

1. `Account`
2. `Product`
3. `BilibiliUser`
4. `BilibiliVideo`
5. `BilibiliComment`
6. `OperationRecord`

其中：

- `Account`、`Product`、`OperationRecord` 是系统内部实体
- `BilibiliUser`、`BilibiliVideo`、`BilibiliComment` 是 B 站侧实体

## 边界

这份文档不讨论：

- 数据库表设计
- 上层编排和调度
- `Strategy`
- `Task`
- `Run`

`AuthSession` 不作为独立实体，统一并入 `Account` 内部管理。

## 非实体对象

下面这些对象不作为二期领域实体：

- `Strategy`
- `Task`
- `Run`

原因：

- 它们属于上层编排和执行控制
- 更适合由 agent 在运行时动态把控
- 不属于这次要沉淀的稳定领域实体

## 1. `Account`

作用：

- 表示一个由系统托管的执行账号
- 支持一个 skill 下管理多个账号
- 承载登录状态、可用状态、风控状态

支持的操作：

- `create`
- `get`
- `list`
- `updateProfile`
- `enable`
- `disable`
- `bindAuth`
- `refreshAuth`
- `clearAuth`

## 2. `Product`

作用：

- 表示当前要推广、转化、引流的产品或服务
- 是评论生成、目标筛选、私信生成的业务上下文

支持的操作：

- `create`
- `get`
- `list`
- `update`
- `enable`
- `disable`
- `archive`

## 3. `BilibiliUser`

作用：

- 表示一个 B 站用户
- 可以是账号本人，也可以是外部目标用户
- 后续视频、评论、互动关系都会和它关联

支持的操作：

- `create`
- `get`
- `list`
- `updateProfile`
- `markObserved`
- `unmarkObserved`
- `archive`

## 4. `BilibiliVideo`

作用：

- 表示一个 B 站视频
- 是评论触达、评论回复、内容分析的核心载体

支持的操作：

- `create`
- `get`
- `list`
- `updateSnapshot`
- `markTracked`
- `unmarkTracked`
- `archive`

## 5. `BilibiliComment`

作用：

- 表示一个 B 站评论实体
- 同时覆盖主评论和评论回复
- 是公开触达、互动跟进、溯源审计的关键实体

支持的操作：

- `create`
- `get`
- `list`
- `updateSnapshot`
- `markTracked`
- `unmarkTracked`
- `archive`

## 6. `OperationRecord`

定案：

- 关键操作记录统一使用 `OperationRecord`
- 不再拆分“视频评论记录 / 评论回复记录 / 私信记录”多个实体
- 新增其他关键操作类型时，继续扩展在 `OperationRecord` 内
- 查询统一围绕 `Account + operation_type + target_type + target_id` 这组语义设计

作用：

- 表示一次由系统账号发起的关键操作记录
- 统一覆盖：
  - 给某个视频发评论
  - 给某个评论发回复
  - 给某个用户发私信
- 用来支撑分页查询、行为回溯、重复发送判断、风控辅助判断

支持的操作：

- `append`
- `get`
- `list`
- `listByAccount`
- `listByTarget`
- `listByType`
- `markSent`
- `markFailed`

说明：

- 这里不拆成“视频评论记录 / 评论回复记录 / 私信记录”3 个实体
- 统一收敛成一个 `OperationRecord`
- 通过记录类型和目标对象来区分具体行为
- 这样后续按账号查看时间线、按目标做去重、按类型做分页都会更简单
- 后续如果需要扩展新的关键操作，也继续进入同一个实体

### 记录范围

`OperationRecord` 当前统一记录 3 类动作：

- `video_comment`
  - 给某个视频发送主评论
- `comment_reply`
  - 给某个评论发送回复
- `direct_message`
  - 给某个用户发送私信

### 分类维度

为了保证统一记录后仍然容易查询，`OperationRecord` 在领域语义上至少要有下面这些分类维度：

- `account_id`
  - 哪个账号发起的动作
- `operation_type`
  - 动作类型
  - 例如：`video_comment`、`comment_reply`、`direct_message`
- `target_type`
  - 目标类型
  - 例如：`video`、`comment`、`user`
- `target_id`
  - 目标对象标识
- `status`
  - 当前结果状态
  - 例如：`pending`、`sent`、`failed`
- `created_at`
  - 动作创建时间

如果要支撑更细的风控和回溯，还需要保留：

- `content`
  - 实际发送内容
- `reason`
  - 当时为什么发送这条内容
- `result_summary`
  - 发送结果摘要

### 查询口径

统一成一个 `OperationRecord` 后，单独查询不会丢能力。

常见查询口径可以直接按这几个维度组合：

- 查某个账号发过的全部动作
  - `account_id`
- 查某个账号发过的视频评论
  - `account_id + operation_type=video_comment`
- 查某个账号对某条评论发过的回复
  - `account_id + operation_type=comment_reply + target_type=comment + target_id`
- 查某个账号给某个用户发过的私信
  - `account_id + operation_type=direct_message + target_type=user + target_id`
- 查某个目标最近被触达过什么
  - `target_type + target_id`
- 查某段时间内某账号的发送记录
  - `account_id + created_at`

这类查询里，最需要优先保障的是：

- 某个 `Account` 给某个 `BilibiliUser` 发过哪些私信
- 某个 `Account` 对某个 `BilibiliVideo` 发过哪些评论
- 某个 `Account` 对某个 `BilibiliComment` 发过哪些回复

### 查询优先级

`OperationRecord` 需要优先保证下面这些查询足够直接：

1. 按 `account_id` 查账号操作时间线
2. 按 `account_id + operation_type` 查某类操作记录
3. 按 `account_id + target_type + target_id` 查某账号对某目标做过什么
4. 按 `account_id + operation_type + target_type + target_id` 做发送前去重检查

### 统一记录的价值

把这 3 类动作统一收敛到一个 `OperationRecord`，主要有 4 个直接好处：

1. 按账号查看完整时间线会很自然
2. 发送前做去重和相似内容判断会更简单
3. 后续风控判断不需要跨多个记录实体来回查
4. 后续如果 agent 要做自检、复盘、验收，也能直接围绕同一类记录工作

### 使用原则

`OperationRecord` 的定位不是调试日志，而是关键业务记录。

所以它更适合：

- 追加
- 查询
- 回溯
- 统计

不适合：

- 频繁覆盖历史内容
- 把它当成普通业务主实体去反复修改

## 实体关系

```text
Account
  -> maps to -> BilibiliUser

BilibiliUser
  -> authored -> BilibiliVideo

BilibiliUser
  -> authored -> BilibiliComment

BilibiliVideo
  -> has many -> BilibiliComment

BilibiliComment
  -> belongs to -> BilibiliVideo

BilibiliComment
  -> belongs to -> BilibiliUser

BilibiliComment
  -> replies to -> BilibiliComment

Product
  -> used by -> Account
  -> used when generating content for -> BilibiliComment

Account
  -> has many -> OperationRecord

OperationRecord
  -> may target -> BilibiliVideo

OperationRecord
  -> may target -> BilibiliComment

OperationRecord
  -> may target -> BilibiliUser

OperationRecord
  -> may create -> BilibiliComment
```

## 关系说明

- 一个 `Account` 在 B 站侧映射到一个账号自己的 `BilibiliUser`
- 一个 `BilibiliUser` 可以发布多个 `BilibiliVideo`
- 一个 `BilibiliUser` 可以发表多个 `BilibiliComment`
- 一个 `BilibiliVideo` 下会有多个 `BilibiliComment`
- 一个 `BilibiliComment` 可以回复另一个 `BilibiliComment`
- `Product` 参与内容生成和目标判断，但不直接属于 B 站实体关系链
- 一个 `Account` 会产生多条 `OperationRecord`
- 一条 `OperationRecord` 会指向一个主要目标对象
- 当动作为“视频评论”或“评论回复”时，成功后通常会关联到一个 `BilibiliComment`
- 当动作为“私信发送”时，主要目标通常是一个 `BilibiliUser`
