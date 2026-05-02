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

- `google_ai_token`：旧项目 `other_account.token`，作为 Google aisandbox 的 `Authorization` header。
- `google_ai_cookie`：旧项目 `other_account.cookie`，主要给 `labs.google/fx/api/trpc/*` 预留。
- `project_id`：旧项目 `other_account.extraData.projectId`。
- `is_fast`：旧项目 `other_account.extraData.isFast`，会影响 VEO fast relaxed key 是否切换成 fast key。
- `account_type`：旧项目 `other_account.type`，视频账号管理器里有类型检查逻辑，实际筛选规则仍需结合数据库确认。

验证码配置不放在账号 profile 里，因为每次图片/视频生成都需要动态获取一次性 token。`captcha.local.json` 字段：

- `provider`：验证码服务，当前脚本支持 `capsolver`。
- `client_key`：验证码服务密钥，也可以用环境变量 `CAPSOLVER_CLIENT_KEY`。
- `base_url`：验证码服务 API 根地址。
- `task_type`：旧项目实际发送 `ReCaptchaV3TaskProxyLess`。
- `website_url` / `website_key`：Google Flow recaptcha 固定参数。
- `poll_interval_ms` / `max_poll_times`：旧项目默认 4000ms、6 次。
- `feedback_enabled`：生成成功反馈 `solved=true`，403 类错误反馈 `solved=false`。
- `pre_solved`：预解 token 池扩展配置；旧项目 Redis key 是 `google_captcha_v3_token`，TTL 120 秒。

短有效期 `recaptcha_token` 不应该写入配置文件。临时调试时可以用脚本参数 `--recaptcha-token` 或环境变量 `GOOGLE_RECAPTCHA_TOKEN` 覆盖。

Google Flow 验证码固定参数和 provider 请求见：

```text
../references/recaptcha-provider.md
```

从 ModelMaster 迁移 Capsolver 配置时，来源不是 `captcha:` 配置段，而是数据库 `other_account` 表里 `platform = 'ReCaptchaCapsolver'` 的 `token` 字段。迁移后只写入 `captcha.local.json` 的 `client_key`，不要把一次性 `recaptcha_token` 写进任何配置文件。

脚本默认读取：

```text
secrets/accounts.local.json
```

运行时可以用 `--account-profile google-flow-default` 选择 profile，也可以用 `--accounts-file` 指定其他账号文件。
验证码配置可以用 `--captcha-config` 指定其他文件，也可以用 `--captcha-provider` 临时切换 provider。

只验证验证码 provider：

```bash
python3 ../scripts/test_captcha.py --action image --feedback true
```

默认只打印打码 token，不要使用 `--show-full-token` 产出可留存日志。
