## 前提条件

- 已获取 `access_token`（tenant_access_token 或 user_access_token）
- 已知 `document_id`
- 已从 `block_id_to_image_urls` 获得图片块 `block_id` 与图片 URL
- 允许下载图片到本地临时路径（下载后应及时清理）

## 操作步骤

1. 根据图片 URL 下载图片到本地
2. 调用上传素材接口上传图片，参数必须为：
   - `parent_type=docx_image`
   - `parent_node=<图片块block_id>`
3. 获取返回的 `file_token`
4. 调用更新块（patch 或 batch_update），使用 `replace_image` 将 `file_token` 设置到对应图片块

上传素材接口：
https://open.feishu.cn/open-apis/drive/v1/medias/upload_all

请求方法：
POST（multipart/form-data）

请求头：
Authorization: Bearer access_token

表单字段：
- `file_name`
- `parent_type`（固定 `docx_image`）
- `parent_node`（图片块 block_id）
- `size`（文件字节数）
- `file`（图片二进制）

关键约束：
- 图片素材必须以二进制文件方式上传（multipart）。
- 禁止把图片先转换为 Base64 再上传。

## 推荐调用方式

可使用内置脚本上传图片素材：

```bash
node scripts/upload_media.js "<local_image_path>" docx_image "<image_block_id>" [file_name]
```

然后按需执行：
- `operations/docx-block-patch.md`
- `operations/docx-block-batch-update.md`

## 输入参数

- access_token: 访问凭证
- image_block_id: 图片块 block_id（来自 `block_id_to_image_urls`）
- image_url: 原始图片 URL
- local_image_path: 本地下载路径
- file_token: 上传成功后返回

## 输出结果

- 每个图片块对应一个有效 `file_token`
- 图片块通过 `replace_image` 更新后可正常显示

## 失败与重试

- 下载失败：检查 URL 可达性与网络
- 上传失败 401/鉴权：刷新 token 后重试
- 上传失败 403/权限：直接告知用户无权限
- 更新块失败：检查 `block_id` 和 `file_token` 是否匹配

## 安全与合规提示

- 下载后的本地图片应在流程结束后清理
- 不要把访问 token、下载链接等敏感信息写入持久日志
