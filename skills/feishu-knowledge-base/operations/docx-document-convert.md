## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 对文档具备阅读权限

## 操作步骤

1. 调用文档格式转换接口

请求地址：
https://open.feishu.cn/open-apis/docx/v1/documents/:document_id/convert

请求方法：
POST

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

路径参数：
- document_id

请求体字段以官方文档为准

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- document_id: 文档 ID

## 输出结果

- 转换结果信息

## 失败与重试

- 4001770001 invalid param
- 4041770002 not found
- 4031770032 forbidden
- 5001771001 server internal error

## 安全与合规提示

- 注意转换格式与权限范围
