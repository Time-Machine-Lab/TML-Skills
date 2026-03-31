## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 具备文档创建权限

## 操作步骤

1. 调用创建文档接口
2. 处理文档权限与频控限制

请求地址：
https://open.feishu.cn/open-apis/docx/v1/documents

请求方法：
POST

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

请求体字段以官方文档为准，常见包括：
- title
- folder_token（可选）

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- title: 文档标题
- folder_token: 目标文件夹 token

## 输出结果

- document_id 等文档信息

## 失败与重试

- 4001770001 invalid param
- 4041770002 not found
- 4031770040 no folder permission
- 4001770036 folder locked
- 4001770037 folder size exceeded limit
- 5001771001 server internal error

## 安全与合规提示

- 确认创建位置的权限与配额限制
