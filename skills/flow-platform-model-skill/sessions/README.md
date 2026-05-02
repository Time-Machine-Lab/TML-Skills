# 本地实验与 Session 记录

这里用于放 Flow 平台生成过程中的本地调用文件，例如：

- 抓包摘要
- 请求体样本
- 响应体样本
- 短期有效的 session 信息
- captcha / recaptcha 测试结果

真实文件请使用 `.local.*` 后缀，例如：

```text
2026-04-30-google-flow-nano-banana-2-text.local.md
2026-04-30-google-veo-text-response.local.json
```

这些文件会被 `.gitignore` 忽略。不要把真实 token、cookie、session、captcha token 写进可提交文件。
