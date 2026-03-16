# RAGFlow API 参考

## 基础信息

- **API 文档**: http://210.16.171.116:40080/user-setting/api
- **基础 URL**: `http://210.16.171.116:40080/api/v1`
- **认证**: Bearer Token (API Key)

## 主要端点

### 1. 用户信息
```
GET /api/v1/user/info
```
获取当前用户信息，用于验证连接。

**响应示例**:
```json
{
  "id": "user_id",
  "name": "username",
  "email": "user@example.com"
}
```

### 2. 知识库管理

#### 列表知识库
```
GET /api/v1/knowledge_bases
```

**响应示例**:
```json
{
  "knowledge_bases": [
    {
      "id": "kb_id",
      "name": "Knowledge Base Name",
      "description": "Description",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "doc_count": 5,
      "chunk_count": 100
    }
  ]
}
```

#### 创建知识库
```
POST /api/v1/knowledge_bases
```

**请求体**:
```json
{
  "name": "Knowledge Base Name",
  "description": "Optional description"
}
```

**响应示例**:
```json
{
  "id": "kb_id",
  "name": "Knowledge Base Name",
  "description": "Optional description"
}
```

### 3. 文档管理

#### 上传文档
```
POST /api/v1/knowledge_bases/{kb_id}/documents
```

**请求**: multipart/form-data
- `file`: 文件内容 (支持 PDF, DOCX, TXT, MD 等)

**响应示例**:
```json
{
  "id": "doc_id",
  "name": "document_name.pdf",
  "size": 1024,
  "status": "pending",
  "created_at": "2024-01-01T00:00:00Z"
}
```

#### 激活文档
```
PATCH /api/v1/knowledge_bases/{kb_id}/documents/{doc_id}
```

**请求体**:
```json
{
  "status": "active"
}
```

**说明**: 文档必须激活后才能被索引和搜索。

### 4. 搜索

#### 搜索知识库
```
POST /api/v1/knowledge_bases/search
```

**请求体**:
```json
{
  "query": "search query",
  "kb_id": "optional_kb_id",
  "top_k": 10
}
```

**响应示例**:
```json
{
  "results": [
    {
      "id": "chunk_id",
      "content": "Relevant content snippet",
      "score": 0.95,
      "source": "document_name.pdf",
      "page": 1
    }
  ]
}
```

## 错误处理

常见错误码:
- `200`: 成功
- `201`: 创建成功
- `400`: 请求参数错误
- `401`: 认证失败 (API Key 无效)
- `403`: 权限不足
- `404`: 资源不存在
- `500`: 服务器错误

## 认证

所有请求都需要在 Header 中包含:
```
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

## 工作流程

### 配置阶段
1. 获取 RAGFlow URL 和 API Key
2. 调用 `/api/v1/user/info` 验证连接
3. 保存配置到本地

### 搜索阶段
1. 用户提出查询
2. 调用 `/api/v1/knowledge_bases/search` 搜索
3. 返回相关结果

### 存储阶段
1. 获取或创建知识库
2. 上传文档到 `/api/v1/knowledge_bases/{kb_id}/documents`
3. 激活文档 (PATCH 状态为 active)
4. 返回存储结果

## 支持的文件格式

- PDF (.pdf)
- Word (.docx, .doc)
- Text (.txt)
- Markdown (.md)
- Excel (.xlsx, .xls)
- PowerPoint (.pptx)

## 限制

- 单个文件大小限制: 通常 100MB
- 单次搜索结果数: 最多 100 条
- API 请求频率: 根据服务器配置
