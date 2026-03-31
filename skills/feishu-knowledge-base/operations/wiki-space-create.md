## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- 应用或用户具备知识空间管理权限
- 已明确空间名称、可见性与类型

## 操作步骤

1. 使用 access_token 调用创建知识空间接口
2. 处理权限或配额限制的错误

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/spaces

请求方法：
POST

请求头：
Authorization: Bearer user_access_token
Content-Type: application/json; charset=utf-8

请求体字段：
- name: 知识空间名称
- description: 知识空间描述
- open_sharing: 知识空间分享状态，open 或 closed

## 输入参数

- user_access_token: 用户访问凭证
- name: 知识空间名称
- description: 知识空间描述
- open_sharing: 知识空间分享状态，open 或 closed

## 输出结果

- 新创建的知识空间信息

## 失败与重试

- 400131001 rpc fail 服务报错，可稍后重试，必要时携带响应头 x-tt-logid 咨询
- 400131002 param err 传参有误（如类型不匹配）
- 400131003 out of limit 超出操作限制
- 400131004 invalid user 非法用户
- 400131005 not found 相关数据不存在（空间/节点/文档等）
- 400131006 permission denied 权限不足
- 400131007 internal err 服务内部错误，不要重试，携带响应头 x-tt-logid 咨询

## 安全与合规提示

- 创建前确认权限与空间配额限制
