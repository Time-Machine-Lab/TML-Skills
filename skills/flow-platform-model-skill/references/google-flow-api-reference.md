# Google Flow API 能力参考

本文件从 `/Users/mac/Code/ModelMaster/model-master-app` 抽取，用于支撑本 skill 的 Google Flow / aisandbox / Labs 图片和视频生成能力。抽取时间：2026-04-30。

## 源码位置

- Google 统一客户端：`src/main/java/io/github/timemachinelab/client/GoogleAIClient.java`
- Google Flow/VEO 编排：`src/main/java/io/github/timemachinelab/service/GoogleAIService.java`
- Google Flow 生图任务：`src/main/java/io/github/timemachinelab/core/task/consumer/FlowImageTaskConsumer.java`
- Google VEO 视频任务：`src/main/java/io/github/timemachinelab/core/task/consumer/VEO3TaskConsumer.java`
- Google DTO：`model/req/flowmedia`、`model/resp/flowmedia`、`model/req/veo3`、`model/resp/veo3`
- 常量：`ModelMasterConstant.java`、`VEOModelKeyUtil.java`

## 账号与认证

### Google aisandbox / Flow

- aisandbox Base URL：`https://aisandbox-pa.googleapis.com`
- Labs URL：`https://labs.google`
- aisandbox Header：
  - `Authorization: <Google token>`
  - `Accept: application/json`
  - `Content-Type: application/json`
  - `User-Agent: ModelMaster-GoogleAIClient/1.0`
- Labs/TRPC Header：
  - `Cookie: <Google Labs cookie>`
  - 其他 JSON header 同上
- 旧项目来源：`other_account` 转成 `GoogleAccountManager.VEO3Account`，核心字段是 `token`、`cookie`、`extraData.projectId`。

Google Flow 生图和直接 Google VEO 生成都需要 recaptcha v3。旧项目用 Capsolver 获取：

- website URL：`https://labs.google/`
- website key：`6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV`
- 视频 page action：`VIDEO_GENERATION`
- 图片 page action：`IMAGE_GENERATION`
- website title：`Flow - ModelMaster`

### 账号池和 projectId

旧项目不是在接口调用处直接传账号，而是在 worker 启动时从账号池取出 Google 账号，再通过 `VEO3AccountUtil` 的 `ThreadLocal` 暴露给 `GoogleAIService`。

账号字段来自 `other_account`：

```text
token     -> GoogleAIClient.Authorization
cookie    -> GoogleAIClient.Cookie
extraData.projectId -> GoogleAIClient.projectId / clientContext.projectId
extraData.isFast    -> VEO fast modelKey 是否切换
type      -> 视频账号类型预留检查
```

图片账号池读取配置 `mmPermission.system.googleAccount.image`，视频账号池读取配置 `mmPermission.system.googleAccount.video`。图片默认每账号并发 3，视频默认每账号并发 1。

## Labs 项目创建

项目创建走 Labs TRPC，不是 aisandbox Authorization。

Endpoint：

```text
POST https://labs.google/fx/api/trpc/project.createProject
```

Header：

```text
Cookie: <google_ai_cookie>
Content-Type: application/json
Accept: application/json
User-Agent: ModelMaster-GoogleAIClient/1.0
```

请求体外层要包 `json`：

```json
{
  "json": {
    "projectTitle": "项目标题",
    "toolName": "PINHOLE"
  }
}
```

响应解析路径：

```text
result.data.json.status == 200
result.data.json.result.projectId
result.data.json.result.projectInfo.projectTitle
```

旧项目 `Veo3ProjectCreateReq(String projectTitle)` 默认 `toolName = "PINHOLE"`。

## Google Flow 生图

参考图上传：

```text
POST https://aisandbox-pa.googleapis.com/v1/flow/uploadImage
```

上传请求：

```json
{
  "clientContext": {
    "projectId": "<projectId>",
    "tool": "PINHOLE"
  },
  "imageBytes": "<base64>",
  "isUserUploaded": true,
  "isHidden": false,
  "mimeType": "image/jpeg",
  "fileName": "upload.jpeg"
}
```

上传响应里后续要用的是：

```json
{
  "media": {
    "name": "projects/.../media/..."
  }
}
```

注意：Flow 生图参考图上传返回的是 `media.name`，后续放入 `imageInputs[].name`。这个 ID 不能和 Google VEO 的 `/v1:uploadUserImage` 返回值混用。

生图接口：

```text
POST https://aisandbox-pa.googleapis.com/v1/projects/{projectId}/flowMedia:batchGenerateImages
```

生图请求结构：

```json
{
  "clientContext": {
    "sessionId": ";1760000000000",
    "projectId": "<projectId>",
    "recaptchaContext": {
      "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
      "token": "<recaptcha-token>"
    },
    "tool": "PINHOLE"
  },
  "requests": [
    {
      "clientContext": { "...": "旧代码里与根级 clientContext 是同一个对象" },
      "seed": 123456,
      "imageModelName": "NARWHAL",
      "imageAspectRatio": "IMAGE_ASPECT_RATIO_SQUARE",
      "structuredPrompt": {
        "parts": [
          { "text": "..." }
        ]
      },
      "imageInputs": [
        {
          "name": "projects/.../media/...",
          "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE"
        }
      ]
    }
  ],
  "useNewMedia": true
}
```

模型映射来自 `GoogleAIService.packageFlowGenerateImageRequest`：

- 产品模型 `Nano-Banana` -> Google `GEM_PIX`
- 产品模型 `Nano-Banana-Pro` -> Google `GEM_PIX_2`
- 产品模型 `Nano-Banana-2` -> Google `NARWHAL`
- 产品模型 `imagen4` -> Google `IMAGEN_3_5`
- 默认 fallback -> `IMAGEN_3_5`

`Nano-Banana-2` 比较特殊：旧代码用 `structuredPrompt.parts[].text`，并把普通 `prompt` 置空。

图片比例映射：

- `16:9` -> `IMAGE_ASPECT_RATIO_LANDSCAPE`
- `9:16` -> `IMAGE_ASPECT_RATIO_PORTRAIT`
- `1:1` -> `IMAGE_ASPECT_RATIO_SQUARE`
- 默认 -> `IMAGE_ASPECT_RATIO_LANDSCAPE`

响应里旧项目使用：

```json
{
  "media": [
    {
      "name": "...",
      "workflowId": "...",
      "image": {
        "generatedImage": {
          "encodedImage": "...",
          "fifeUrl": "https://...",
          "mediaGenerationId": "...",
          "seed": 123456
        }
      }
    }
  ],
  "workflows": []
}
```

旧项目下载 `image.generatedImage.fifeUrl`，再上传 OSS。

Flow 生图运行细节：

- `FlowImageTaskConsumer` 按 `genType` 分成 `text` 和 `image` 两种 worker。
- `text` 模式不传 `imageInputs`。
- `image` 模式会把 `GenerateImageReq.imageInfos` 异步上传到 `/v1/flow/uploadImage`，再放入 `imageInputs`。
- 上传图片默认文件名按 MIME 推断：`png -> upload.png`、`webp -> upload.webp`、其他 -> `upload.jpeg`。
- 生成前使用 recaptcha pageAction `IMAGE_GENERATION`。
- 生成成功后旧项目下载 `fifeUrl` 并上传 OSS；下载失败最多重试 3 次。

## 直接 Google VEO

图片上传：

```text
POST https://aisandbox-pa.googleapis.com/v1:uploadUserImage
```

上传请求：

```json
{
  "imageInput": {
    "aspectRatio": "IMAGE_ASPECT_RATIO_LANDSCAPE",
    "isUserUploaded": true,
    "mimeType": "image/jpeg",
    "rawImageBytes": "<base64>"
  },
  "clientContext": {
    "sessionId": ";1760000000000",
    "tool": "ASSET_MANAGER"
  }
}
```

上传响应里后续要用的是：

```json
{
  "mediaGenerationId": {
    "mediaGenerationId": "..."
  }
}
```

注意：Google VEO 上传返回的是 `mediaGenerationId.mediaGenerationId`，用于 `startImage.mediaId`、`endImage.mediaId`、`referenceImages[].mediaId`。它不是 Flow 生图的 `media.name`。

生成接口：

- 文生视频：`/v1/video:batchAsyncGenerateVideoText`
- 起始图生视频：`/v1/video:batchAsyncGenerateVideoStartImage`
- 首尾帧视频：`/v1/video:batchAsyncGenerateVideoStartAndEndImage`
- 参考图视频：`/v1/video:batchAsyncGenerateVideoReferenceImages`

产品入口路径：

| 产品能力 | Controller path | 旧项目 worker |
| --- | --- | --- |
| 文生视频 | `/api/ai-service/video/generate` | `VEO3TextGenerateWorker` |
| 图生视频 | `/api/ai-service/video/image-generate` | `VEO3ImageGenerateWorker` |
| 首尾帧 | `/api/ai-service/video/generateVideoStartAndEndImage` | `VEO3FirstLastFramesGenerateWorker` |
| 参考图 | `/api/ai-service/video/generateVideoReferenceImages` | `VEO3ReferenceImageGenerateWorker` |

生成请求结构：

```json
{
  "clientContext": {
    "sessionId": ";1760000000000",
    "projectId": "<可选>",
    "recaptchaContext": {
      "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
      "token": "<recaptcha-token>"
    },
    "tool": "PINHOLE",
    "userPaygateTier": "PAYGATE_TIER_TWO"
  },
  "requests": [
    {
      "aspectRatio": "VIDEO_ASPECT_RATIO_LANDSCAPE",
      "seed": 123456,
      "textInput": {
        "prompt": "..."
      },
      "videoModelKey": "veo_3_1_t2v_fast_ultra_relaxed",
      "metadata": {
        "sceneId": "uuid"
      },
      "startImage": {
        "mediaId": "..."
      },
      "endImage": {
        "mediaId": "..."
      },
      "referenceImages": [
        {
          "imageUsageType": "IMAGE_USAGE_TYPE_ASSET",
          "mediaId": "..."
        }
      ]
    }
  ]
}
```

提交响应：

```json
{
  "operations": [
    {
      "operation": {
        "name": "operations/..."
      },
      "status": "..."
    }
  ],
  "remainingCredits": 10
}
```

查询：

```text
POST https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus
```

查询请求：

```json
{
  "operations": [
    {
      "operation": {
        "name": "operations/..."
      }
    }
  ]
}
```

成功响应关键字段：

```json
{
  "operations": [
    {
      "status": "MEDIA_GENERATION_STATUS_SUCCESSFUL",
      "operation": {
        "metadata": {
          "video": {
            "fifeUrl": "https://...",
            "servingBaseUri": "https://...",
            "seed": 123456,
            "mediaGenerationId": "..."
          }
        }
      }
    }
  ]
}
```

## Google VEO 3.1 model key

这些 key 来自 `ModelMasterConstant` 和 `VEOModelKeyUtil`：

| 产品模型 | 模式 | 16:9 key | 9:16 key |
| --- | --- | --- | --- |
| `veo3.1-fast` | 文生视频 | `veo_3_1_t2v_fast_ultra_relaxed` | `veo_3_1_t2v_fast_portrait_ultra_relaxed` |
| `veo3.1-fast` | 图生视频 | `veo_3_1_i2v_s_fast_ultra_relaxed` | `veo_3_1_i2v_s_fast_portrait_ultra_relaxed` |
| `veo3.1-fast` | 首尾帧 | `veo_3_1_i2v_s_fast_fl_ultra_relaxed` | `veo_3_1_i2v_s_fast_portrait_fl_ultra_relaxed` |
| `veo3.1-fast` | 参考图 | `veo_3_1_r2v_fast_landscape_ultra_relaxed` | `veo_3_1_r2v_fast_portrait_ultra_relaxed` |
| `veo3.1-pro` | 文生视频 | `veo_3_1_t2v` | `veo_3_1_t2v_portrait` |
| `veo3.1-pro` | 图生视频 | `veo_3_1_i2v_s` | `veo_3_1_i2v_s_portrait` |
| `veo3.1-pro` | 首尾帧 | `veo_3_1_i2v_s_fl` | `veo_3_1_i2v_s_portrait_fl` |

旧项目还有一个账号加速逻辑：如果 Google 账号 `isFast = true`，部分 relaxed fast key 会被替换成不带 `_relaxed` 的 fast key。

具体逻辑：

- `modelKey.contains("fast") && account.isFast == true` 时触发。
- 首尾帧 slow key 有显式映射：
  - `veo_3_1_i2v_s_fast_fl_ultra_relaxed` -> `veo_3_1_i2v_s_fast_ultra_fl`
  - `veo_3_1_i2v_s_fast_portrait_fl_ultra_relaxed` -> `veo_3_1_i2v_s_fast_portrait_ultra_fl`
- 其他 fast relaxed key 走 `modelKey.split("_relaxed")[0]`。

## Google VEO 轮询和资源字段

提交后取：

```text
operations[].operation.name -> videoId / operation name
operations[].status         -> 初始状态
```

查询请求：

```json
{
  "operations": [
    {
      "operation": {
        "name": "operations/..."
      }
    }
  ]
}
```

查询后旧项目封装：

| Google 字段 | 旧 DTO 字段 |
| --- | --- |
| `operations[].status` | `Veo3VideoInfoDTO.status` |
| `operations[].mediaGenerationId` | `mediaGenerationId` |
| `operation.error.message` | `failReason` |
| `operation.metadata.video.fifeUrl` | `videoUrl` |
| `operation.metadata.video.servingBaseUri` | `videoCoverUr` |
| `operation.metadata.video.seed` | `seed` |

状态判断：

- `MEDIA_GENERATION_STATUS_PENDING` -> pending
- `MEDIA_GENERATION_STATUS_ACTIVE` -> active
- `MEDIA_GENERATION_STATUS_SUCCESSFUL` -> success
- `MEDIA_GENERATION_STATUS_FAILED` 或任何非 pending/active/successful 状态 -> failed
- `PUBLIC_ERROR_MINOR` 会映射成 `video contains minor`

## 错误处理

`GoogleAIClient.executeHttpRequest` 的行为：

- 只有 HTTP 200 且 `response.isSuccess()` 才算成功。
- HTTP 401：
  - Cookie 请求 -> `COOKIE_EXPIRED`
  - Authorization token 请求 -> `TOKEN_EXPIRED`
- 其他错误优先解析 `error.details[0].reason` 并抛出这个 reason。

Flow 生图账号状态映射：

- `PUBLIC_ERROR_USER_REQUESTS_THROTTLED` -> `REQUEST_HIGH`
- `TOKEN_EXPIRED` -> `TOKEN_EXPIRED`
- `COOKIE_EXPIRED` -> `DEAD`

Google 生成重试策略：

- `PUBLIC_ERROR_SOMETHING_WENT_WRONG`、`PUBLIC_ERROR_UNUSUAL_ACTIVITY`，或 reason 以 `403` 结尾时，会反馈 recaptcha 失败并最多重试 3 次。
- 其他 `AIGenerateException` 直接抛出。

## Token 刷新旁路

旧项目有一个独立刷新服务客户端，不直接参与生成请求，但账号失效事件会调用它：

```text
POST {model-master.refresh-google-token.baseUrl}/enqueue
Header: X-Api-Key: <configured key>
Body: { "accounts": [{ "email": "...", "password": "..." }] }
```

响应字段：

```json
{
  "ok": true,
  "task_id": "...",
  "count": 1,
  "path": "..."
}
```

这说明高可用设计里，`TOKEN_EXPIRED` / `COOKIE_EXPIRED` 不只是接口错误，还应该触发账号刷新或账号替换流程。
