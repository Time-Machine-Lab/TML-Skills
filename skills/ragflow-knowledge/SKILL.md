---
name: ragflow-knowledge
description: 与 RAGFlow 知识库交互（检索/搜索 和 保存/上传）。当用户希望查询知识库或保存内容到知识库时使用。
---

# RAGFlow 知识库技能

本技能允许 Agent 与 RAGFlow 知识库进行交互。支持以下功能：
1.  **读取知识**：从知识库中检索信息以回答问题或填充上下文。
2.  **存储知识**：将内容（文本或文件）保存到知识库以供将来检索。

## 前置条件

使用此技能前，请确保已设置或提供以下环境变量：

- `RAGFLOW_BASE_URL`: RAGFlow 实例的基础 URL（例如 `http://localhost:9380` 或 `https://demo.ragflow.io`）。
- `RAGFLOW_API_KEY`: 您的 RAGFlow API Key。
- `RAGFLOW_DATASET_ID`: （可选）保存知识的目标数据集 ID。如果未提供，技能将尝试查找默认数据集或提示您创建一个。
- `RAGFLOW_CHAT_ID`: （可选）用于检索的聊天助手 ID。如果未提供，检索可能需要创建一个新的聊天会话。

## 使用方法

### 1. 配置检查

首先运行此步骤以验证连接和配置。

```bash
python3 skills/ragflow-knowledge/scripts/check_config.py
```

如果缺少配置，脚本将提示输入。您需要提供 `RAGFLOW_BASE_URL` 和 `RAGFLOW_API_KEY`。

### 2. 读取知识（检索）

当用户提出的问题可能需要知识库中的信息来回答，或者需要内部文档的上下文时使用。

```bash
python3 skills/ragflow-knowledge/scripts/retrieve_knowledge.py --query "您的问题" [--chat_id "可选的聊天ID"]
```

- **Query**: 要搜索的问题或主题。
- **Chat ID**: （可选）使用的特定聊天 ID。

### 3. 列出可用知识库

在决定将知识存入何处之前，先列出当前可用的知识库，以便根据内容主题选择最合适的目标。

```bash
python3 skills/ragflow-knowledge/scripts/list_datasets.py
```

### 4. 存储知识（保存）

当用户明确要求将内容（文本、代码或文件）保存到知识库时使用。

**智能路由策略**：
1.  首先调用 `list_datasets.py` 获取所有知识库列表。
2.  分析用户提供的知识内容（主题、类型、敏感度）。
3.  将内容匹配到最合适的知识库（例如：技术文档 -> "Technical Docs", HR政策 -> "HR Policies"）。
4.  调用 `save_knowledge.py` 并指定 `dataset_name` 或 `dataset_id`。
5.  如果无法确定，可以询问用户或存入默认知识库（如 "General Knowledge"）。

```bash
python3 skills/ragflow-knowledge/scripts/save_knowledge.py --content "要保存的内容" [--file_path "/文件/路径"] [--dataset_name "目标知识库名称"]
```

- **Content**: 直接保存的文本内容（如果不使用文件上传）。
- **File Path**: 要上传的本地文件路径。**重要要求**：当用户要求上传或保存已存在的文件时，Agent **必须原封不动**地使用此参数将源文件上传，**绝对禁止**擅自读取文件内容并将其转换为纯文本或新文件后再上传，这会导致原有格式（如 Markdown、PDF 的结构、图片、表格）丢失！
- **Dataset Name**: （可选）保存到的数据集名称。如果不指定，脚本将尝试使用默认值或创建新库。

## 脚本详情

### `check_config.py`
验证与 RAGFlow 的连接并列出可用的数据集/聊天。这有助于确保环境准备就绪。

### `list_datasets.py`
返回所有可用知识库的详细列表（JSON格式），包含ID、名称、描述和文档数量。Agent 应使用此输出来决定存储目标。

### `retrieve_knowledge.py`
向 RAGFlow Chat API 发送查询并返回答案/上下文。

### `save_knowledge.py`
1.  检查目标数据集是否存在；如果不存在则创建。
2.  将内容/文件上传为文档。
3.  触发文档解析（激活）。
4.  返回状态（成功、文档 ID、解析状态）。
