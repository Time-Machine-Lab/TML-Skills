## 前提条件

- 已获取 `access_token`（tenant_access_token 或 user_access_token）
- 已知目标 `document_id`
- 需要将 Markdown/HTML 转为 docx 文档块并写入文档
- 若内容含图片，允许下载图片并上传素材

## 依赖操作文档（本功能内必须使用）

- 块插入：`operations/docx-block-create.md`
- 图片素材上传：`operations/docx-image-upload-for-block.md`
- 单块更新：`operations/docx-block-patch.md`
- 批量更新：`operations/docx-block-batch-update.md`

执行原则：本功能文档为总控文档。Markdown/HTML 转文档时，直接按本文件串联上述依赖，不需要再回到 `SKILL.md` 查流程。

## 中文内容防乱码规则（必须）

- 当 `content` 含中文时，调用接口必须使用 Base64 方式传递请求体，避免 Windows/Powershell 命令行编码导致乱码。
- 不要直接把含中文的 JSON 作为第三个命令行参数传入。
- Base64 仅用于本步骤的 JSON 请求体；后续图片素材上传必须走二进制 `multipart/form-data`，禁止把图片转 Base64。

推荐示例（Powershell）：
```powershell
$payload = @{
  content_type = "markdown"
  content = "# 标题`n这是一段中文内容"
} | ConvertTo-Json -Depth 10 -Compress
$base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
node scripts/api_request.js POST "https://open.feishu.cn/open-apis/docx/v1/documents/blocks/convert" --base64 $base64
```

## 强制执行流程（必须按顺序）

### 步骤一：调用内容转换接口，拿到转换结果
调用 `Markdown/HTML 内容转换为文档块` 接口：

请求地址：
https://open.feishu.cn/open-apis/docx/v1/documents/blocks/convert

请求方法：
POST

请求头：
Authorization: Bearer access_token  
Content-Type: application/json; charset=utf-8

请求体字段：
- `content_type`: `markdown` 或 `html`
- `content`: 原始内容字符串

关键输出：
- `blocks`: 转换后的块结构
- `block_id_to_image_urls`: 图片块映射（临时 block_id -> 原始图片 URL）

### 步骤二：把第一级块批量插入目标文档
调用“创建嵌套块”接口，把转换结果的第一级块插入目标文档。

依赖执行：
- `operations/docx-block-create.md`

执行要点：
- 仅插入第一级块，保持转换后的层级结构
- 表格块若含 `merge_info`（只读），插入前移除该字段

### 步骤三：逐个上传图片素材
针对 `block_id_to_image_urls` 中的每个图片块：
1. 根据映射拿到 `block_id` 和图片 URL，并先下载图片到本地  
2. 上传图片素材（`parent_type=docx_image`，`parent_node=<图片块block_id>`）  
3. 记录返回 `file_token`

依赖执行：
- `operations/docx-image-upload-for-block.md`

执行要点（重要）：
- 图片上传必须二进制直传（multipart），不要转 Base64。

### 步骤四：更新图片块，设置 replace_image
调用更新块或批量更新块接口，把步骤三得到的 `file_token` 写回对应图片块。

依赖执行：
- `operations/docx-block-patch.md`
- `operations/docx-block-batch-update.md`

执行要点：
- 每个图片块都要与其 `file_token` 正确一一对应
- 批量更新时，控制单次操作量，避免超限

## 输入参数

- access_token: 访问凭证
- content_type: `markdown` 或 `html`
- content: Markdown/HTML 字符串
- document_id: 目标文档 ID

## 推荐一体化执行命令（避免漏步骤）

当需要执行完整流程（convert -> create -> upload image -> replace_image）时，优先使用：

```bash
node scripts/process_images.js "<markdown_or_html_path>" "<document_id>" --content-type markdown
```

说明：
- 脚本会自动完成图片下载、上传素材与 `replace_image` 回写。
- 任一图片失败会返回非 0 退出码，并输出失败明细，便于重试定位。

## 输出结果

- 文本块与结构块已插入文档
- 图片块已绑定真实素材（replace_image 完成）
- 最终文档可正常显示文本与图片

## 失败与重试

- `4001770033` content size exceed limit：内容过大，需拆分
- `5001771001` server internal error：可稍后重试
- 图片上传 403/权限错误：直接向用户说明无权限，不要盲目重试
- 批量更新超限：拆小批次重试

## 安全与合规提示

- 不要将用户 token 写入日志或文件
- 图片需来自可信 URL，下载失败时给出明确失败项
- 含图片的 Markdown 转文档，禁止跳过“上传素材 + replace_image”步骤
