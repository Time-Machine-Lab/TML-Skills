## 前提条件

- 已获取 access_token（user_access_token）
- 用户对搜索的 Wiki 节点具备查看权限

## 操作步骤

1. 使用 access_token 调用“搜索 Wiki”接口。
2. 根据需要传入 `query` 进行关键词搜索，可选传入 `space_id` 限制在特定知识空间内搜索。

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/nodes/search

请求方法：
POST

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

查询参数：
- page_size（可选，默认 20，最大 50）
- page_token（可选，用于分页）

请求体字段：
- query: 搜索关键词（必填，长度不超过 50 个字符）
- space_id: 知识空间 ID（可选，为空则搜索全部空间）
- node_id: 节点 ID（可选，若不为空则搜索该节点及其所有子节点；使用 node_id 过滤时必须同时传入 space_id）

## 输入参数

- access_token: user_access_token
- query: 搜索关键词
- space_id: （可选）知识空间 ID
- node_id: （可选）限定搜索的父节点 ID
- page_size: （可选）分页大小

## 输出结果

- 包含匹配的 Wiki 节点列表（`res.data.items`），每个节点包含 `node_id`、`space_id`、`obj_type`、`obj_token`、`title`、`url` 等信息。
- 如果有更多数据，`has_more` 为 true，并返回下一页的 `page_token`。

**说明：文档类型 (obj_type) 对照表**
- 1: Doc
- 2: Sheet
- 3: Bitable
- 4: Mindnote
- 5: File
- 8: Docx
- 9: Folder
- 10: Catalog
- 11: Slides

## 失败与重试

- 20010001 invalid param: 参数错误，请检查输入参数
- 20010002 network anomaly: 后端服务或网络异常，可稍后重试

## 安全与合规提示

- 用户只能查找到自己拥有可见权限的 Wiki 节点。如果某个 Wiki 存在但未搜索到，通常是由于权限不足。