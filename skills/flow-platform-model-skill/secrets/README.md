# Google Flow 账号与 Token 存放说明

真实账号放在当前目录的 `accounts.local.json`。这个文件已经被上级 `.gitignore` 忽略，不应该提交。

初始化：

```bash
cp accounts.example.json accounts.local.json
```

然后编辑 `accounts.local.json`：

- `google_ai_token`：旧项目 `other_account.token`，作为 Google aisandbox 的 `Authorization` header。
- `google_ai_cookie`：旧项目 `other_account.cookie`，主要给 `labs.google/fx/api/trpc/*` 预留。
- `project_id`：旧项目 `other_account.extraData.projectId`。
- `is_fast`：旧项目 `other_account.extraData.isFast`，会影响 VEO fast relaxed key 是否切换成 fast key。
- `account_type`：旧项目 `other_account.type`，视频账号管理器里有类型检查逻辑，实际筛选规则仍需结合数据库确认。
- `recaptcha_token`：短有效期 token，用于一次或短时间接口实验。
- `user_agent`：如果 recaptcha 服务返回 userAgent，应与请求一起带上。
- `captcha.provider`：验证码服务，当前辅助脚本支持 `capsolver`；填 `none` 或留空表示只用手动 token。
- `captcha.client_key`：验证码服务密钥，也可以用环境变量 `CAPSOLVER_CLIENT_KEY`。
- `captcha.task_type`：旧项目实际发送 `ReCaptchaV3TaskProxyLess`。
- `captcha.poll_interval_ms` / `captcha.max_poll_times`：旧项目默认 4000ms、6 次。
- `captcha.feedback_enabled`：生成成功反馈 `solved=true`，403 类错误反馈 `solved=false`。
- `captcha.pre_solved`：预解 token 池扩展配置；旧项目 Redis key 是 `google_captcha_v3_token`，TTL 120 秒。

验证码固定参数和 provider 请求见：

```text
../references/recaptcha-provider.md
```

脚本默认读取：

```text
docs/other/flow-platform-model-skill/secrets/accounts.local.json
```

运行时可以用 `--account-profile google-flow-default` 选择 profile，也可以用 `--accounts-file` 指定其他账号文件。
