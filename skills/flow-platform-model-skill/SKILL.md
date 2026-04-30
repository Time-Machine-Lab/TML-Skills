---
name: google-flow-interface-research
description: 当需要系统调研 Google Flow / aisandbox / Labs 上的模型接口时使用本 skill，包括 VEO 3.1、Nano-Banana、Imagen 等模型的认证、session/token、projectId、recaptcha、请求参数、模型参数映射、响应结构、轮询逻辑、错误码和可复现实验记录。目标是产出完整 Google Flow 接口调研文档，而不是迁移脚本。
metadata:
  short-description: 调研 Google Flow 模型接口与参数
---

# Google Flow 接口调研

这个 skill 只面向 Google Flow / aisandbox / Labs 这一套链路。不要把第三方聚合平台或非 Google Flow 的实现混入本 skill。

## 目录用途

- `references/model-master-flow-api-research.md`：从旧项目抽取的 Google Flow/aisandbox 基础事实，包括 endpoint、认证、请求/响应、错误处理。
- `references/model-parameter-matrix.md`：按 Google Flow 模型和生成模式整理参数传递规则，是继续调研时最重要的工作表。
- `references/recaptcha-provider.md`：一次性 recaptcha v3 的服务抽象、Capsolver 请求、feedback、预解 token 池和脚本配置方式。
- `references/research-workflow.md`：Google Flow 调研流程，包含旧项目追链路、浏览器抓包、接口实验、响应归档到结论沉淀的步骤。
- `references/high-availability-notes.md`：旧项目账号池、recaptcha、token/cookie、重试和错误处理的高可用要点。
- `references/capture-template.md`：每次验证接口时复制使用的记录模板。
- `secrets/`：本地 Google token、cookie、projectId、recaptcha token、session 存放区；真实文件不提交。
- `sessions/`：本地抓包、请求样本、响应样本、实验输出存放区；真实实验文件不提交。
- `scripts/`：Google-only 辅助探针脚本，只用于验证推断，不是本 skill 的主产物。

## 调研原则

1. 只调研 Google Flow 相关接口：`aisandbox-pa.googleapis.com`、`labs.google/fx`、Flow 项目、Flow 生图、VEO 视频、上传图片、状态查询。
2. 先找旧项目证据：定位 controller -> service -> task consumer/worker -> GoogleAIService -> GoogleAIClient -> req/resp DTO -> constants。
3. 每个模型都要拆成“产品入参”和“Google 平台接口入参”两层，不要混在一起。
4. 每个结论都写来源：源码文件、行号附近方法、抓包文件或实际响应样本。
5. 不确定的字段标记为“待验证”，不要把推断写成事实。
6. token、cookie、session、recaptcha token 只放 `secrets/` 或 `sessions/` 的 local 文件，不能写进 reference 文档。

## 账号与 Session

真实账号文件：

```text
docs/other/flow-platform-model-skill/secrets/accounts.local.json
```

复制模板：

```bash
cp docs/other/flow-platform-model-skill/secrets/accounts.example.json \
   docs/other/flow-platform-model-skill/secrets/accounts.local.json
```

Google Flow/aisandbox 需要重点记录：

- `google_ai_token`：旧项目 `other_account.token`，用于 `Authorization`。
- `google_ai_cookie`：旧项目 `other_account.cookie`，用于 Labs/TRPC。
- `project_id`：旧项目 `other_account.extraData.projectId`。
- `recaptcha_token`：短有效期 token，仅用于单次或短时间实验。
- `user_agent`：recaptcha 服务返回时要同步带上。
- `captcha`：可配置验证码服务；优先参考 `references/recaptcha-provider.md`。

实验请求、响应、抓包样本放：

```text
docs/other/flow-platform-model-skill/sessions/
```

建议按日期命名，例如 `sessions/2026-04-30-google-flow-nano-banana-2.local.json`。

## 标准产出

一次完整调研至少要更新：

- `references/model-parameter-matrix.md`：补齐 Google Flow 模型、模式、参数、默认值、限制、映射。
- `references/model-master-flow-api-research.md`：补齐 Google endpoint、请求体、响应体、错误码、轮询。
- `sessions/*.local.*`：保存本地实验记录或抓包摘要。

最终回答用户时，优先说明：

- 已确认的 Google Flow 接口和参数。
- 仍待验证的字段。
- 每个 Google 模型的可用生成模式。
- Google 账号/session/recaptcha 使用方式。
- 风险：recaptcha 短有效期、token/cookie 过期、Google 接口非官方稳定性。

## 快速入口

需要继续调研某个模型时，先读：

```text
references/research-workflow.md
references/model-parameter-matrix.md
references/high-availability-notes.md
references/recaptcha-provider.md
```

需要验证推断时，才使用 `scripts/generate_image.py` 或 `scripts/generate_video.py`。脚本只支持 Google Flow/Google VEO，读取 `secrets/accounts.local.json`，支持 `--account-profile` 选择账号。
