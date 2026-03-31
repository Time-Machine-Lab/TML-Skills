## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 具备文档读取权限

## 操作步骤

1. 调用获取文档列表接口
2. 如有分页，按 page_token 继续查询

请求地址：
https://open.feishu.cn/open-apis/docx/v1/documents

请求方法：
GET

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

查询参数：
- page_size
- page_token

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- page_size: 分页大小
- page_token: 分页标记

## 输出结果

- 文档列表
- has_more 与 page_token 用于分页

## 失败与重试

- 4001770001 invalid param
- 4031770032 forbidden
- 5001771001 server internal error

## 安全与合规提示

- 根据业务需要控制拉取范围与频率
