## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- 应用或用户拥有知识空间访问权限，否则可能返回空列表

## 操作步骤

1. 使用 access_token 调用获取知识空间列表接口
2. 根据 has_more 与 page_token 进行分页

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/spaces

请求方法：
GET

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

查询参数：
- page_size（最大 50）
- page_token

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- page_size: 分页大小
- page_token: 分页标记

## 输出结果

- 知识空间列表
- has_more 与 page_token 用于分页

## 失败与重试

- 400131002 参数错误
- 400131006 权限不足
- 400131001 下游 RPC 失败可稍后重试

## 安全与合规提示

- 仅请求与业务相关的空间数据
