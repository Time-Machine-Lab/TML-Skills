# Google Flow Recaptcha 服务抽象

本文件只记录 Google Flow / aisandbox 调用前的一次性 recaptcha v3 token 获取逻辑。旧项目的核心实现来自：

- `/Users/mac/Code/ModelMaster/model-master-app/src/main/java/io/github/timemachinelab/service/GoogleAIService.java`
- `/Users/mac/Code/ModelMaster/model-master-app/src/main/java/io/github/timemachinelab/service/ReCaptchaService.java`
- `/Users/mac/Code/ModelMaster/model-master-app/src/main/java/io/github/timemachinelab/service/recaptcha/CapsolverRecaptchaServiceImpl.java`
- `/Users/mac/Code/ModelMaster/model-master-app/src/main/java/io/github/timemachinelab/client/GoogleReCaptchaCapsolverClient.java`
- `/Users/mac/Code/ModelMaster/model-master-app/src/main/java/io/github/timemachinelab/service/OpsService.java`

## 0. ModelMaster 配置来源

Google Flow 的验证码服务 key 不在 `application-*.yml` 的 `captcha:` 段里；那个段落只用于站内邮件/图片验证码。

旧项目的 Google recaptcha provider 来源是数据库 `other_account` 表：

| 项 | 位置 |
| --- | --- |
| 数据库连接密文 | `model-master-app/src/main/resources/application-dev.yml` 的 `spring.datasource` |
| Jasypt 解密参数 | `model-master-app/src/main/resources/you-cant-see-that.yml` |
| Capsolver key 读取入口 | `ClientConfig.googleReCaptchaCapsolverClient()` |
| provider 平台名 | `ReCaptchaCapsolver` |
| key 字段 | `other_account.token` |

数据库里可能同时存在两条验证码平台记录：

| `platform` | 对应代码 | 当前 Google Flow 是否使用 |
| --- | --- | --- |
| `ReCaptcha` | `GoogleReCaptchaClient`，base URL 是 `https://api.ez-captcha.com` | 否。`GoogleAIService` 里虽然注入了 `googleReCaptchaClient`，但当前生成链路没有调用它。 |
| `ReCaptchaCapsolver` | `GoogleReCaptchaCapsolverClient`，base URL 是 `https://api.capsolver.com` | 是。`GoogleAIService.getReCaptcha()` 通过 `capsolverRecaptchaServiceImpl.getRecaptchaToken(...)` 获取 token，feedback 也走同一个实现。 |

`EzCaptchaReCaptchaServiceImpl` 当前只是空壳实现，`getRecaptchaToken()` 返回空对象，`feedbackTask()` 返回 `false`，不能作为当前可用实现。

迁移到本 skill 时，只把 `other_account.token` 写入被忽略的 `secrets/captcha.local.json` 的 `client_key`；不要把数据库连接、Jasypt 主密码或一次性 recaptcha token 写入 skill 文档。

已验证的本地迁移查询逻辑：

```sql
SELECT id, status, token
FROM other_account
WHERE platform = 'ReCaptchaCapsolver'
  AND (delete_flag = 0 OR delete_flag IS NULL)
  AND token IS NOT NULL
  AND token <> ''
ORDER BY CASE WHEN status = 'available' THEN 0 ELSE 1 END, id DESC
LIMIT 1;
```

## 1. Google Flow 固定参数

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `websiteURL` | `https://labs.google/` | Google Flow 页面 |
| `websiteKey` | `6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV` | Google Flow recaptcha key |
| `websiteTitle` | `Flow - ModelMaster` | 旧 DTO 会构造，但 Capsolver 实现没有真正传出 |
| 图片 `pageAction` | `IMAGE_GENERATION` | Flow 生图前使用 |
| 视频 `pageAction` | `VIDEO_GENERATION` | VEO 视频提交前使用 |
| Google 请求写入字段 | `clientContext.recaptchaContext.token` | 图片和视频一致 |
| Google 请求 `applicationType` | `RECAPTCHA_APPLICATION_TYPE_WEB` | 固定 |

注意：旧 `GoogleAIService` 里有 `RE_CAPTCHA_V3_TASK_TYPE = "ReCaptchaV3EnterpriseTaskProxyless"` 常量，但实际 `CapsolverRecaptchaServiceImpl` 创建任务时硬编码的是 `ReCaptchaV3TaskProxyLess`。生成调用应以实际发送值为准。

## 2. 服务抽象

建议把验证码服务抽象成三步：

```text
solve(pageAction) -> { token, userAgent, taskId, provider }
call_google_api(token, userAgent)
feedback(taskId, pageAction, solved)
```

字段含义：

| 字段 | 必填 | 用途 |
| --- | --- | --- |
| `token` | 是 | 写入 `clientContext.recaptchaContext.token` |
| `userAgent` | 建议 | 旧项目会把 solver 返回的 userAgent 透传到 Google API header |
| `taskId` | 使用反馈时必填 | 调用 provider feedback 接口 |
| `pageAction` | 是 | 图片/视频必须区分，否则容易触发 403 类错误 |

`taskId` 不应跨线程复用。旧项目用 `ReCaptchaTaskIdUtil` 的 `ThreadLocal` 暂存，并在一次生成结束后 `clear()`。

## 3. Capsolver 实现

### 3.1 创建任务

Endpoint：

```text
POST https://api.capsolver.com/createTask
```

请求：

```json
{
  "clientKey": "<CAPSOLVER_CLIENT_KEY>",
  "task": {
    "type": "ReCaptchaV3TaskProxyLess",
    "websiteURL": "https://labs.google/",
    "websiteKey": "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV",
    "pageAction": "IMAGE_GENERATION"
  }
}
```

响应关键字段：

```json
{
  "errorId": 0,
  "taskId": "..."
}
```

没有 `taskId` 时视为失败。

### 3.2 轮询结果

Endpoint：

```text
POST https://api.capsolver.com/getTaskResult
```

请求：

```json
{
  "clientKey": "<CAPSOLVER_CLIENT_KEY>",
  "taskId": "..."
}
```

旧项目策略：

| 项 | 值 |
| --- | --- |
| 最大轮询次数 | 6 |
| 轮询间隔 | 4000ms |
| 成功条件 | `status == "ready"` |
| token 字段 | `solution.gRecaptchaResponse` |
| userAgent 字段 | `solution.userAgent` |

ready 响应：

```json
{
  "errorId": 0,
  "taskId": "...",
  "status": "ready",
  "solution": {
    "gRecaptchaResponse": "...",
    "userAgent": "..."
  }
}
```

## 4. Feedback 逻辑

旧项目会在生成成功后反馈 `solved=true`，遇到 403 类错误后反馈 `solved=false`。

Endpoint：

```text
POST https://api.capsolver.com/feedbackTask
```

请求：

```json
{
  "clientKey": "<CAPSOLVER_CLIENT_KEY>",
  "solved": true,
  "task": {
    "type": "ReCaptchaV3TaskProxyLess",
    "websiteURL": "https://labs.google/",
    "websiteKey": "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV",
    "pageAction": "IMAGE_GENERATION"
  },
  "result": {
    "errorId": 0,
    "taskId": "...",
    "status": "ready"
  }
}
```

成功判断：响应 `errorId == 0`。

触发 `solved=false` 的 Google 错误：

| 条件 | 说明 |
| --- | --- |
| reason 以 `403` 结尾 | 旧项目按 403 类验证码失败处理 |
| `PUBLIC_ERROR_SOMETHING_WENT_WRONG` | 旧项目会反馈失败并重试 |
| `PUBLIC_ERROR_UNUSUAL_ACTIVITY` | 旧项目会反馈失败并重试 |

## 5. 预解 Token 池

旧项目还保留了一个可选的预解 token 池模式：

| 项 | 值 |
| --- | --- |
| 保存入口 | `POST /api/ops/google/captcha/v3/save?token=...` |
| Redis key | `google_captcha_v3_token` |
| 数据结构 | ZSet |
| score | 当前时间 + 120000ms |
| 获取方式 | 先删除过期 token，再 `zPopMin` 弹出最早过期的 token |

这段逻辑当前没有接入 `GoogleAIService.getReCaptcha()`，因此只能作为高可用扩展方案：外部浏览器或 worker 持续预解 token，生成服务提交任务时优先从 token 池弹出，池空时再调用 Capsolver。

## 6. 本 skill 接口设计

验证码能力独立于图片/视频生成能力。生成脚本只调用统一接口：

```text
build_captcha_provider(...)
run_with_captcha(provider, pageAction, call, is_retryable_error)
```

调用方只拿到：

```text
CaptchaSolution.token
CaptchaSolution.user_agent
```

不关心 token 来自 Capsolver、预解 token 池，还是后续新增的其他验证码平台。

验证码 provider 配置放在 `secrets/captcha.local.json`。这里保存的是验证码平台密钥和轮询策略，不保存每次生成用的一次性 token：

```json
{
  "provider": "capsolver",
  "client_key": "",
  "base_url": "https://api.capsolver.com",
  "task_type": "ReCaptchaV3TaskProxyLess",
  "poll_interval_ms": 4000,
  "max_poll_times": 6,
  "feedback_enabled": true,
  "pre_solved": {
    "enabled": false,
    "ttl_seconds": 120
  }
}
```

脚本行为：

- 手动传 `--recaptcha-token` 时，直接使用该 token；这只用于临时调试，不写配置文件。
- 没有手动 token 时，读取 `secrets/captcha.local.json` 或环境变量 `FLOW_CAPTCHA_PROVIDER`。
- `provider=capsolver` 时按图片/视频自动选择 `pageAction`。
- solver 返回 `userAgent` 时会覆盖请求 header 的 `User-Agent`。
- 提交成功后反馈 `solved=true`；403 类失败后反馈 `solved=false`。
- 使用 provider 动态解码时，辅助脚本会在 403 类错误后重新获取 token 并最多重试 3 次；手动 `recaptcha_token` 不自动刷新。

## 7. 调用注意点

- recaptcha token 是一次性/短时效凭证，不要写入 reference 文档。
- 图片和视频的 `pageAction` 不能混用。
- userAgent 可能和 token 有绑定关系；如果 solver 返回了 userAgent，必须同步带到 Google API。
- token 复用、跨账号使用、跨 projectId 使用都可能导致 403 或 unusual activity。
- 真实 provider key 只能放在 `secrets/*.local.json` 或环境变量里。

## 8. 本地验证

配置好 `secrets/captcha.local.json` 后，可以只验证验证码服务，不触发图片/视频生成：

```bash
python3 scripts/test_captcha.py --action image --feedback true
```

默认输出会打码 token。验证输出只能打印布尔值、provider 名称、token 长度或打码值；不要打印 `client_key`、完整 `solution.token` 或完整 `task_id`。
