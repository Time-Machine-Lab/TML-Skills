# Google Flow 模型参数矩阵

本文件是 Google Flow 调研主表。每次新增模型、接口、抓包证据或实验结果，都优先更新这里。

状态标记：

- `已确认`：旧项目源码和实际调用逻辑都能支撑。
- `待验证`：源码有迹象，但还没有真实请求/响应确认。
- `推断`：根据命名、旧代码或相邻模型推出来，必须后续验证。

## 1. Google Flow 图片模型

### 1.1 产品入口参数

入口类：`GenerateImageReq`

| 字段 | 必填 | 说明 | 旧项目约束 |
| --- | --- | --- | --- |
| `prompt` | 部分模式必填 | 提示词 | DTO 未强制 `@NotBlank`，但生成通常需要 |
| `model` | 是 | 产品模型名 | Google Flow 路径包含 `Nano-Banana`、`Nano-Banana-Pro`、`Nano-Banana-2`、`imagen4` |
| `aspectRatio` | 是 | 图片比例 | 注释包含 `16:9`、`9:16`、`1:1`、`4:3`、`3:4`；Flow 当前映射只确认 `16:9`、`9:16`、`1:1` |
| `mediaCategory` | 否 | Whisk 分类 | Google Flow 路径未使用 |
| `workSpaceId` | 是 | 工作区 | 业务字段，不传 Google |
| `genType` | 是 | `text` 或 `image` | `FlowImageTaskConsumer` 分发文生图/图生图 |
| `imageInfos` | 图生图必需 | 参考图列表 | 每项包含 base64、mimeType |

产品 API 路径：

| 能力 | Controller path | 平台 |
| --- | --- | --- |
| 文生图 | `/api/ai-service/image/generate` 且 `genType=text` | Google Flow |
| 图生图 | `/api/ai-service/image/generate` 且 `genType=image` | Google Flow |

### 1.2 Google Flow 生图接口

平台：`FlowImage`

Endpoint：

```text
POST https://aisandbox-pa.googleapis.com/v1/projects/{projectId}/flowMedia:batchGenerateImages
```

前置上传参考图：

```text
POST https://aisandbox-pa.googleapis.com/v1/flow/uploadImage
```

上传请求字段：

| 字段 | 必填 | 来源/默认值 |
| --- | --- | --- |
| `clientContext.projectId` | 是 | Google 账号 `projectId` |
| `clientContext.tool` | 是 | `PINHOLE` |
| `imageBytes` | 是 | `ImageInfoDTO.base64` |
| `isUserUploaded` | 是 | `true` |
| `isHidden` | 是 | `false` |
| `mimeType` | 是 | `ImageInfoDTO.mimeType`，为空默认 `image/jpeg` |
| `fileName` | 是 | `png -> upload.png`、`webp -> upload.webp`、其他 -> `upload.jpeg` |

上传响应字段：

| 字段 | 用途 |
| --- | --- |
| `media.name` | 后续传入 `requests[].imageInputs[].name` |
| `media.projectId` | 校验是否同项目 |
| `media.workflowId` | 调研记录 |
| `workflow.name` | 调研记录 |

认证/session：

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `Authorization` | Google 账号 token | aisandbox API |
| `projectId` | `other_account.extraData.projectId` | URL 和 `clientContext.projectId` |
| `recaptcha token` | Capsolver 或浏览器抓包 | `clientContext.recaptchaContext.token` |
| `userAgent` | recaptcha 返回或浏览器 | 旧代码会从 recaptcha 结果透传 |

通用请求字段：

| Google 字段 | 必填 | 来源/默认值 | 说明 |
| --- | --- | --- | --- |
| `clientContext.sessionId` | 是 | `";" + 当前毫秒时间戳` | 旧 DTO 构造函数生成 |
| `clientContext.projectId` | 是 | Google 账号 projectId | Flow 项目 ID |
| `clientContext.recaptchaContext.applicationType` | 是 | `RECAPTCHA_APPLICATION_TYPE_WEB` | 固定 |
| `clientContext.recaptchaContext.token` | 是 | recaptcha token | 短有效期 |
| `clientContext.tool` | 是 | `PINHOLE` | 固定 |
| `requests[].seed` | 是 | 1-6 位随机数 | 旧代码 `RandomUtil.generateRandomSeed(6)` |
| `requests[].imageModelName` | 是 | 见模型映射 | Google 内部模型名 |
| `requests[].imageAspectRatio` | 是 | 见比例映射 | Google 内部比例枚举 |
| `requests[].prompt` | 条件 | 产品 `prompt` | `NARWHAL` 模型会置空 |
| `requests[].structuredPrompt.parts[].text` | 条件 | 产品 `prompt` | `Nano-Banana-2` 使用 |
| `requests[].imageInputs[].name` | 图生图 | `/v1/flow/uploadImage` 返回 `media.name` | 参考图 |
| `requests[].imageInputs[].imageInputType` | 图生图 | `IMAGE_INPUT_TYPE_REFERENCE` | 固定 |
| `useNewMedia` | 是 | `true` | 旧 DTO 默认 |

模型映射：

| 产品模型 | Google `imageModelName` | Prompt 传法 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| `Nano-Banana` | `GEM_PIX` | `prompt` | 已确认 | `GoogleAIService.packageFlowGenerateImageRequest` |
| `Nano-Banana-Pro` | `GEM_PIX_2` | `prompt` | 已确认 | 同上 |
| `Nano-Banana-2` | `NARWHAL` | `structuredPrompt.parts[].text`，`prompt = null` | 已确认 | 同上 |
| `imagen4` | `IMAGEN_3_5` | `prompt` | 已确认但命名待核对 | 同上 |
| 其他 | `IMAGEN_3_5` | `prompt` | 已确认 fallback | 同上 |

比例映射：

| 产品 `aspectRatio` | Google `imageAspectRatio` | 状态 |
| --- | --- | --- |
| `16:9` | `IMAGE_ASPECT_RATIO_LANDSCAPE` | 已确认 |
| `9:16` | `IMAGE_ASPECT_RATIO_PORTRAIT` | 已确认 |
| `1:1` | `IMAGE_ASPECT_RATIO_SQUARE` | 已确认 |
| `4:3` | 待验证 | DTO 注释支持，但 Flow 映射未写 |
| `3:4` | 待验证 | DTO 注释支持，但 Flow 映射未写 |

响应关键字段：

| 字段 | 说明 |
| --- | --- |
| `media[].name` | 生成 media 名称 |
| `media[].workflowId` | 工作流 ID |
| `media[].image.generatedImage.encodedImage` | base64 图片，旧 Flow 路径主要用 `fifeUrl` |
| `media[].image.generatedImage.fifeUrl` | 生成图片下载 URL |
| `media[].image.generatedImage.mediaGenerationId` | 生成 ID |
| `media[].image.generatedImage.seed` | seed |

空响应/失败处理：

| 场景 | 旧项目行为 |
| --- | --- |
| `response == null` 或 `media` 为空 | 抛 `generate image failed` |
| 下载 `fifeUrl` 失败 | 最多重试 3 次 |
| 仍然无可用 URL | 抛 `upload image failed` |

## 2. Google VEO 视频模型

### 2.1 产品入口参数

文生视频入口：`VideoGenerateReq`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `prompt` | 是 | 提示词 |
| `model` | 是 | 产品模型名，Google direct 路径主要是 `veo3.1-fast`、`veo3.1-pro` |
| `videoAspectRatio` | 是 | `16:9` 或 `9:16` 为主 |
| `workSpaceId` | 是 | 业务字段 |
| `number` | 是 | 默认 1，注解限制 1-2，但提示写“大于1”不一致 |
| `genType` | 否 | 业务模式字段 |
| `duration` | 否 | Google direct VEO 旧逻辑未传到平台 |
| `resolution` | 否 | Google direct VEO 旧逻辑未传到平台 |

产品 API 路径：

| 能力 | Controller path |
| --- | --- |
| 文生视频 | `/api/ai-service/video/generate` |
| 图生视频 | `/api/ai-service/video/image-generate` |
| 首尾帧视频 | `/api/ai-service/video/generateVideoStartAndEndImage` |
| 参考图视频 | `/api/ai-service/video/generateVideoReferenceImages` |

图生视频入口：`GenerateVideoByImageReq`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `prompt` | 是 | 提示词 |
| `model` | 是 | 产品模型名 |
| `videoAspectRatio` | 是 | 视频比例 |
| `imageBase64` | 是 | 首帧图片 |
| `mimeType` | 是 | 图片 MIME |

首尾帧入口：`GenerateVideoStartAndEndImageReq`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `startImage.imageBase64` | 是 | 起始帧 |
| `startImage.mimeType` | 是 | 起始帧 MIME |
| `endImage.imageBase64` | 是 | 结束帧 |
| `endImage.mimeType` | 是 | 结束帧 MIME |

参考图入口：`GenerateVideoReferenceImagesReq`

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `referenceImages` | 是 | Google VEO 3.1 fast 旧业务限制 1-3 张 |
| `referenceImages[].imageBase64` | 是 | 参考图 |
| `referenceImages[].mimeType` | 是 | 参考图 MIME |
| `duration` | 否 | Google direct VEO 旧逻辑未传到平台 |

### 2.2 Google aisandbox 直连 VEO

平台：`VEO3`

生成 endpoints：

| 模式 | endpoint |
| --- | --- |
| 文生视频 | `POST /v1/video:batchAsyncGenerateVideoText` |
| 图生视频 | `POST /v1/video:batchAsyncGenerateVideoStartImage` |
| 首尾帧 | `POST /v1/video:batchAsyncGenerateVideoStartAndEndImage` |
| 参考图 | `POST /v1/video:batchAsyncGenerateVideoReferenceImages` |

图片上传：

```text
POST /v1:uploadUserImage
```

图片上传字段：

| 字段 | 必填 | 来源/默认值 |
| --- | --- | --- |
| `imageInput.aspectRatio` | 是 | `16:9 -> IMAGE_ASPECT_RATIO_LANDSCAPE`，`9:16 -> IMAGE_ASPECT_RATIO_PORTRAIT` |
| `imageInput.isUserUploaded` | 是 | `true` |
| `imageInput.mimeType` | 是 | 入口图片 MIME，空则 `image/jpeg` |
| `imageInput.rawImageBytes` | 是 | 图片 base64 |
| `clientContext.sessionId` | 否/待验证 | DTO 有字段但旧构造未赋值 |
| `clientContext.tool` | 是 | `ASSET_MANAGER` |

上传响应：

| 字段 | 用途 |
| --- | --- |
| `mediaGenerationId.mediaGenerationId` | VEO `mediaId` |
| `height` / `width` | 调研记录 |
| `error` | 上传失败记录 |

状态查询：

```text
POST /v1/video:batchCheckAsyncVideoGenerationStatus
```

通用 `clientContext`：

| 字段 | 值 |
| --- | --- |
| `sessionId` | `";" + 当前毫秒时间戳` |
| `projectId` | 账号 projectId，部分请求可为空但建议带上 |
| `recaptchaContext.applicationType` | `RECAPTCHA_APPLICATION_TYPE_WEB` |
| `recaptchaContext.token` | recaptcha token |
| `tool` | `PINHOLE` |
| `userPaygateTier` | `PAYGATE_TIER_TWO` |

通用 `requests[]`：

| 字段 | 必填 | 来源/默认值 |
| --- | --- | --- |
| `aspectRatio` | 是 | `VIDEO_ASPECT_RATIO_LANDSCAPE` 或 `VIDEO_ASPECT_RATIO_PORTRAIT` |
| `seed` | 是 | 1-6 位随机数 |
| `textInput.prompt` | 是 | 产品 prompt |
| `videoModelKey` | 是 | 见下方 model key 表 |
| `metadata.sceneId` | 是 | UUID |
| `startImage.mediaId` | 图生/首尾帧 | `/v1:uploadUserImage` 返回 |
| `endImage.mediaId` | 首尾帧 | `/v1:uploadUserImage` 返回 |
| `referenceImages[].mediaId` | 参考图 | `/v1:uploadUserImage` 返回 |
| `referenceImages[].imageUsageType` | 参考图 | `IMAGE_USAGE_TYPE_ASSET` |

不同模式对上传图的传递：

| 模式 | 上传次数 | 传入字段 |
| --- | --- | --- |
| 文生视频 | 0 | 无图片 |
| 图生视频 | 1 | `startImage.mediaId` |
| 首尾帧 | 2 | `startImage.mediaId`、`endImage.mediaId` |
| 参考图 | N | `referenceImages[].mediaId` |

`videoModelKey` 矩阵：

| 产品模型 | 模式 | `16:9` key | `9:16` key | 状态 |
| --- | --- | --- | --- | --- |
| `veo3.1-fast` | 文生 | `veo_3_1_t2v_fast_ultra_relaxed` | `veo_3_1_t2v_fast_portrait_ultra_relaxed` | 已确认 |
| `veo3.1-fast` | 图生 | `veo_3_1_i2v_s_fast_ultra_relaxed` | `veo_3_1_i2v_s_fast_portrait_ultra_relaxed` | 已确认 |
| `veo3.1-fast` | 首尾帧 | `veo_3_1_i2v_s_fast_fl_ultra_relaxed` | `veo_3_1_i2v_s_fast_portrait_fl_ultra_relaxed` | 已确认 |
| `veo3.1-fast` | 参考图 | `veo_3_1_r2v_fast_landscape_ultra_relaxed` | `veo_3_1_r2v_fast_portrait_ultra_relaxed` | 已确认 |
| `veo3.1-pro` | 文生 | `veo_3_1_t2v` | `veo_3_1_t2v_portrait` | 已确认 |
| `veo3.1-pro` | 图生 | `veo_3_1_i2v_s` | `veo_3_1_i2v_s_portrait` | 已确认 |
| `veo3.1-pro` | 首尾帧 | `veo_3_1_i2v_s_fl` | `veo_3_1_i2v_s_portrait_fl` | 已确认 |
| `veo3.1-pro` | 参考图 | 待验证 | 待验证 | 旧 util 未配置 |

账号 fast 逻辑：

| 条件 | 行为 | 状态 |
| --- | --- | --- |
| modelKey 包含 `fast` 且账号 `isFast = true` | 优先查特殊映射；没有映射时 `modelKey.split("_relaxed")[0]` | 已确认源码逻辑，具体可用性待实测 |

特殊映射：

| slow key | fast key |
| --- | --- |
| `veo_3_1_i2v_s_fast_fl_ultra_relaxed` | `veo_3_1_i2v_s_fast_ultra_fl` |
| `veo_3_1_i2v_s_fast_portrait_fl_ultra_relaxed` | `veo_3_1_i2v_s_fast_portrait_ultra_fl` |

普通去尾示例：

| slow key | fast 账号实际 key |
| --- | --- |
| `veo_3_1_t2v_fast_ultra_relaxed` | `veo_3_1_t2v_fast_ultra` |
| `veo_3_1_i2v_s_fast_ultra_relaxed` | `veo_3_1_i2v_s_fast_ultra` |
| `veo_3_1_r2v_fast_portrait_ultra_relaxed` | `veo_3_1_r2v_fast_portrait_ultra` |

状态查询返回：

| 字段 | 说明 |
| --- | --- |
| `operations[].status` | 例如 `MEDIA_GENERATION_STATUS_SUCCESSFUL` |
| `operations[].operation.error.message` | 失败原因 |
| `operations[].operation.metadata.video.fifeUrl` | 视频 URL |
| `operations[].operation.metadata.video.servingBaseUri` | 封面/服务 URI |
| `operations[].operation.metadata.video.seed` | seed |
| `operations[].mediaGenerationId` | media ID |

轮询策略：

| 项 | 值 |
| --- | --- |
| 轮询接口 | `POST /v1/video:batchCheckAsyncVideoGenerationStatus` |
| 轮询间隔 | 10 秒 |
| 查询异常重试 | 3 次 |
| 成功状态 | `MEDIA_GENERATION_STATUS_SUCCESSFUL` |
| 失败状态 | `MEDIA_GENERATION_STATUS_FAILED` 或非 pending/active/successful |
| 成功后下载 | `fifeUrl` 视频、`servingBaseUri` 封面 |

## 3. Google Labs 项目接口

项目创建不走 aisandbox token，而是走 Labs cookie。

Endpoint：

```text
POST https://labs.google/fx/api/trpc/project.createProject
```

请求：

```json
{
  "json": {
    "projectTitle": "项目名称",
    "toolName": "PINHOLE"
  }
}
```

响应解析：

| 响应路径 | 含义 |
| --- | --- |
| `result.data.json.status` | 旧项目要求等于 `200` |
| `result.data.json.result.projectId` | Flow projectId |
| `result.data.json.result.projectInfo.projectTitle` | 项目标题 |

## 4. 高可用相关参数

| 参数 | 图片 | 视频 | 来源 |
| --- | --- | --- | --- |
| `accountNum` | 默认 3 | 默认 3 | `mmPermission.system.googleAccount.image/video.accountNum` |
| `reqLimit` | 默认 3 | 默认 1 | `mmPermission.system.googleAccount.image/video.reqLimit` |
| `coldDownTime` | 默认 2 小时 | 默认 2 小时 | `mmPermission.system.googleAccount.image/video.coldDownTime` |
| `threadNum` | 固定消费者配置 | 默认 6 | `mmPermission.system.googleAccount.video.threadNum` |
| `cycleTime` | 约 1 秒监控 | 默认 2000ms | `mmPermission.system.googleAccount.video.cycleTime` |

错误到账号状态：

| reason | 状态 |
| --- | --- |
| `PUBLIC_ERROR_USER_REQUESTS_THROTTLED` | `REQUEST_HIGH` |
| `TOKEN_EXPIRED` | `TOKEN_EXPIRED` |
| `COOKIE_EXPIRED` | `DEAD` |

## 5. Recaptcha 参数

| 生成类型 | pageAction | 写入字段 |
| --- | --- | --- |
| 图片 | `IMAGE_GENERATION` | `clientContext.recaptchaContext.token` |
| 视频 | `VIDEO_GENERATION` | `clientContext.recaptchaContext.token` |

固定：

| 字段 | 值 |
| --- | --- |
| `websiteURL` | `https://labs.google/` |
| `websiteKey` | `6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV` |
| `websiteTitle` | `Flow - ModelMaster` |
| `applicationType` | `RECAPTCHA_APPLICATION_TYPE_WEB` |
| provider task type | `ReCaptchaV3TaskProxyLess` |

服务返回字段：

| 字段 | 用途 |
| --- | --- |
| `solution.gRecaptchaResponse` | 写入 Google 请求 token |
| `solution.userAgent` | 透传为 Google 请求 `User-Agent` |
| `taskId` | 成功/失败后调用 provider feedback |

Capsolver 默认策略：

| 项 | 值 |
| --- | --- |
| 创建任务 | `/createTask` |
| 查询结果 | `/getTaskResult` |
| 反馈结果 | `/feedbackTask` |
| 最大轮询 | 6 次 |
| 轮询间隔 | 4000ms |
| 成功反馈 | Google 生成接口成功后 `solved=true` |
| 失败反馈 | 403 类错误后 `solved=false` |

## 6. 待补齐字段

| Google 模型/接口 | 待验证项 |
| --- | --- |
| Google Flow `Nano-Banana` | `GEM_PIX` 是否支持图生图、多参考图数量上限 |
| Google Flow `Nano-Banana-Pro` | `GEM_PIX_2` 支持的比例、图片数量、是否支持结构化 prompt |
| Google Flow `Nano-Banana-2` | `NARWHAL` 支持的所有参数，尤其 `4:3`、`3:4`、`imageInputs` 数量 |
| Google Flow `imagen4` | 为什么映射为 `IMAGEN_3_5`，是否旧命名或后端兼容 |
| Google VEO 3.1 Pro 参考图 | 旧 util 无 model key，需要抓包或实测 |
| Google VEO | `duration`、`resolution` 是否有隐藏字段，旧 direct path 未传 |
| recaptcha | token 有效期、userAgent 是否强绑定、错误 reason 映射 |
