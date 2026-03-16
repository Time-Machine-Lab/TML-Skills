---
name: ragflow-kb
description: RAGFlow 知识库集成。支持从 RAGFlow 知识库检索相关知识、存储新知识、管理知识库。使用场景：(1) 用户提出可能涉及团队内部知识、文档、政策或规范的问题时，从知识库检索相关信息；(2) 用户明确要求保存、存储或添加内容到知识库时，将信息存储到 RAGFlow；(3) 需要配置或验证 RAGFlow 连接时。首次使用需要配置 RAGFlow URL 和 API Key。
---

# RAGFlow 知识库 Skill

与 RAGFlow 知识库集成，为 Agent 提供知识检索和存储能力。

## 快速开始

### 第一步：配置 RAGFlow

首次使用前需要配置 RAGFlow 连接信息。

**获取配置信息**：
- 访问 RAGFlow 服务器地址 (例如: `http://210.16.171.116:40080`)
- 从用户设置中获取 API Key

**配置方式**：

```bash
python scripts/ragflow_agent.py configure \
  --url http://your-ragflow-url \
  --api-key your-api-key
```

**验证配置**：

```bash
python scripts/ragflow_agent.py check-config
```

### 第二步：使用 RAGFlow

#### 检索知识

当用户提出涉及团队内部知识的问题时，从知识库检索：

```bash
python scripts/ragflow_agent.py search "用户的问题" --top-k 10
```

Python 代码：

```python
from scripts.ragflow_agent import RAGFlowAgent

agent = RAGFlowAgent()
result = agent.search(query="用户的问题", top_k=10)
```

#### 存储知识

当用户明确要求保存内容时，将其存储到知识库：

```bash
# 直接保存文本
python scripts/ragflow_agent.py save \
  --kb-name "knowledge-base-name" \
  --content "要保存的内容"

# 从文件保存
python scripts/ragflow_agent.py save \
  --kb-name "knowledge-base-name" \
  --file document.txt
```

Python 代码：

```python
from scripts.ragflow_agent import RAGFlowAgent

agent = RAGFlowAgent()
result = agent.save_knowledge(
    content="要保存的内容",
    kb_name="knowledge-base-name"
)
```

## 核心功能

### 1. 配置管理

- **configure(url, api_key)**: 配置 RAGFlow 连接
- **check_config()**: 检查配置状态和连接
- 配置保存在 `~/.ragflow/config.json`

### 2. 知识检索

- **search(query, kb_id, top_k)**: 搜索知识库
  - `query`: 搜索查询
  - `kb_id`: 可选，指定知识库 ID
  - `top_k`: 返回结果数量，默认 10

### 3. 知识存储

- **save_knowledge(content, kb_name, file_name)**: 保存知识
  - 自动创建或获取知识库
  - 上传文档
  - 激活文档以启用索引

### 4. 知识库管理

- **list_knowledge_bases()**: 列表所有知识库
- 支持创建新知识库

## Skill 触发条件

### 何时使用此 Skill

#### 知识检索
- 用户提出可能涉及团队内部知识的问题
- 用户询问关于文档、政策、规范或最佳实践
- 用户的问题超出基础知识范围
- 用户明确要求查询知识库

#### 知识存储
- 用户明确说"保存"、"存储"、"添加到知识库"
- 用户提供需要归档的重要信息或文档
- 用户要求将聊天记录或讨论内容保存

### 判断逻辑

```
如果 (用户问题涉及团队知识 OR 用户明确要求查询) {
    执行搜索操作
    将检索结果融入回答
}

如果 (用户明确要求保存 OR 用户提供重要信息需要归档) {
    执行存储操作
    返回存储结果和知识库信息
}
```

## 脚本说明

### ragflow_client.py

低级 API 客户端，直接与 RAGFlow API 交互。

**主要类**：
- `RAGFlowConfig`: 配置管理
- `RAGFlowClient`: API 客户端

**主要方法**：
- `check_connection()`: 验证连接
- `search_knowledge()`: 搜索
- `upload_document()`: 上传文档
- `activate_document()`: 激活文档
- `create_knowledge_base()`: 创建知识库

### ragflow_agent.py

高级 Agent 接口，提供简化的操作方法。

**主要类**：
- `RAGFlowAgent`: Agent 接口

**主要方法**：
- `configure()`: 配置连接
- `check_config()`: 检查配置
- `search()`: 搜索知识库
- `save_knowledge()`: 保存知识
- `list_knowledge_bases()`: 列表知识库

## 响应格式

### 搜索响应

```json
{
  "status": "success",
  "query": "搜索查询",
  "results_count": 3,
  "results": [
    {
      "id": "chunk_id",
      "content": "相关内容片段",
      "score": 0.95,
      "source": "document_name.pdf"
    }
  ]
}
```

### 存储响应

```json
{
  "status": "success",
  "message": "Knowledge saved and activated successfully",
  "kb_name": "knowledge-base-name",
  "kb_id": "kb_123",
  "file_name": "document.txt",
  "document_info": {
    "id": "doc_456",
    "name": "document.txt",
    "size": 2048,
    "status": "active"
  }
}
```

## 错误处理

常见错误及解决方案：

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| `RAGFlow is not configured` | 未配置连接 | 运行 configure 命令 |
| `Cannot connect to RAGFlow server` | 连接失败 | 检查 URL 和网络 |
| `API returned status 401` | API Key 无效 | 验证 API Key |
| `File not found` | 文件不存在 | 检查文件路径 |

## 最佳实践

### 搜索优化
- 使用清晰、具体的查询词
- 根据需要调整 `top_k` 参数
- 如果知道知识库 ID，指定以提高效率

### 存储优化
- 为知识库使用有意义的名称
- 提供清晰的文件名便于识别
- 定期整理和更新知识库

### 上下文管理
- 在回答中包含知识来源
- 将检索结果自然融入回答
- 告知用户信息来自知识库

## 配置文件

配置保存在: `~/.ragflow/config.json`

```json
{
  "url": "http://your-ragflow-url",
  "api_key": "your-api-key"
}
```

**安全性**: 文件权限设置为 600，仅所有者可读写。

## 环境变量

也可以通过环境变量配置：

```bash
export RAGFLOW_URL="http://your-ragflow-url"
export RAGFLOW_API_KEY="your-api-key"
```

## 参考文档

- [API 参考](references/api_reference.md) - 详细的 RAGFlow API 文档
- [使用指南](references/usage_guide.md) - 详细的使用说明和示例
- RAGFlow 官方: http://210.16.171.116:40080/user-setting/api

## 支持的文件格式

- PDF (.pdf)
- Word (.docx, .doc)
- Text (.txt)
- Markdown (.md)
- Excel (.xlsx, .xls)
- PowerPoint (.pptx)

## 故障排查

### 检查连接
```bash
python scripts/ragflow_agent.py check-config
```

### 测试搜索
```bash
python scripts/ragflow_agent.py search "test query"
```

### 查看配置
```bash
cat ~/.ragflow/config.json
```

所有操作都会返回详细的 JSON 响应，包含错误信息和调试信息。
