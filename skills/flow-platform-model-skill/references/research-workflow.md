# Google Flow 接口调研流程

本流程只用于继续调研 Google Flow / aisandbox / Labs 相关模型接口，目标是形成“每个 Google 模型、每种生成模式、每个参数如何传递”的完整文档。

## 1. 明确调研范围

只覆盖这些 Google 链路：

- Google Flow 生图：`Nano-Banana`、`Nano-Banana-Pro`、`Nano-Banana-2`、`imagen4`。
- Google aisandbox 直连 VEO：`veo3.1-fast`、`veo3.1-pro` 的文生视频、图生视频、首尾帧、参考图。
- Google Labs / Flow 项目接口：项目创建、图片上传、Flow workflow/media 相关接口。
- 账号/session/recaptcha：token、cookie、projectId、userAgent、recaptcha token 的来源和有效期。

不覆盖第三方聚合平台接口。

## 2. 从旧项目追代码链路

推荐搜索顺序：

```bash
rg -n "flowGenerateImage|GoogleAIService|GoogleAIClient|batchAsync|uploadUserImage|VEO3TaskConsumer|FlowImageTaskConsumer|Nano-Banana|VEOModelKeyUtil" /Users/mac/Code/ModelMaster/model-master-app/src/main/java
```

必须追到这些层：

1. 外部产品请求：`model/req/*Req.java`
2. 产品服务：`AIImageService`、`AIVideoService`
3. 任务参数：`ImageGenerateTaskParams`、`VideoGenerateTaskParams`
4. Google worker/consumer：`FlowImageTaskConsumer`、`VEO3TaskConsumer`
5. Google service/client：`GoogleAIService`、`GoogleAIClient`
6. Google DTO：`model/req/flowmedia`、`model/resp/flowmedia`、`model/req/veo3`、`model/resp/veo3`
7. 常量映射：`ModelMasterConstant`、`VEOModelKeyUtil`

记录每条链路时，用这种格式：

```text
产品模型: Nano-Banana-2
产品模式: text / image
入口 req: GenerateImageReq
业务字段: prompt, model, aspectRatio, genType, imageInfos
平台: FlowImage -> GoogleAIService.flowGenerateImage
Google endpoint: POST /v1/projects/{projectId}/flowMedia:batchGenerateImages
核心映射: model Nano-Banana-2 -> imageModelName NARWHAL
证据: GoogleAIService.packageFlowGenerateImageRequest
```

## 3. 拆分产品参数和 Google 平台参数

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

Google 平台参数指真正发给 Google Flow/aisandbox/Labs 的字段，例如：

- `imageModelName`
- `imageAspectRatio`
- `structuredPrompt`
- `imageInputs`
- `videoModelKey`
- `clientContext`
- `recaptchaContext`
- `requests[].startImage`
- `requests[].referenceImages`
- `projectId`
- `sessionId`

文档里必须说明产品参数如何映射到 Google 平台参数。

## 4. 保存实验记录

真实请求/响应样本放到 `sessions/`，不要放到 reference 文档。建议复制：

```text
references/capture-template.md
```

保存为：

```text
sessions/YYYY-MM-DD-google-flow-模型-模式.local.md
sessions/YYYY-MM-DD-google-veo-模型-模式.local.json
```

每条实验至少记录：

- 账号 profile 名称，不写真实 token。
- endpoint 和 method。
- 请求体，token/cookie/recaptcha 打码。
- HTTP 状态码。
- 响应体关键字段。
- 是否成功生成。
- 失败 reason。
- 与旧项目推断是否一致。

## 5. 浏览器抓包建议

如果需要补齐 Google Flow 官方前端真实参数：

1. 使用浏览器登录 `labs.google/fx` 或实际 Flow 页面。
2. 打开开发者工具 Network。
3. 分别执行文生图、图生图、文生视频、图生视频、首尾帧、参考图。
4. 过滤关键词：
   - `flowMedia:batchGenerateImages`
   - `uploadImage`
   - `batchAsyncGenerateVideo`
   - `batchCheckAsyncVideoGenerationStatus`
   - `project.createProject`
5. 保存 HAR 或摘录请求/响应到 `sessions/`。

不要把 Cookie、Authorization、recaptcha token 写入可提交文件。

## 6. 更新参数矩阵

每次确认一个字段，都更新 `model-parameter-matrix.md`：

- 字段名
- 是否必填
- 默认值
- 支持枚举
- 产品层来源
- Google 平台层字段
- 证据来源
- 待验证点

## 7. 完成标准

一个 Google 模型算“调研完成”需要满足：

- 至少有一条成功请求或旧项目线上成功证据。
- 文生/图生/首尾帧/参考图等支持模式已经明确。
- 所有必填字段明确。
- 默认值和枚举值明确。
- 成功响应字段和失败响应字段明确。
- 轮询策略明确。
- 账号/session/recaptcha 要求明确。
- 未确认字段列入待验证清单。
