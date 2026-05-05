# Flow 平台账号与 Token 存放说明

真实账号放在当前目录的 `accounts.local.json`。验证码 provider 配置放在 `captcha.local.json`。这两个 local 文件都已经被 `.gitignore` 忽略，不应该提交。

初始化：

```bash
cp accounts.example.json accounts.local.json
cp captcha.example.json captcha.local.json
```

然后编辑 `accounts.local.json`。通用字段：

- `provider`：平台标识，例如 `google-flow`。
- `token` / `google_ai_token`：平台 API 认证 token。
- `cookie` / `google_ai_cookie`：需要浏览器态或 TRPC 时使用。
- `project_id`：Flow project/workspace/context ID。

Google Flow 已知字段：

- `google_ai_token`：Google aisandbox 的 `Authorization` header，通常是 `Bearer <access_token>`。
- `google_ai_cookie`：Labs 完整 Cookie header，用于 `/fx/api/auth/session` 获取/刷新 `google_ai_token`，也给 `labs.google/fx/api/trpc/*` 预留。
- `token_expires`：Labs session 返回的 access token 过期时间，脚本可自动写入。
- `project_id`：Google Flow project/workspace ID。
- `is_fast`：VEO fast profile 兼容开关，会影响部分 relaxed key 是否切换成 fast key。

验证码配置不放在账号 profile 里，因为每次图片/视频生成都需要动态获取一次性 token。`captcha.local.json` 字段：

- `provider`：验证码服务，当前脚本支持 `capsolver`。
- `client_key`：验证码服务密钥，也可以用环境变量 `CAPSOLVER_CLIENT_KEY`。
- `base_url`：验证码服务 API 根地址。
- `task_type`：当前推荐 `ReCaptchaV3TaskProxyLess`。
- `website_url` / `website_key`：Google Flow recaptcha 固定参数。
- `poll_interval_ms` / `max_poll_times`：默认 4000ms、6 次。
- `feedback_enabled`：生成成功反馈 `solved=true`，403 类错误反馈 `solved=false`。
- `pre_solved`：预解 token 池扩展配置；如果外层实现 token 池，TTL 建议不超过 120 秒。

短有效期 `recaptcha_token` 不应该写入配置文件。临时调试时可以用脚本参数 `--recaptcha-token` 或环境变量 `GOOGLE_RECAPTCHA_TOKEN` 覆盖。

Google Flow 验证码固定参数和 provider 请求见：

```text
../references/recaptcha-provider.md
```

迁移已有 Capsolver 配置时，只需要把平台密钥写入 `captcha.local.json` 的 `client_key`。不要把一次性 `recaptcha_token` 写进任何配置文件。

脚本默认读取：

```text
secrets/accounts.local.json
```

运行时可以用 `--account-profile google-flow-default` 选择 profile，也可以用 `--accounts-file` 指定其他账号文件。
验证码配置可以用 `--captcha-config` 指定其他文件，也可以用 `--captcha-provider` 临时切换 provider。

检查 Labs session 并刷新 aisandbox token：

```bash
python3 ../scripts/check_labs_session.py \
  --account-profile google-flow-default \
  --update-account \
  --update-cookie
```

新账号没有 Flow 工作区时，先创建项目并写回 `project_id`：

```bash
python3 ../scripts/create_labs_project.py \
  --account-profile google-flow-default \
  --update-account \
  --update-cookie
```

推荐把完整浏览器 Cookie 放进 `accounts.local.json` 的 `google_ai_cookie`，或放到 `secrets/labs-cookie.local.txt` 后用 `--cookie-file` 读取。不要通过聊天、文档或 shell 日志保存完整 Cookie、session-token、access_token。

只验证验证码 provider：

```bash
python3 ../scripts/test_captcha.py --action image --feedback true
```

默认只打印打码 token，不要使用 `--show-full-token` 产出可留存日志。
