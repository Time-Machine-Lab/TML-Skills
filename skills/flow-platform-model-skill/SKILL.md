---
name: flow-platform-model-skill
description: 使用 Flow 平台生成图片、视频或其他多模态媒体时使用本 skill。它提供可直接执行的生成能力，包括账号/session/token/captcha 配置、Google Flow 图片生成、Google VEO 视频生成、参考图上传、异步任务轮询、结果下载、错误处理和重试。当前内置 Google Flow / aisandbox / Labs 的 Nano-Banana、Imagen、VEO 3.1 调用能力，可按同一结构扩展更多 Flow 平台模型。
metadata:
  short-description: 使用 Flow 平台生成图片和视频
---

# Flow 平台生成能力

这个 skill 的目标是直接完成 Flow 平台媒体生成：根据用户需求选择模型、准备账号与验证码、调用生成脚本、轮询任务、下载结果并返回可用产物。接口资料和参数矩阵只是支撑材料，不是主要产出。

当前已内置 provider：Google Flow / aisandbox / Labs。

## 目录用途

- `scripts/generate_image.py`：通过 Google Flow 生成图片，支持文生图、参考图上传、自动 recaptcha、结果下载。
- `scripts/generate_video.py`：通过 Google VEO 提交/轮询视频任务，支持文生视频、图生视频、首尾帧、参考图、自动 recaptcha、结果下载。
- `scripts/flow_platform_client.py`：Google Flow/VEO API 客户端、模型 key 映射和通用下载工具。
- `scripts/flow_generation_runtime.py`：生成脚本共享运行层，负责加载账号、解析 projectId、创建 Google client、构建验证码 provider。
- `scripts/captcha_service.py`：独立验证码接口层，负责获取 token、返回 userAgent、反馈成功/失败和切换 provider。
- `scripts/test_captcha.py`：只验证验证码 provider，不触发图片/视频生成；默认打码输出 token。
- `secrets/`：本地账号、token、cookie、projectId、captcha provider 配置；真实文件不提交。
- `sessions/`：本地生成记录、请求/响应样本、下载结果索引；真实调用文件不提交。
- `references/model-parameter-matrix.md`：模型、生成模式、参数、默认值、内部 model key 和待验证字段。
- `references/high-availability-notes.md`：账号池、限流、验证码、token/cookie、重试和错误处理策略。
- `references/recaptcha-provider.md`：Google Flow recaptcha v3 / Capsolver / feedback / 预解 token 池。
- `references/google-flow-api-reference.md`：旧项目抽取出的 Google Flow / aisandbox / Labs 接口事实。
- `references/capability-extension-workflow.md`：当需要新增 provider 或补齐未知模型能力时使用的能力补全流程。
- `references/capture-template.md`：生成调用记录模板。

## 默认工作流

1. 判断用户要生成图片还是视频，并确认模型、prompt、比例、参考图、输出目录。
2. 读取 `secrets/accounts.local.json`；如果不存在，提示用户先复制 `secrets/accounts.example.json` 并填写账号。
3. 图片任务使用 `scripts/generate_image.py`；视频任务使用 `scripts/generate_video.py`。
4. 生成脚本通过 `flow_generation_runtime.py` 构建 Google client 和 captcha provider，再调用 `captcha_service.py` 获取一次性 token；图片/视频逻辑不关心 token 来自哪个验证码平台。当前 provider 支持 `capsolver`。
5. 视频生成拿到 operation 后，按需求使用 `--poll` 轮询到完成。
6. 如果用户需要本地文件，传 `--output-dir sessions/<date>-<task>.local-output/` 下载生成结果。
7. 失败时根据错误类型处理：token/cookie 过期要求换账号；403 类验证码失败会自动反馈并重试；限流建议换 profile 或等待冷却。

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
- `google_ai_cookie`：Labs/TRPC cookie，创建 project 时使用。
- `project_id`：Flow projectId。
- `is_fast`：Google VEO fast 账号会影响 model key。

验证码 provider 单独配置在 `secrets/captcha.local.json`。短有效期 `recaptcha_token` 不写入配置文件；临时调试时才用 `--recaptcha-token` 或 `GOOGLE_RECAPTCHA_TOKEN`。

真实 token、cookie、captcha key 只能放 `secrets/*.local.json` 或环境变量里，不要写进 reference。

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
  --aspect-ratio 1:1 \
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

常用图片模型：

- `Nano-Banana`
- `Nano-Banana-Pro`
- `Nano-Banana-2`
- `imagen4`

详细字段看 `references/model-parameter-matrix.md`。

## 视频生成

文生视频示例：

```bash
python3 scripts/generate_video.py \
  --account-profile google-flow-default \
  --mode text \
  --prompt "a drone shot over a futuristic coastal city at sunrise" \
  --model veo3.1-fast \
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
  --model veo3.1-fast \
  --aspect-ratio 16:9 \
  --image /absolute/path/start-frame.png \
  --poll \
  --output-dir sessions/google-veo-video.local-output
```

支持模式：

- `text`：文生视频。
- `image`：首帧图生视频。
- `first_last_frames`：首尾帧视频，需要传两张 `--image`。
- `reference_image`：参考图视频，可重复传 `--image`。

可用模型 key 和模式限制看 `references/model-parameter-matrix.md`。

## 结果返回

完成生成后，返回用户：

- 使用的 profile、provider、模型、模式、比例。
- 输出文件路径，优先给本地绝对路径。
- Google 原始响应里的关键 ID：`media.name`、`workflowId`、`operation.name`、`mediaGenerationId`。
- 如果失败，返回 HTTP 状态、reason、是否验证码问题、是否 token/cookie 过期、是否账号限流。

## 需要补能力时

只有当脚本不支持用户要的模型/模式时，才进入接口补全流程：

1. 阅读 `references/model-parameter-matrix.md` 找已有映射。
2. 阅读对应 provider reference 和 `references/capability-extension-workflow.md`。
3. 补齐脚本、参数矩阵、错误处理和一条 `sessions/*.local.*` 调用记录。
