# Google Flow 高可用与运行细节

本文件补充旧项目里 Google Flow/aisandbox 的账号池、recaptcha、重试、错误处理和资源下载逻辑。它不是接口字段矩阵，而是确保调用稳定性时必须参考的运行策略。

## 1. 账号来源和字段

旧项目从 `other_account` 表读取 Google 账号，统一转换成 `GoogleAccountManager.VEO3Account`。

核心字段：

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `accountId` | `other_account.account_id` | 账号池去重和状态更新 |
| `cookie` | `other_account.cookie` | Labs/TRPC 接口，如 `project.createProject` |
| `token` | `other_account.token` | aisandbox 接口 `Authorization` |
| `projectId` | `JSON.parse(extraData).projectId` | Flow 项目和 `clientContext.projectId` |
| `isFast` | `JSON.parse(extraData).isFast` | VEO fast key 调整 |
| `type` | `other_account.type` | 视频账号类型检查预留逻辑 |

本 skill 的 `secrets/accounts.local.json` 应至少保存：

```json
{
  "google_ai_token": "",
  "google_ai_cookie": "",
  "project_id": "",
  "is_fast": false,
  "account_type": null
}
```

## 2. 图片和视频账号池分离

旧项目不是一个池子跑所有任务：

| 管理器 | 用途 | 配置路径 | 兜底值 |
| --- | --- | --- | --- |
| `GoogleImageAccountManager` | Google Flow 生图 | `mmPermission.system.googleAccount.image` | `accountNum=3`、`reqLimit=3`、`coldDownTime=2h`、`hotNum=400` |
| `GoogleVideoAccountManager` | Google VEO 视频 | `mmPermission.system.googleAccount.video` | `accountNum=3`、`reqLimit=1`、`coldDownTime=2h`、`hotNum=400` |

旧项目运行时通过 `VEO3AccountUtil` 的 `ThreadLocal` 把当前账号传给 `GoogleAIService`。异步上传 Flow 参考图时也会在子线程重新设置同一个账号。

## 3. 并发与队列

Google Flow 生图：

- `FlowImageTaskConsumer` 默认配置项：`model-master.ai-image.flow.reqLimit:9`
- 实际并发还受 `GoogleImageAccountManager.getReqLimit()` 限制，即 `可用账号数 * 每账号 reqLimit`
- 账号池无可用额度时会等待；如果池为空会尝试 `addNewAccount(1)`

Google VEO 视频：

- `VEO3TaskConsumer` 默认配置项：`model-master.ai-video.veo3.reqLimit:9`
- 线程数优先读 `mmPermission.system.googleAccount.video.threadNum`，兜底 `6`
- 轮询队列 sleep 时间读 `mmPermission.system.googleAccount.video.cycleTime`，兜底 `2000ms`
- 实际并发同样受 `GoogleVideoAccountManager.getReqLimit()` 限制

## 4. Recaptcha 策略

旧项目每次生成前动态取 recaptcha，不复用长期 token。完整服务抽象、Capsolver 请求和反馈逻辑见 `references/recaptcha-provider.md`。

固定参数：

| 字段 | 值 |
| --- | --- |
| websiteURL | `https://labs.google/` |
| websiteKey | `6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV` |
| websiteTitle | `Flow - ModelMaster` |
| 图片 pageAction | `IMAGE_GENERATION` |
| 视频 pageAction | `VIDEO_GENERATION` |
| provider task type | 实际发送 `ReCaptchaV3TaskProxyLess` |
| DTO type | `reCaptchaV3` |

结果使用：

- `recaptchaValue` -> `clientContext.recaptchaContext.token`
- `userAgent` -> 透传到请求 header `user-agent`
- 成功后调用 `feedbackTask(..., true)`
- 遇到 403 类错误后调用 `feedbackTask(..., false)`
- 每次结束都会 `ReCaptchaTaskIdUtil.clear()`

Capsolver 轮询策略：

| 项 | 值 |
| --- | --- |
| createTask | `POST https://api.capsolver.com/createTask` |
| getTaskResult | `POST https://api.capsolver.com/getTaskResult` |
| feedbackTask | `POST https://api.capsolver.com/feedbackTask` |
| 最大轮询 | 6 次 |
| 轮询间隔 | 4000ms |
| 成功 token | `solution.gRecaptchaResponse` |

可选预解 token 池：

- Redis key：`google_captcha_v3_token`
- 保存入口：`POST /api/ops/google/captcha/v3/save?token=...`
- TTL：120 秒
- 读取策略：先删除过期 token，再弹出最早过期 token
- 注意：旧项目已有 `OpsService.getGoogleCaptchaToken()`，但没有接入 `GoogleAIService.getReCaptcha()`；如果要使用，需要作为扩展接入。

## 5. 错误到账号状态映射

旧项目在 consumer 层根据失败 reason 更新账号状态：

| reason | 账号状态 |
| --- | --- |
| `PUBLIC_ERROR_USER_REQUESTS_THROTTLED` | `REQUEST_HIGH` |
| `TOKEN_EXPIRED` | `TOKEN_EXPIRED` |
| `COOKIE_EXPIRED` | `DEAD` |

`GoogleAccountManager.finish()` 行为：

- `REQUEST_HIGH`：同账号累计 4 次后移出可用池，并把数据库状态更新为 `request_high`。
- `TOKEN_EXPIRED` / `DEAD`：移出可用池，并把数据库状态更新为 `dead`。
- 结束时一定会把当前账号 `reqCount` 减 1。

注意：源码里有 `coldDownAccountCache` 和 `startColdDown()`，但当前 manager 初始化路径没有明显调用 `startColdDown()`；实际是否启用冷却需要结合运行配置或后续代码再确认。

## 6. Google API 错误解析

`GoogleAIClient.executeHttpRequest()` 成功条件：

- HTTP status 必须为 `200`
- `HttpResponse.isSuccess()` 必须为 true

失败解析：

- HTTP `401`：
  - Authorization token 请求 -> `TOKEN_EXPIRED`
  - Cookie 请求 -> `COOKIE_EXPIRED`
- 非 401：
  - 优先读取 `error.details[0].reason`
  - 没有 reason 时使用通用错误消息

因为 `executeHttpRequest()` 的最后 catch 会返回 `null`，上层必须检查空响应。旧项目在 Flow 生图、图片上传、视频状态查询里都做了空响应校验。

## 7. 生成重试策略

Google Flow 生图和 Google VEO 提交都使用相同的 403 类重试策略：

| 条件 | 行为 |
| --- | --- |
| reason 以 `403` 结尾 | 反馈 recaptcha 失败，重试 |
| reason 为 `PUBLIC_ERROR_SOMETHING_WENT_WRONG` | 反馈 recaptcha 失败，重试 |
| reason 为 `PUBLIC_ERROR_UNUSUAL_ACTIVITY` | 反馈 recaptcha 失败，重试 |
| 重试次数达到 3 | 抛出错误 |
| 其他错误 | 不重试，直接抛出 |

VEO 视频提交后轮询：

- 每 10 秒查询一次 `batchCheckAsyncVideoGenerationStatus`
- 查询接口异常最多重试 3 次
- `MEDIA_GENERATION_STATUS_SUCCESSFUL` 成功
- `MEDIA_GENERATION_STATUS_FAILED` 或非 pending/active/successful 状态视为失败

## 8. 资源下载和保存

旧项目生成后不会直接把 Google URL 返回给用户，而是下载并上传到 OSS：

- Flow 图片：下载 `media[].image.generatedImage.fifeUrl`，失败最多重试 3 次。
- VEO 视频：下载 `operation.metadata.video.fifeUrl`。
- VEO 封面：下载 `operation.metadata.video.servingBaseUri`。

如果只做接口调研，可以保留 Google 原始 URL；如果做产品可用性验证，需要记录下载是否成功。

## 9. 高可用检查清单

调研或复现接口前，至少检查：

- `google_ai_token` 是否可用，失败时是否返回 `TOKEN_EXPIRED`。
- `google_ai_cookie` 是否可用，Labs/TRPC 失败时是否返回 `COOKIE_EXPIRED`。
- `project_id` 是否存在且和当前 token/cookie 属于同一账号。
- recaptcha token 是否带正确 pageAction：图片用 `IMAGE_GENERATION`，视频用 `VIDEO_GENERATION`。
- recaptcha 返回的 userAgent 是否同步透传。
- 账号是否需要 `is_fast`，因为它会改变 VEO model key。
- 图片上传返回的是 Flow `media.name` 还是 VEO `mediaGenerationId.mediaGenerationId`，两者不能混用。
- 轮询 operation name 是否来自同一次提交响应。
- 失败响应里的 reason 是否写入实验记录。
