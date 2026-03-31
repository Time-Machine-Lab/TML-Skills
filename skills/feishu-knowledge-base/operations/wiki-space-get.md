## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- 应用或用户为知识空间成员或管理员
- 已知 space_id

## 操作步骤

1. 使用 access_token 调用获取知识空间信息接口
2. 需要时指定 lang 查询参数

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/spaces/:space_id

请求方法：
GET

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8
access_token 可为 tenant_access_token 或 user_access_token

路径参数：
- space_id

查询参数：
- lang（可选，默认 en）

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- space_id: 知识空间 ID
- lang: 返回语言

## 输出结果

- 知识空间信息

## 失败与重试

- 400131005 not found
- 400131006 permission denied
- 400131001 rpc fail 可稍后重试

## 安全与合规提示

- 确保 access_token 对目标空间有访问权限
