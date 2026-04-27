---
name: feishu-knowledge-base
description: 处理飞书知识库(Feishu Wiki/Docx)相关操作。Invoke when users need Feishu knowledge-base read/write/search/create/sync tasks, especially uploading local files to Feishu without altering their contents.
---

# 飞书知识库技能说明

## 1. 目标与范围
- 覆盖飞书知识库空间、节点、文档、块的查询、创建、更新、删除与同步。
- 覆盖“将本地现成文件直接上传/同步到飞书知识库”的场景，并默认用户文件是最终交付物。
- `config/credentials.yaml` 保存运行期关键凭据（如 `app-id`、`app-secret`、`access_token`、`refresh_token`）。

## 2. 工作流（Agent 必须遵循）
> 原则：按需读取、最短路径执行、失败可恢复，不预读全量文档。

### 2.1 文件上传铁律（最高优先级）
- 当用户目标是“上传/同步/导入本地文件到飞书”，默认该文件已是最终版。
- 该场景下仅做：定位目标空间/目录、执行上传/导入、返回结果。
- 未获用户明确要求前，禁止任何内容加工（总结、改写、翻译、重排、提取后重写等）。
- 禁止把“直传文件”擅自替换为“提取内容后重建文档”。
- 若接口/权限/格式限制导致无法直传，必须先如实告知；仅在用户明确同意时才切换到替代方案。

### 2.2 标准执行闭环
1. **识别任务类型**：查询/创建/更新/移动/删除/同步。  
2. **补齐最少参数**：仅询问必要字段（如 `space_id`、`node_token`、目标路径）。  
3. **优先高级脚本**：路径创建优先 `scripts/ensure_path.js`。  
4. **按需读取单篇操作文档**：从 `operations/*.md` 只读当前任务相关文件。  
5. **统一走 `scripts/api_request.js`**：禁止临时脚本和临时数据文件。  
6. **执行容错**：遇错按第 4 节与第 5 节处理（权限优先，其次 token，再参数）。  
7. **结构化回报用户**：说明做了什么、结果如何、下一步建议。  

- 若需理解业务概念（节点关系等），按需读取 `references/guide.md`。
- 若需了解目录索引能力，按需读取 `references/index/guide.md`。

### 2.3 文档归档路由流程（必须）
当用户表达“文档归档/归类/放到合适知识库路径”时，必须按以下流程：
1. 提取归档依据：文档标题 + 正文（或摘要）。
2. 调用归档推荐脚本：
   ```bash
   node scripts/suggest_archive_path.js "<doc_title>" "<doc_content_or_summary>" --top 3
   ```
3. 若用户**没有明确指定目标文档/节点**，Agent 不得直接写入；必须先返回候选位置（建议 2-3 个），每个候选都要给出“文档名称 + 简短描述”，并要求用户明确选择后再执行写入。
4. 用户一旦明确选择（如“选 1”/“存到 XX 文档”），再执行归档写入；未收到明确选择前禁止落库。
5. `confidence` 仅用于候选说明与风险提示，不作为“可跳过确认”的理由。
6. 归档前兜底校验：若推荐路径命中失败，先刷新缓存再重算一次；仍失败则回退到该知识库根目录并再次向用户确认后执行。

归档推荐依据必须包含：
- 知识库名称与描述（space 介绍）
- 节点标题与路径词命中
- 文档标题与正文关键词匹配

### 2.4 配置读取强制规则（必须）
- 当任务涉及特殊配置（鉴权、租户、环境、默认目标空间、上传策略、限流参数、功能开关、路径映射等）时，Agent 必须主动读取 `config/` 下相关配置文件，禁止凭记忆或猜测执行。
- 默认先检查 `config/credentials.yaml`；若任务涉及其他配置项，再按需读取 `config/` 中对应文件。
- 若配置缺失、字段为空或与当前任务冲突，必须先向用户说明并请求补充/确认，再继续执行。
- 除非用户明确要求，不得擅自改写配置文件；读取配置仅用于正确执行当前任务。

### 2.5 存储位置确认关键词（必须）
- 当用户意图包含“存储/保存/归档/写入/放到知识库”等关键词，且未给出明确目标文档名或节点路径时，必须触发“先确认后存储”流程。
- “先确认后存储”标准话术必须包含：`请问你要存储到哪个文档？`（可附候选列表）。
- 候选列表建议用序号展示（1/2/3），并包含：文档名称、文档描述（或匹配理由），便于用户直接选择。

## 3. 对话与交付规范（体验优化）

### 3.1 对话原则
- 先执行后解释，避免冗长预告。
- 信息不足时一次性问全关键参数，减少反复追问。
- 失败时提供可直接执行的修复动作。
- 对“存储/归档”类请求，若目标文档不明确，必须先确认位置再执行，不能按“最相近文档”直接写入。

### 3.2 回复模板
每次执行后尽量按下列结构反馈：

```text
操作结果：<成功/失败>
本次执行：<1 句话>
关键输出：<space_id/node_token/doc_token/数量等>
后续建议：<下一步可选动作>
```

存储/归档成功后必须额外回传（强制）：

```text
已存储至 {知识库} | {文档} | {文档链接}
```

## 4. 授权与 Token 管理（自动化）
> 鉴权问题优先使用现有脚本，不手写临时请求。

### 4.0 执行前预检（推荐）
```bash
node scripts/auth.js status
```
根据输出先补齐授权，避免业务请求后才发现凭据未就绪。

首次安装/首次使用时，若 `config/credentials.yaml` 中 `access_token` 与 `refresh_token` 为空，视为“未授权”，必须先进入授权流程，禁止直接执行任何业务 API。

### 4.1 常用容错路径
- 优先用 `scripts/api_request.js` 发请求；该脚本会在常见 token 过期场景自动刷新并重试一次。
- 自动重试仍失败时，执行：
  ```bash
  node scripts/auth.js refresh
  ```

### 4.2 首次授权/彻底失效恢复
当 `refresh_token` 不可用（如 `20010`）或新安装时：
1. 生成授权链接：
   ```bash
   node scripts/auth.js url
   ```
2. 用户授权后提供 `code`，换取 token：
   ```bash
   node scripts/auth.js token <code>
   ```

### 4.3 首次安装强制授权提示（必须）
- 触发条件：首次安装 skill、首次运行检测到 token 为空、或用户明确表示“刚安装/首次接入”。
- 触发后必须中断业务动作，先执行授权，不得继续读写知识库。
- 必须先执行：
  ```bash
  node scripts/auth.js url
  ```
  并把授权链接直接发给用户，引导其完成授权。
- 用户完成授权后，必须要求用户回传授权码 `code`，再执行：
  ```bash
  node scripts/auth.js token <code>
  ```
- 授权成功后再恢复原任务执行；若 `code` 过期/无效，明确提示用户重新授权并重新获取 `code`。

## 5. 错误处理优先级（必须）
1. **权限错误优先**：出现 `Permission Denied`、`131006` 等，立即停止重试，直接告知“当前无权限执行此操作”。  
2. **再处理 token**：过期则自动刷新/手动刷新，必要时重新授权。  
3. **最后处理参数**：字段缺失、节点不存在、路径冲突等，明确指出缺哪项并给修复建议。  

## 6. 业务操作清单（按需读取）

### 6.1 核心高级脚本（优先）
- **创建嵌套目录/文档（类似 `mkdir -p`）**
  ```bash
  node scripts/ensure_path.js <space_id> "层级1/层级2/最终文档" --doc
  ```
- **本地文件直传到飞书 Drive（推荐用于“原文件上传”场景）**
  ```bash
  node scripts/upload_media.js "<file_path>" explorer "<parent_node>" [file_name]
  ```
- **文档归档路径推荐（根据知识库介绍+内容自动路由）**
  ```bash
  node scripts/suggest_archive_path.js "<doc_title>" "<doc_content_or_summary>" --top 3
  ```
- **手动同步缓存（仅基础 API 手动改动后需要）**
  - 新增节点后：
    ```bash
    node scripts/sync_cache.js add <space_id> "<parent_node_token>" '{"node_token":"...", "title":"..."}'
    ```
  - 删除节点后：
    ```bash
    node scripts/sync_cache.js delete <space_id> "<parent_node_token>" "<deleted_node_token>"
    ```

### 6.2 基础 API 约束
> 绝对禁止创建临时 `.js/.py/.json` 文件发请求或存请求体。

- 统一使用：
  ```bash
  node scripts/api_request.js <METHOD> "<URL>" "<JSON字符串>"
  ```
- 复杂/中文 JSON 推荐 Base64：
  ```powershell
  $jsonStr = '{"key":"包含中文的复杂内容"}'
  $base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($jsonStr))
  node scripts/api_request.js <METHOD> "<URL>" --base64 $base64
  ```
- 例如：
  ```bash
  node scripts/api_request.js GET "https://open.feishu.cn/open-apis/wiki/v2/spaces"
  ```
- `scripts/api_request.js` 不支持 `@文件路径` 输入请求体。
- Base64 仅用于 JSON 请求体（尤其中文 JSON）；**文件上传场景禁止将文件转 Base64**，必须走 `multipart/form-data` 二进制直传。

### 6.3 文件上传场景补充约束
- `operations/docx-document-convert.md` 与 `operations/docx-content-convert.md` 属于内容转换能力，不是原文件直传能力。
- 当用户仅要求上传现成文件时，默认不要调用上述转换能力。
- 仅当用户明确要求“转为飞书在线文档结构”时，才允许读取并执行转换类操作。

### 6.4 操作文档映射
- Wiki 文档按指令修改（组合流程）：`operations/wiki-doc-update-by-instruction.md`
- 上传素材（原文件直传）：`operations/drive-media-upload-all.md`
- 图片块上传素材（Markdown 转文档流程）：`operations/docx-image-upload-for-block.md`
- 文档归档路由（选知识库+路径）：`operations/doc-archive-routing.md`
- 获取用户信息：`operations/user-info.md`
- 获取知识空间列表：`operations/wiki-space-list.md`
- 获取知识空间子节点列表：`operations/wiki-space-node-list.md`
- 搜索文档内容：`operations/wiki-space-node-search.md`
- 创建知识空间节点：`operations/wiki-space-node-create.md`
- 获取知识空间节点信息：`operations/wiki-space-node-get.md`
- 移动知识空间节点：`operations/wiki-space-node-move.md`
- 获取知识空间信息：`operations/wiki-space-get.md`
- 创建知识空间：`operations/wiki-space-create.md`
- 创建文档：`operations/docx-document-create.md`
- 获取文档基本信息：`operations/docx-document-get.md`
- 获取文档原始内容：`operations/docx-document-raw-content.md`
- 获取文档列表：`operations/docx-document-list.md`
- 文档格式转换：`operations/docx-document-convert.md`
- Markdown/HTML 内容转换为文档块：`operations/docx-content-convert.md`
- 创建块：`operations/docx-block-create.md`
- 获取块信息：`operations/docx-block-get.md`
- 更新块内容：`operations/docx-block-patch.md`
- 批量更新块：`operations/docx-block-batch-update.md`
- 批量删除块：`operations/docx-block-batch-delete.md`

## 7. 参考资料
- 飞书知识库业务概念：`references/guide.md`
- 目录索引相关能力：`references/index/guide.md`

