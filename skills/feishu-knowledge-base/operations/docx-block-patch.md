## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 对文档具备编辑权限
- 已知 document_id 与 block_id

## 操作步骤

1. 调用更新块内容接口
2. 处理限频错误，建议指数退避

请求地址：
https://open.feishu.cn/open-apis/docx/v1/documents/:document_id/blocks/:block_id

请求方法：
PATCH

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

路径参数：
- document_id
- block_id

请求体字段以官方文档为准

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- document_id: 文档 ID
- block_id: 块 ID

## 输出结果

- 更新后的块内容

## 失败与重试

- 99991400 应用频控
- 429 文档并发编辑频控
- 4031770032 forbidden 权限不足

## 安全与合规提示

- 控制写入频率与并发
