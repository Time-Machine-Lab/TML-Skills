---
name: feishu-knowledge-base
description: 处理飞书知识库(Feishu Wiki/Docx)相关操作。Invoke when users need Feishu knowledge-base read/write/search/create/sync tasks, especially uploading local files to Feishu without altering their contents.
---

# 大纲

## 1. 目标与范围
- 覆盖飞书知识库的空间/节点/文档/块的查询、创建、更新与同步操作。
- 覆盖“将本地现成文件直接上传/同步到飞书知识库”的场景，并将用户提供的文件视为最终交付物。
- config/credentials.yaml 为本技能运行环境变量的配置文件，保存运行期关键数据（token等）。

## 2. 工作流与渐进式执行规范（Agent 必读）
> **重要指令**：为了保持执行效率，你不需要也不应该预先加载所有的操作文档。请严格遵循以下工作流：

### 2.1 文件上传铁律（最高优先级）
- 当用户提供本地文件，并希望“上传到飞书知识库 / 同步到飞书 / 导入飞书”时，必须默认该文件已经是最终版。
- 在该场景下，Agent 的职责仅限于识别目标位置、选择合适的飞书上传/导入方式、执行上传或挂载，并返回结果。
- **绝对禁止**在未获得用户明确要求前，对文件内容做任何 AI 加工，包括但不限于：总结、润色、改写、翻译、删减、补全、重新排版、提取后重写为 Markdown/Docx、修改源文件内容、生成“优化版/清洗版/适配版”后再上传。
- **绝对禁止**把“直接上传文件”擅自替换成“读取文件内容后新建一篇飞书文档并写入整理后的内容”。
- 如果当前接口、权限或文件类型限制导致**无法直接上传原文件**，必须如实告知限制；除非用户明确同意替代方案，否则不要改走内容转换、块写入、文档重建等路径。
- 只有当用户明确提出“请帮我整理后再上传 / 转成飞书文档 / 提取内容后二次编辑”等需求时，才可以使用内容转换、块更新、文档改写相关能力。

1. **确定意图**：根据用户需求，确定需要进行的飞书知识库操作（例如：创建文档、获取节点、更新块）。
   - 若输入中包含文件，并且目标是“上传/同步/导入到飞书”，优先判定为“原文件直传”任务，而不是“内容改写”任务。
2. **查找对应文档**：在下面的【业务操作清单】中找到对应的 `.md` 文件路径。
3. **按需阅读**：使用工具**仅读取**该具体操作对应的文档。
4. **执行与容错**：按照文档中的步骤执行网络请求。如果请求失败，特别是报 Token 过期等鉴权错误，请立即参考第 3 节执行自动刷新。
   - **特殊处理（权限不足）**：当遇到明确的权限不足错误（如日志提示 Permission Denied 或错误码包含 131006 等），**请立即停止重试，直接如实告诉用户“当前无权限执行此操作”**。

- 若需要理解飞书知识库的整体业务概念（如节点与文档的关系），请按需阅读 `references/guide.md`。
- 若需要了解目录索引相关功能，请按需阅读 `references/index/guide.md`。

## 3. 授权与 Token 管理（自动化脚本）
> **注意：本节包含了所有鉴权相关的固定操作，遇到 Token 过期等情况时，请直接调用 `scripts/auth.js` 脚本，无需再去读取 operations 目录下的相关文档或手动拼接请求。**

### 3.1 刷新 user_access_token（最常用容错）
当 API 报 token 过期时，直接运行以下命令即可自动完成刷新并更新配置：
```bash
node scripts/auth.js refresh
```
*(脚本内部已自动处理了读取 credentials、获取 app_access_token 避免 20014 报错、以及写回新 token 到 yaml 文件的逻辑)*

### 3.2 首次授权与换取 Token
当 refresh_token 也失效（如报 20010 等）或首次初始化时：
1. **生成授权链接并引导用户在浏览器中打开**：
   ```bash
   node scripts/auth.js url
   ```
2. **用户授权后获取 code**，使用 code 换取 Token 并自动写入配置：
   ```bash
   node scripts/auth.js token <code>
   ```

## 4. 业务操作清单（按需渐进式读取）

### 4.1 核心高级脚本（优先使用）
> **注意：如果用户需要在特定的路径/目录下创建文件或节点，请直接使用以下脚本，而不要手动去循环调用查询和创建接口。**

- **创建嵌套目录/文档 (类似 `mkdir -p`)**：
  当需要在指定路径（如 `部门/项目/研发文档`）下创建节点时，直接运行：
  ```bash
  node scripts/ensure_path.js <space_id> "层级1/层级2/最终文档" --doc
  ```
  *(脚本会自动逐层查询节点是否存在，不存在则创建，最终返回目标节点的 Token，并自动维护本地缓存)*

- **手动同步缓存 (新增/删除节点后必调)**：
  如果你通过基础 API 手动创建或删除了节点，**必须**调用此脚本以保持本地缓存同步，否则后续操作可能会读取到脏数据。
  - **新增节点后**：
    ```bash
    node scripts/sync_cache.js add <space_id> "<parent_node_token>" '{"node_token":"...", "title":"..."}'
    ```
  - **删除节点后**：
    ```bash
    node scripts/sync_cache.js delete <space_id> "<parent_node_token>" "<deleted_node_token>"
    ```

### 4.2 基础 API 操作清单
> **重要指令（绝对禁止创建临时文件）**：
> 在调用这些基础 API 时，**绝对禁止**通过编写临时的 `.js`、`.py`、`.json` 等脚本或数据文件来进行网络请求或存储请求体（因为这会导致在用户工作区创建多余文件并频繁删除，严重影响用户体验。**即使是 `.cache` 目录也不允许创建临时请求文件**）。
> 请**一律使用内置的通用请求工具**发起调用。如果请求体 JSON 数据较长或包含中文字符，为了避免命令行引号转义和乱码问题，请**使用 Base64 编码**传递：
> ```powershell
> # 方式一：直接传递 JSON 字符串（仅适用于极短、无特殊字符和中文的 JSON）
> node scripts/api_request.js <METHOD> "<URL>" "{\`"key\`":\`"value\`"}"
> 
> # 方式二：使用 Base64 编码传递（强烈推荐，适用于长 JSON 或包含中文字符，完美避免编码、转义及并发问题，零文件痕迹）
> $jsonStr = '{"key":"包含中文的复杂内容"}'; $base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($jsonStr)); node scripts/api_request.js <METHOD> "<URL>" --base64 $base64
> ```
> 例如：`node scripts/api_request.js GET "https://open.feishu.cn/open-apis/wiki/v2/spaces"`
>
> **文件上传补充约束**：
> - `operations/docx-document-convert.md` 与 `operations/docx-content-convert.md` 属于“内容转换”能力，不属于“原文件直传”能力。
> - 当用户只是要把现成文件上传到飞书时，默认**不要**调用这些转换能力。
> - 只有用户明确要求“把内容转成飞书在线文档结构”时，才允许读取并执行这些转换类操作。

- 获取用户信息：operations/user-info.md
- 获取知识空间列表：operations/wiki-space-list.md
- 获取知识空间子节点列表：operations/wiki-space-node-list.md
- 搜索文档内容：operations/wiki-space-node-search.md
- 创建知识空间节点：operations/wiki-space-node-create.md
- 获取知识空间节点信息：operations/wiki-space-node-get.md
- 移动知识空间节点：operations/wiki-space-node-move.md
- 获取知识空间信息：operations/wiki-space-get.md
- 创建知识空间：operations/wiki-space-create.md
- 创建文档：operations/docx-document-create.md
- 获取文档基本信息：operations/docx-document-get.md
- 获取文档原始内容：operations/docx-document-raw-content.md
- 获取文档列表：operations/docx-document-list.md
- 文档格式转换：operations/docx-document-convert.md
- Markdown/HTML 内容转换为文档块：operations/docx-content-convert.md
- 创建块：operations/docx-block-create.md
- 获取块信息：operations/docx-block-get.md
- 获取块信息（扩展）：operations/docx-block-get-2.md
- 更新块内容：operations/docx-block-patch.md
- 批量更新块：operations/docx-block-batch-update.md
- 批量删除块：operations/docx-block-batch-delete.md

