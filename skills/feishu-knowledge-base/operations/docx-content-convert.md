## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- 需要将 Markdown 或 HTML 格式的文本转换为飞书云文档（docx）支持的结构化文档块

## 操作步骤

1. 使用 access_token 调用“Markdown/HTML 内容转换为文档块”接口。
2. 接口返回转换后的文档块列表（可用于后续的“创建块”或“批量创建块”操作）。

**注意**：
- 如果转换的内容包含**表格**：转换后返回的表格块（Table）会包含 `merge_info` 字段。由于该字段目前为只读属性，在调用创建块接口插入到文档前，**必须先手动去除 `merge_info` 字段**，否则会报错。
- 如果转换的内容包含**图片**：转换后会生成图片（Image）块，插入文档后需另外调用上传图片素材接口，将真实的图片上传并更新该 Image Block。
- 文本长度限制：单次请求的 content 字符长度不能超过 10,485,760 个字符。

请求地址：
https://open.feishu.cn/open-apis/docx/v1/documents/blocks/convert

请求方法：
POST

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

查询参数：
- user_id_type（可选，默认 open_id）

请求体字段：
- content_type: 必须为 "markdown" 或 "html"
- content: 具体的文本内容字符串

## 输入参数

- access_token: 租户或用户访问凭证
- content_type: "markdown" 或 "html"
- content: Markdown 或 HTML 格式的字符串文本

## 输出结果

- 转换成功后返回结构化的文档块列表（`res.data.blocks`），这些块可直接作为其他创建块接口的子节点参数（注意需要去除表格的 merge_info 等只读属性）。

## 失败与重试

- 4001770033 content size exceed limit: 纯文本内容大小超过 10485760 字符限制，请减少内容后重试
- 5001771001 server internal error: 服务器内部错误，可稍后重试

## 安全与合规提示

- 尽量分批次转换和插入超长文本。
