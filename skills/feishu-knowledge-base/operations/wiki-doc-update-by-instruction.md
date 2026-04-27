## 前提条件

- 已具备可用 `access_token`。
- 已从配置读取必要信息（至少 `app-id`、`app-secret`、`access_token`）。
- 用户提供了以下任一入口：Wiki 文档标识（`space_id + node_token`）、可解析的 Wiki URL，或“当前已选中的飞书文档”上下文。
- 用户明确了修改意图（按关键词匹配或按块索引定位）。

## 输入参数

- wiki_doc_or_url: Wiki 文档标识或 URL
- instruction: 用户修改指令（替换为、追加、删除、改写为等）
- locate_mode: `keyword` 或 `index`
- locate_value: 关键词或块索引
- (可选) space_id: 用户显式指定时优先；未指定则从配置读取默认值

## 配置驱动要求（必须）

1. 先读取 `config/credentials.yaml`。
2. 从配置中获取 `app-id`、`app-secret`、`access_token`；`space_id` 优先取用户输入，否则取配置默认值。
3. 若缺失关键字段（尤其 `access_token`、`space_id`），必须先提示用户补齐后再执行。

## 操作步骤（必须按顺序执行）

1. **解析输入**
   - 若输入是 URL，解析出 `space_id` 与 `node_token`。
   - 若用户已选中文档，优先从选中文档上下文中提取 `space_id` 与 `node_token`。
   - 若 URL 无法完整解析，向用户补齐最少参数（仅问缺失项）。

2. **Token 转换（Wiki -> Docx）**
   - 复用：`operations/wiki-space-node-get.md`（获取节点信息能力）。
   - 从返回中提取可用于 Docx 的 `obj_token`，并作为 `document_id` 使用。
   - 若 `obj_token` 为空或对象类型不是文档，停止并告知用户。

3. **拉取全文块列表**
   - 复用：`operations/docx-document-raw-content.md`（用于获取全文内容并做定位）。
   - 必要时配合 `operations/docx-block-get.md` 拉取单块详情做二次确认。

4. **内容定位**
   - `keyword` 模式：在块文本中匹配关键词，返回候选 `block_id`（可带上下文片段）。
   - `index` 模式：按用户给定索引定位目标块。
   - 若命中 0 个或命中过多（歧义），先向用户确认目标块后再修改。

5. **内容修改**
   - 复用：`operations/docx-block-batch-update.md`（批量更新块能力）。
   - 按官方字段构造 `update_text_elements` 请求，替换目标 `block_id` 的文本内容。
   - 一次修改多个块时，控制单次操作量，避免超限。

6. **修改后校验**
   - 复用：`operations/docx-block-get.md` 或 `operations/docx-document-raw-content.md` 做写后核验。
   - 向用户返回修改结果与文档链接。

## 异常处理（必须）

- **403 权限不足**：立即停止重试，返回“当前 token 无文档编辑权限/无目标文档权限”。
- **404 找不到文档**：检查 `space_id`、`node_token`、`document_id` 是否正确；必要时让用户确认链接或权限范围。
- **限流（429 或平台限流码）**：指数退避重试（如 1s/2s/4s，最多 3 次）；仍失败则告知稍后重试。
- **token 过期/失效**：先走 `node scripts/auth.js refresh`，失败再引导重新授权。

## 输出结果（强制）

```text
操作结果：<成功/失败>
本次执行：已根据指令修改 Wiki 文档指定内容
关键输出：space_id=<...>, node_token=<...>, document_id=<...>, block_id=<...>
已存储至 {知识库} | {文档} | {文档链接}
```
