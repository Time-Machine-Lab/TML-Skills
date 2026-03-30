## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 对文档具备阅读权限
- 已知 document_id 与 block_id

## 操作步骤

1. 调用获取块信息接口

请求地址：
https://open.feishu.cn/open-apis/docx/v1/documents/:document_id/blocks/:block_id

请求方法：
GET

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

路径参数：
- document_id
- block_id

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- document_id: 文档 ID
- block_id: 块 ID

## 输出结果

- 块信息

## 失败与重试

- 4001770001 invalid param
- 4031770032 forbidden
- 5001771001 server internal error

## 安全与合规提示

- 控制查询频率避免触发限流
