# Flow 平台生成能力补全流程

本流程只在当前脚本还不支持用户所需 provider、模型或生成模式时使用。目标是把缺失能力补成可直接调用的脚本能力，而不是只产出接口文档。

## 1. 明确能力缺口

开始补能力前先明确这些边界：

- provider：例如 `google-flow`。
- 产品模型名：业务侧或页面上看到的模型名。
- 平台内部模型名：真正发给接口的 model key / model name。
- 生成能力：文生图、图生图、文生视频、图生视频、首尾帧、参考图、轮询、上传、下载。
- 认证/session：token、cookie、projectId、workspaceId、sessionId、captcha、userAgent。
- 运行策略：账号池、限流、冷却、验证码刷新、错误重试、资源下载。

当前已内置的 provider：

- Google Flow 生图：`Nano-Banana`、`Nano-Banana-Pro`、`Nano-Banana-2`、`imagen4`。
- Google aisandbox 直连 VEO：`veo3.1-fast`、`veo3.1-pro` 的文生视频、图生视频、首尾帧、参考图。
- Google Labs / Flow 项目接口：项目创建、图片上传、Flow workflow/media 相关接口。

## 2. 从旧项目追调用链路

通用追踪顺序：

1. 外部产品请求：`model/req/*Req.java`、controller 入参、前端调用参数。
2. 产品服务：业务 service、orchestrator、tool handler。
3. 任务参数：task params、queue payload、worker message。
4. provider worker/consumer：图片、视频、轮询、下载 worker。
5. provider service/client：真正发 HTTP 的 client。
6. provider DTO：请求 DTO、响应 DTO、错误 DTO。
7. 常量映射：模型名、比例、模式、状态、错误码。

Google Flow 当前推荐搜索：

```bash
rg -n "flowGenerateImage|GoogleAIService|GoogleAIClient|batchAsync|uploadUserImage|VEO3TaskConsumer|FlowImageTaskConsumer|Nano-Banana|VEOModelKeyUtil" /Users/mac/Code/ModelMaster/model-master-app/src/main/java
```

记录每条链路时，用这种格式，后续要落到脚本参数和调用实现：

```text
provider: google-flow
产品模型: Nano-Banana-2
产品模式: text / image
入口 req: GenerateImageReq
业务字段: prompt, model, aspectRatio, genType, imageInfos
平台链路: FlowImage -> GoogleAIService.flowGenerateImage
provider endpoint: POST /v1/projects/{projectId}/flowMedia:batchGenerateImages
核心映射: model Nano-Banana-2 -> imageModelName NARWHAL
证据: GoogleAIService.packageFlowGenerateImageRequest
```

## 3. 拆分产品参数和平台参数

每个模型都要拆两层。

产品参数指用户或业务系统传入的字段，例如：

- `prompt`
- `model`
- `aspectRatio` / `videoAspectRatio`
- `genType`
- `imageInfos`
- `duration`
- `resolution`
- `number`
- `workSpaceId`

平台参数指真正发给 provider API 的字段，例如：

- 模型字段：`imageModelName`、`videoModelKey`、`model`。
- 画幅/时长/清晰度字段：`imageAspectRatio`、`aspectRatio`、`duration`、`resolution`。
- 输入字段：`prompt`、`structuredPrompt`、`imageInputs`、`startImage`、`endImage`、`referenceImages`。
- 认证/session 字段：`clientContext`、`recaptchaContext`、`projectId`、`sessionId`。
- 异步字段：`operation.name`、`mediaGenerationId`、`status`。

能力补全时必须说明产品参数如何映射到平台参数，并把映射落到脚本参数或客户端函数里，不能只贴最终 JSON。

## 4. 保存调用记录

真实请求/响应样本放到 `sessions/`，不要放到 reference 文档。建议复制：

```text
references/capture-template.md
```

保存为：

```text
sessions/YYYY-MM-DD-provider-模型-模式.local.md
sessions/YYYY-MM-DD-provider-模型-模式.local.json
```

每条调用记录至少记录：

- provider。
- 账号 profile 名称，不写真实 token。
- endpoint 和 method。
- 请求体，token/cookie/captcha 打码。
- HTTP 状态码。
- 响应体关键字段。
- 是否成功生成。
- 失败 reason。
- 与脚本实现是否一致。

## 5. 浏览器抓包补能力

如果脚本缺少某个参数或模式，需要补齐前端真实参数：

1. 使用浏览器登录对应 Flow 平台页面。
2. 打开开发者工具 Network。
3. 分别执行目标生成模式：文生图、图生图、文生视频、图生视频、首尾帧、参考图等。
4. 根据 provider 过滤关键词。Google Flow 可用：
   - `flowMedia:batchGenerateImages`
   - `uploadImage`
   - `batchAsyncGenerateVideo`
   - `batchCheckAsyncVideoGenerationStatus`
   - `project.createProject`
5. 保存 HAR 或摘录请求/响应到 `sessions/`。

不要把 Cookie、Authorization、captcha token 写入可提交文件。

## 6. 更新参数矩阵和脚本

每次确认一个字段，都同步更新 `model-parameter-matrix.md` 和对应脚本：

- provider
- 产品模型名
- 平台内部模型名
- 生成模式
- 字段名
- 是否必填
- 默认值
- 支持枚举
- 产品层来源
- 平台层字段
- 证据来源
- 待验证点

脚本侧至少补齐：

- CLI 参数。
- 请求体组装。
- captcha/session 处理。
- 成功响应解析。
- 失败响应解析。
- 轮询和下载逻辑。

## 7. 完成标准

一个模型算“可用”需要满足：

- 至少有一条成功调用或旧项目线上成功证据。
- 文生/图生/首尾帧/参考图等支持模式已经明确。
- 所有必填字段明确。
- 默认值和枚举值明确。
- 成功响应字段和失败响应字段明确。
- 轮询策略明确。
- 账号/session/captcha 要求明确。
- 限流、重试、账号状态、资源下载策略明确。
- 用户可以通过 `scripts/generate_image.py`、`scripts/generate_video.py` 或新增脚本直接调用。
