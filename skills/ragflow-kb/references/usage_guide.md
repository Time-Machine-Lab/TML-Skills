# RAGFlow Skill 使用指南

## 概述

本 Skill 提供与 RAGFlow 知识库的集成，支持：
- 配置和验证 RAGFlow 连接
- 从知识库检索相关知识
- 将内容保存到知识库

## 第一步：配置 RAGFlow

### 获取配置信息

访问 RAGFlow API 文档获取必要信息：
- **URL**: RAGFlow 服务器地址 (例如: `http://210.16.171.116:40080`)
- **API Key**: 从 RAGFlow 用户设置中获取

### 配置方式

#### 方式 1: 通过 Agent 配置
```python
agent.configure(url="http://your-ragflow-url", api_key="your-api-key")
```

#### 方式 2: 环境变量
```bash
export RAGFLOW_URL="http://your-ragflow-url"
export RAGFLOW_API_KEY="your-api-key"
```

#### 方式 3: 命令行
```bash
python ragflow_agent.py configure --url http://your-ragflow-url --api-key your-api-key
```

### 验证配置

```bash
python ragflow_agent.py check-config
```

输出示例：
```json
{
  "status": "configured",
  "url": "http://210.16.171.116:40080",
  "connection": {
    "status": "success",
    "message": "RAGFlow connection successful"
  }
}
```

## 第二步：使用 RAGFlow

### 1. 检索知识

#### 场景
当用户提出以下类型的问题时，应该从知识库检索：
- 关于团队内部知识的问题
- 关于项目文档的查询
- 关于公司政策的询问
- 关于技术规范的问题

#### 使用方法

```python
from ragflow_agent import RAGFlowAgent

agent = RAGFlowAgent()

# 搜索知识库
result = agent.search(
    query="用户提出的问题",
    kb_id=None,  # 可选，指定特定知识库
    top_k=10     # 返回前 10 个结果
)
```

#### 命令行使用
```bash
python ragflow_agent.py search "你的查询问题" --top-k 10
```

#### 响应示例
```json
{
  "status": "success",
  "query": "团队的开发规范是什么",
  "results_count": 3,
  "results": [
    {
      "id": "chunk_1",
      "content": "开发规范第一条...",
      "score": 0.95,
      "source": "development_guide.md"
    }
  ]
}
```

### 2. 存储知识

#### 场景
当用户明确提出以下操作时，应该存储知识：
- "将这个内容保存到知识库"
- "存储这个文档"
- "添加这个信息到知识库"

#### 使用方法

```python
from ragflow_agent import RAGFlowAgent

agent = RAGFlowAgent()

# 方式 1: 直接保存文本内容
result = agent.save_knowledge(
    content="要保存的内容文本",
    kb_name="知识库名称",
    file_name="optional_filename.txt"
)

# 方式 2: 从文件读取内容
with open("document.txt", "r") as f:
    content = f.read()

result = agent.save_knowledge(
    content=content,
    kb_name="知识库名称",
    file_name="document.txt"
)
```

#### 命令行使用
```bash
# 直接保存文本
python ragflow_agent.py save --kb-name "team-knowledge" --content "要保存的内容"

# 从文件保存
python ragflow_agent.py save --kb-name "team-knowledge" --file document.txt
```

#### 响应示例
```json
{
  "status": "success",
  "message": "Knowledge saved and activated successfully",
  "kb_name": "team-knowledge",
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

### 3. 列表知识库

查看所有可用的知识库：

```bash
python ragflow_agent.py list
```

响应示例：
```json
{
  "status": "success",
  "count": 2,
  "knowledge_bases": [
    {
      "id": "kb_1",
      "name": "team-knowledge",
      "doc_count": 5,
      "chunk_count": 100
    },
    {
      "id": "kb_2",
      "name": "project-docs",
      "doc_count": 3,
      "chunk_count": 50
    }
  ]
}
```

## Skill 触发条件

### 何时使用此 Skill

Agent 应该在以下情况下使用此 Skill：

#### 1. 知识检索触发
- 用户提出可能涉及团队内部知识的问题
- 用户询问关于文档、政策或规范的信息
- 用户提出的问题超出 Agent 的基础知识范围
- 用户明确要求查询知识库

#### 2. 知识存储触发
- 用户明确说"保存"、"存储"、"添加到知识库"
- 用户提供需要归档的重要信息
- 用户要求将聊天记录或文档保存到知识库

### 判断逻辑

```
如果 (用户问题涉及团队知识 OR 用户明确要求查询) {
    执行搜索操作
}

如果 (用户明确要求保存 OR 用户提供重要信息需要归档) {
    执行存储操作
}
```

## 错误处理

### 常见错误

#### 1. 未配置 RAGFlow
```json
{
  "status": "error",
  "message": "RAGFlow is not configured"
}
```

**解决方案**: 运行配置命令

#### 2. 连接失败
```json
{
  "status": "error",
  "message": "Cannot connect to RAGFlow server"
}
```

**解决方案**: 检查 URL 和网络连接

#### 3. API Key 无效
```json
{
  "status": "error",
  "message": "API returned status 401"
}
```

**解决方案**: 验证 API Key 是否正确

## 最佳实践

### 1. 搜索优化
- 使用清晰、具体的查询词
- 指定 `top_k` 参数控制结果数量
- 如果知道知识库 ID，指定 `kb_id` 以提高效率

### 2. 存储优化
- 为知识库使用有意义的名称
- 提供清晰的文件名便于后续识别
- 定期整理和更新知识库内容

### 3. 上下文管理
- 在搜索结果中包含来源信息
- 将检索到的知识融入回答
- 告知用户信息来自知识库

## 配置文件位置

配置文件保存在: `~/.ragflow/config.json`

文件格式：
```json
{
  "url": "http://your-ragflow-url",
  "api_key": "your-api-key"
}
```

**注意**: 配置文件权限设置为 600，仅所有者可读写。

## 故障排查

### 检查连接
```bash
python ragflow_agent.py check-config
```

### 测试搜索
```bash
python ragflow_agent.py search "test query"
```

### 查看日志
脚本会输出详细的 JSON 响应，包含错误信息。

## 相关文档

- [API 参考](api_reference.md) - 详细的 API 端点文档
- RAGFlow 官方文档: http://210.16.171.116:40080/user-setting/api
