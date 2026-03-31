## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- 节点编辑权限
- 原父节点容器编辑权限
- 目的父节点容器编辑权限
- 已知 space_id 与 node_token

## 操作步骤

1. 使用 access_token 调用移动知识空间节点接口
2. 可指定目标父节点或目标知识空间

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/spaces/:space_id/nodes/:node_token/move

请求方法：
POST

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

路径参数：
- space_id
- node_token

请求体字段：
- target_parent_token（可选）
- target_space_id（可选）

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- space_id: 知识空间 ID
- node_token: 节点 token
- target_parent_token: 目标父节点 token
- target_space_id: 目标知识空间 ID

## 输出结果

- 移动结果

## 失败与重试

- 400131002 param err 传参有误
- 400131003 out of limit 超出限制
- 400131006 permission denied 权限不足
- 400131001 rpc fail 可稍后重试

## 安全与合规提示

- 跨空间移动需同时具备源与目标容器编辑权限
