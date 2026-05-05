---
name: flow-platform-model-skill
description: 使用 Flow 平台生成图片、视频或其他多模态媒体时使用本 skill。它提供可直接执行的生成能力，包括账号/session/token/captcha 配置、Google Flow 图片生成、Google VEO 视频生成、参考图上传、异步任务轮询、结果下载、错误处理和重试。当前内置 Google Flow / aisandbox / Labs 的 Nano-Banana、Imagen、VEO 3.1 调用能力，可按同一结构扩展更多 Flow 平台模型。
metadata:
  short-description: 使用 Flow 平台生成图片和视频
---

# Flow 平台生成能力

这个 skill 的目标是直接完成 Flow 平台媒体生成：根据用户需求选择模型、准备账号与验证码、调用生成脚本、轮询任务、下载结果并返回可用产物。接口资料和参数矩阵只是支撑材料，不是主要产出。

当前已内置 provider：Google Flow / aisandbox / Labs。

默认偏好：图片生成优先用 `Nano-Banana-2`；视频生成只使用 `veo3.1-quality`（Google key 对应 Quality/Pro 这一档）。如果用户要求高价/Pro 图片模型，用 `Nano-Banana-Pro`。旧 `Nano-Banana` 可保留兼容，但当前不作为默认推荐。

## 目录用途

- `scripts/generate_image.py`：通过 Google Flow 生成图片，支持文生图、参考图上传、自动 recaptcha、结果下载。
- `scripts/generate_video.py`：通过 Google VEO 提交/轮询单个视频任务，支持文生视频、图生视频、首尾帧、自动 recaptcha、结果下载。
- `scripts/flow_platform_client.py`：Google Flow/VEO API 客户端、模型 key 映射和通用下载工具。
- `scripts/flow_generation_runtime.py`：生成脚本共享运行层，负责加载账号、解析 projectId、创建 Google client、构建验证码 provider。
- `scripts/captcha_service.py`：独立验证码接口层，负责获取 token、返回 userAgent、反馈成功/失败和切换 provider。
- `scripts/test_captcha.py`：只验证验证码 provider，不触发图片/视频生成；默认打码输出 token。
- `scripts/check_labs_session.py`：用 Labs cookie 调 `/fx/api/auth/session`，检查 session、提取 access token、可写回账号配置。
- `scripts/create_labs_project.py`：用 Labs cookie 调 `project.createProject`，给新登录账号创建 Flow 工作区，可写回 `project_id`。
- 生成脚本失败时会打印 `error_classification=...`，用于判断是否刷新 token、重登 cookie、切换账号、重试验证码或修正参数。
- `secrets/`：本地账号、token、cookie、projectId、captcha provider 配置；真实文件不提交。
- `sessions/`：本地生成记录、请求/响应样本、下载结果索引；真实调用文件不提交。
- `references/model-parameter-matrix.md`：模型、生成模式、参数、默认值、内部 model key 和待验证字段。
- `references/high-availability-notes.md`：profile 轮换、限流、验证码、token/cookie、重试和错误处理策略。
- `references/recaptcha-provider.md`：Google Flow recaptcha v3 / Capsolver / feedback / 预解 token 池。
- `references/google-flow-api-reference.md`：旧项目抽取出的 Google Flow / aisandbox / Labs 接口事实。
- `references/capability-extension-workflow.md`：当需要新增 provider 或补齐未知模型能力时使用的能力补全流程。
- `references/capture-template.md`：生成调用记录模板。

## 默认工作流

1. 判断用户要生成图片还是视频，并确认模型、prompt、比例、参考图、输出目录。
2. 读取 `secrets/accounts.local.json`；如果不存在，提示用户先复制 `secrets/accounts.example.json` 并填写账号。
3. 如果新账号没有 `project_id`，先用 `scripts/create_labs_project.py --update-account --update-cookie` 创建 Flow 工作区。
4. 图片任务使用 `scripts/generate_image.py`；视频任务使用 `scripts/generate_video.py`。
5. 生成脚本通过 `flow_generation_runtime.py` 构建 Google client 和 captcha provider，再调用 `captcha_service.py` 获取一次性 token；图片/视频逻辑不关心 token 来自哪个验证码平台。当前 provider 支持 `capsolver`。
6. 视频生成拿到 operation 后，按需求使用 `--poll` 轮询到完成。
7. 如果用户需要本地文件，传 `--output-dir sessions/<date>-<task>.local-output/` 下载生成结果。
8. 失败时根据错误类型处理：token/cookie 过期先刷新凭证；403 类验证码失败会自动反馈并重试；限流建议换 profile 或按本地策略冷却。

## 健康检查和恢复策略

本 skill 不维护业务账号状态，也不输出旧系统里的持久化状态。脚本只输出通用的 Flow 调用错误分类，外层编排可根据 `profile_action` 自行决定是否刷新凭证、切换 profile、冷却或人工处理。

常见分类：

- `TOKEN_EXPIRED`：aisandbox `Authorization` 过期；用 `scripts/check_labs_session.py --update-account --update-cookie` 刷新，刷新失败再切换 profile。
- `COOKIE_EXPIRED`：Labs cookie 过期；需要重新登录获取 `google_ai_cookie`，或切换 profile。
- `PUBLIC_ERROR_USER_REQUESTS_THROTTLED`、HTTP `429`、`RESOURCE_EXHAUSTED`：当前 profile 请求过频；换 profile 或按本地策略冷却。
- HTTP `403`、`PUBLIC_ERROR_SOMETHING_WENT_WRONG`、`PUBLIC_ERROR_UNUSUAL_ACTIVITY`：验证码或风控门禁；重新取一次性 recaptcha token 重试，持续失败再切换 profile/网络环境。
- 内容安全类 reason：修改 prompt 或输入素材，不惩罚 profile，也不计入 provider 可用性失败。
- HTTP `400` / `INVALID_ARGUMENT`：参数错误；检查模型 key、比例、batch 是否混模型、参考图 mediaId 类型。

只检查 Labs session 和 access token 过期时间：

```bash
python3 scripts/check_labs_session.py \
  --account-profile google-flow-default \
  --update-account \
  --update-cookie
```

生成脚本失败时关注 stderr 里的 `error_classification`，不要只看原始 HTTP body。关键字段：

- `category`：错误类别。
- `profile_action`：建议对当前 profile 做什么，例如刷新 token、重登 cookie、冷却/切换、无需处理。
- `retryable` / `retry_scope`：是否可以自动重试，以及重试范围。
- `recovery_action`：给 agent 或外层编排看的恢复动作。
- `provider_health_failure`：是否应计为 Flow/provider 可用性问题。

## 账号配置

真实账号文件：

```text
secrets/accounts.local.json
```

初始化：

```bash
cp secrets/accounts.example.json secrets/accounts.local.json
```

每个 profile 至少关注：

- `provider`：当前为 `google-flow`。
- `google_ai_token`：aisandbox `Authorization`。
- `google_ai_cookie`：Labs 完整 Cookie header，可用于 `/fx/api/auth/session` 刷新 `google_ai_token`，也给 Labs/TRPC 使用。
- `token_expires`：`/fx/api/auth/session` 返回的 access token 过期时间。
- `project_id`：Flow projectId。
- `is_fast`：Google VEO fast 账号会影响 model key。

验证码 provider 单独配置在 `secrets/captcha.local.json`。短有效期 `recaptcha_token` 不写入配置文件；临时调试时才用 `--recaptcha-token` 或 `GOOGLE_RECAPTCHA_TOKEN`。

真实 token、cookie、captcha key 只能放 `secrets/*.local.json` 或环境变量里，不要写进 reference。

如果账号里有 `google_ai_cookie`，优先用下面命令检查并刷新 `google_ai_token`：

```bash
python3 scripts/check_labs_session.py \
  --account-profile google-flow-default \
  --update-account \
  --update-cookie
```

该脚本默认只打印打码 token 和过期时间；`--update-cookie` 会把响应 `Set-Cookie` 合并回 `google_ai_cookie`。

## Flow 工作区创建

新登录账号可能还没有 Flow 工作区，图片和视频生成都需要 `project_id`。这时先调用 Labs TRPC 创建项目：

```bash
python3 scripts/create_labs_project.py \
  --account-profile google-flow-default \
  --title "5月06日 01:49" \
  --update-account \
  --update-cookie
```

脚本调用：

```text
POST https://labs.google/fx/api/trpc/project.createProject
```

请求体固定结构：

```json
{
  "json": {
    "projectTitle": "项目标题",
    "toolName": "PINHOLE"
  }
}
```

成功后会输出 `project_id`、`project_title`、`status`，不会输出 Cookie。传 `--update-account` 会写回当前 profile 的 `project_id` 和 `project_title`；传 `--update-cookie` 会把响应 `Set-Cookie` 合并回 `google_ai_cookie`。

## 验证码接口

验证码能力由 `scripts/captcha_service.py` 独立提供。图片/视频生成脚本只依赖这个接口：

```text
provider = build_captcha_provider(...)
run_with_captcha(provider, pageAction, call, is_retryable_error)
```

调用流程：

1. 生成脚本传入 pageAction：图片是 `IMAGE_GENERATION`，视频是 `VIDEO_GENERATION`。
2. `captcha_service.py` 每次生成前动态获取一次性 token。
3. 返回 `CaptchaSolution.token` 和 `CaptchaSolution.user_agent`。
4. 生成脚本把 token 写入 Google 请求，把 userAgent 放到 header。
5. 生成成功后 feedback `solved=true`；403 类失败后 feedback `solved=false` 并重新取 token 重试。

新增验证码平台时，只新增 `CaptchaProvider` 实现和 provider 构建逻辑，图片/视频生成脚本不改业务逻辑。

只验证验证码服务：

```bash
python3 scripts/test_captcha.py --action image --feedback true
```

这个脚本默认只打印 token 长度和打码后的前后缀；不要把完整 token 写入聊天、文档或配置文件。

## 图片生成

文生图示例：

```bash
python3 scripts/generate_image.py \
  --account-profile google-flow-default \
  --prompt "a cinematic product photo of a red electric bicycle" \
  --model Nano-Banana-2 \
  --aspect-ratio 4:3 \
  --output-dir sessions/google-flow-image.local-output
```

参考图生成示例：

```bash
python3 scripts/generate_image.py \
  --account-profile google-flow-default \
  --prompt "turn this sketch into a polished product render" \
  --model Nano-Banana-2 \
  --aspect-ratio 1:1 \
  --image /absolute/path/reference.png \
  --output-dir sessions/google-flow-image.local-output
```

同模型批量生成示例：

```bash
python3 scripts/generate_image.py \
  --account-profile google-flow-default \
  --model Nano-Banana-2 \
  --prompt "a red cube on a white background" \
  --prompt "a blue sphere on a white background" \
  --aspect-ratio 1:1 \
  --aspect-ratio 3:4 \
  --output-dir sessions/google-flow-image-batch.local-output
```

同一个 prompt 生成多张：

```bash
python3 scripts/generate_image.py \
  --account-profile google-flow-default \
  --model Nano-Banana-2 \
  --prompt "a clean product render of a yellow robot" \
  --aspect-ratio 1:1 \
  --count 4
```

常用图片模型：

- `Nano-Banana`
- `Nano-Banana-Pro`
- `Nano-Banana-2`
- `imagen4`

详细字段看 `references/model-parameter-matrix.md`。

已确认图片比例和响应尺寸：`16:9 -> 1376x768`、`4:3 -> 1200x896`、`1:1 -> 1024x1024`、`3:4 -> 896x1200`、`9:16 -> 768x1376`。

Batch 规则：

- 单次 batch 最多 4 条，和 Flow UI 的 x1-x4 对齐。
- 同一个 batch 可以混合同一模型的不同 prompt / seed / aspectRatio。
- 同一个 batch 不能混不同图片模型；不同模型必须拆分请求并重新取验证码。
- 本地并发验证：3 条同模型 batch 的 workflow `createTime` 相差约 20ms，共享同一个 `batchId`，说明是同批并发提交；各 workflow 独立完成。

复杂 batch 文件示例：

```json
{
  "requests": [
    {"prompt": "a ruby red glass cube on white", "aspect_ratio": "1:1"},
    {"prompt": "a cobalt blue matte sphere on white", "aspect_ratio": "3:4"},
    {"prompt": "an emerald green triangular pyramid on white", "aspect_ratio": "4:3"}
  ]
}
```

调用：

```bash
python3 scripts/generate_image.py \
  --account-profile google-flow-default \
  --model Nano-Banana-2 \
  --batch-file /absolute/path/batch.json \
  --output-dir sessions/google-flow-image-batch.local-output \
  --response-file sessions/google-flow-image-batch.local.json
```

提示词建议：每条 prompt 尽量明确主体、颜色/材质、构图、背景、光照和是否需要文字。批量验证时使用差异明显的对象和颜色，便于确认结果没有串 prompt。

## 视频生成

文生视频示例：

```bash
python3 scripts/generate_video.py \
  --account-profile google-flow-default \
  --mode text \
  --prompt "a drone shot over a futuristic coastal city at sunrise" \
  --model veo3.1-quality \
  --aspect-ratio 16:9 \
  --poll \
  --output-dir sessions/google-veo-video.local-output
```

图生视频示例：

```bash
python3 scripts/generate_video.py \
  --account-profile google-flow-default \
  --mode image \
  --prompt "animate the character walking through a neon street" \
  --model veo3.1-quality \
  --aspect-ratio 16:9 \
  --image /absolute/path/start-frame.png \
  --poll \
  --output-dir sessions/google-veo-video.local-output
```

支持模式：

- `text`：文生视频。
- `image`：首帧图生视频。
- `first_last_frames`：首尾帧视频，需要传两张 `--image`，或直接传 `--start-media-id` / `--end-media-id`。

首尾帧示例：

```bash
python3 scripts/generate_video.py \
  --account-profile google-flow-default \
  --mode first_last_frames \
  --model veo3.1-quality \
  --aspect-ratio 16:9 \
  --prompt "小狗狗在台子上玩耍，然后跳到另一侧" \
  --image /absolute/path/start-frame.png \
  --image /absolute/path/end-frame.png \
  --poll \
  --output-dir sessions/google-veo-first-last.local-output
```

当前主路径只使用 `veo3.1-quality`。比例只暴露 `16:9` 和 `9:16`。Flow UI 有 4s / 6s / 8s 时长选项，但当前 direct VEO payload 不发送时长字段；`durationSeconds` 已实测会被 Google 拒绝。

视频不要作为默认能力依赖 batch。虽然 Google VEO 底层 endpoint 名称是 `batchAsync...`，但本 skill 的 `generate_video.py` 每次只提交一个 `requests[]`：

- 每个视频任务独立获取 recaptcha token，独立生成 `batchId`，独立轮询 operation。
- 多个视频请由外层循环多次调用 `generate_video.py`，不要把不同 prompt、比例、首尾帧塞进同一个视频请求。
- 实测同 batch 混合 `16:9` 和 `9:16` 可能被服务端按同一比例/同一 model key 处理，容易造成结果和请求不一致。
- 同比例、同 model key 的视频 batch 曾实测可用，但会增加参数耦合和排障成本；本 skill 不把它作为公开工作流。

可用模型 key 和模式限制看 `references/model-parameter-matrix.md`。

## 结果返回

完成生成后，返回用户：

- 使用的 profile、provider、模型、模式、比例。
- 输出文件路径，优先给本地绝对路径。
- Google 原始响应里的关键 ID：`media.name`、`workflowId`、`operation.name`、`mediaGenerationId`。
- 如果失败，返回 HTTP 状态、reason、`error_classification` 和建议的 `profile_action` / `recovery_action`。

## 需要补能力时

只有当脚本不支持用户要的模型/模式时，才进入接口补全流程：

1. 阅读 `references/model-parameter-matrix.md` 找已有映射。
2. 阅读对应 provider reference 和 `references/capability-extension-workflow.md`。
3. 补齐脚本、参数矩阵、错误处理和一条 `sessions/*.local.*` 调用记录。
