# Google Flow 高可用运行策略

本文件描述本 skill 自身的稳定运行策略。它不绑定任何旧业务系统的账号状态、持久化结构或任务队列；外层系统如果需要多 profile 调度，可以基于这里的 `profile_action` 自行实现。

## 1. Profile 模型

一个 Flow profile 表示一组可以完成 Google Flow/Labs 调用的本地凭证：

```json
{
  "google_ai_token": "",
  "google_ai_cookie": "",
  "token_expires": "",
  "project_id": "",
  "is_fast": false
}
```

字段职责：

| 字段 | 用途 |
| --- | --- |
| `google_ai_token` | aisandbox `Authorization`，通常是 `Bearer <access_token>` |
| `google_ai_cookie` | Labs Cookie header，用于 `/fx/api/auth/session` 刷新 access token |
| `token_expires` | access token 过期时间，只作为刷新前的预检查 |
| `project_id` | Flow projectId，必须和当前登录账号匹配 |
| `is_fast` | VEO fast 账号的 model key 兼容开关 |

本 skill 只读取/更新本地 profile，不定义业务侧 profile 状态。

## 2. Session 与 Token

推荐在生成前先检查 Labs session：

```bash
python3 scripts/check_labs_session.py \
  --account-profile google-flow-default \
  --update-account \
  --update-cookie
```

运行策略：

- `google_ai_token` 过期时，优先用 `google_ai_cookie` 调 `/fx/api/auth/session` 刷新。
- 响应里的 `access_token` 写回 `google_ai_token`，前面加 `Bearer `。
- 响应里的 `expires` 写回 `token_expires`。
- 如果响应有 `Set-Cookie`，合并回 `google_ai_cookie`，避免 NextAuth session-token 轮换后旧 cookie 失效。
- 如果 cookie 也失效，外层应重新登录或切换 profile。

## 3. Captcha 策略

生成图片和视频前都需要一次性 recaptcha v3 token：

| 场景 | pageAction |
| --- | --- |
| 图片生成 | `IMAGE_GENERATION` |
| 视频生成 | `VIDEO_GENERATION` |

运行策略：

- 不把一次性 `recaptcha_token` 写入配置文件。
- 每次提交生成前由 `captcha_service.py` 动态获取 token。
- solver 返回的 `userAgent` 透传到 Google API header。
- 生成成功后 feedback `solved=true`。
- 遇到 403 类验证码/风控错误后 feedback `solved=false`，再取新 token 重试。
- 新增验证码平台时只扩展 `CaptchaProvider`，图片/视频生成逻辑不感知具体 provider。

## 4. 限流与并发

Google Flow 的限流以当前 profile、网络环境、模型和时间窗口综合触发。skill 不内置固定调度池，只提供脚本级建议：

- 单个图片 batch 控制在 4 条以内。
- 同一个图片 batch 只能使用同一 `imageModelName`。
- 遇到 `PUBLIC_ERROR_USER_REQUESTS_THROTTLED`、HTTP `429`、`RESOURCE_EXHAUSTED`、quota/rate limit 字样时，当前 profile 应暂停继续提交。
- 外层系统可以选择切换 profile、降低并发、排队或冷却后重试。
- 视频任务提交后轮询不应过密，默认 10 秒一次。

## 5. 错误分类输出

生成脚本失败时会向 stderr 输出：

```text
error_classification={...}
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `reason` | Google 原始 reason 或本地错误摘要 |
| `category` | 归一化错误类别 |
| `profile_action` | 建议外层对当前 profile 采取的动作 |
| `retryable` | 是否适合自动重试 |
| `retry_scope` | 重试范围：新 captcha、刷新 token、换 profile、稍后同请求等 |
| `recovery_action` | 人类可读恢复动作 |
| `provider_health_failure` | 是否应计入 Flow/provider 可用性问题 |

分类表：

| 条件 | category | profile_action | retry_scope |
| --- | --- | --- | --- |
| 本地 profile 缺字段 | `local_account_config` | `fix_local_profile` | `fix_local_profile` |
| 本地请求参数不合法 | `invalid_request` | `none` | `fix_parameters` |
| HTTP `401` 或 `TOKEN_EXPIRED` | `auth_token_expired` | `refresh_access_token` | `refresh_labs_session` |
| `COOKIE_EXPIRED` | `labs_cookie_expired` | `refresh_cookie_or_relogin` | `relogin_or_replace_cookie` |
| `PUBLIC_ERROR_USER_REQUESTS_THROTTLED` / HTTP `429` / `RESOURCE_EXHAUSTED` / quota/rate limit | `account_rate_limited` | `cooldown_or_rotate` | `different_account_or_after_cooldown` |
| HTTP `403` / reason 以 `403` 结尾 / `PUBLIC_ERROR_SOMETHING_WENT_WRONG` / `PUBLIC_ERROR_UNUSUAL_ACTIVITY` | `recaptcha_or_risk_gate` | `retry_with_new_captcha` | `new_recaptcha_token` |
| 内容安全类 reason | `content_policy` | `none` | `change_prompt_or_input_media` |
| HTTP `400` / `INVALID_ARGUMENT` | `invalid_request` | `none` | `fix_parameters` |
| HTTP `5xx` / `PUBLIC_ERROR_HIGH_TRAFFIC` / `PUBLIC_ERROR_VIDEO_GENERATION_TIMED_OUT` | `provider_transient` | `none` | `same_request_later` |

## 6. Provider 健康口径

`provider_health_failure=false` 的情况不代表 Flow 平台不可用：

- 本地配置错误。
- 参数错误。
- 内容安全/合规拦截。
- 当前 profile 限流。

`provider_health_failure=true` 适合记录为运行可用性问题：

- token/cookie/session 失效且无法刷新。
- 验证码/风控门禁持续失败。
- 平台 5xx、高负载或生成超时。
- 未知错误，直到分类表补齐。

## 7. 资源下载

本 skill 默认保留 Google 原始响应；传 `--output-dir` 时会下载产物到本地：

- Flow 图片优先下载 `media[].image.generatedImage.fifeUrl`，否则保存 `encodedImage`。
- VEO 视频下载 `operation.metadata.video.fifeUrl`。
- 下载失败应保留完整响应，方便后续用原始 URL 或 operation name 追查。

## 8. 高可用检查清单

生成或复现调用前，至少检查：

- `project_id` 是否和当前 token/cookie 属于同一 Flow 项目。
- `google_ai_token` 是否临近过期，必要时先跑 `check_labs_session.py`。
- `google_ai_cookie` 是否可用，刷新 token 后是否合并了新的 `Set-Cookie`。
- recaptcha `pageAction` 是否正确。
- recaptcha `userAgent` 是否透传。
- VEO fast profile 是否需要 `is_fast` model key 兼容。
- Flow 图片上传返回的 `media.name` 和 VEO 上传返回的 `mediaGenerationId` 没有混用。
- batch 是否超过 4 条，是否混用了不同图片模型。
- 轮询 operation name 是否来自同一次提交响应。
