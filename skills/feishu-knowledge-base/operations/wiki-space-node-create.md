## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 对父节点具备容器编辑权限
- 已知 space_id

## 操作步骤

1. 使用 access_token 调用创建知识空间节点接口
2. 处理权限或配额限制的错误

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/spaces/:space_id/nodes

请求方法：
POST

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

路径参数：
- space_id

请求体字段：
- obj_type
- node_type
- parent_node_token（可选）
- origin_node_token（node_type=shortcut 时必填）
- title（可选）

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- space_id: 知识空间 ID
- obj_type: docx、sheet、mindnote、bitable、file
- node_type: origin 或 shortcut
- parent_node_token: 父节点 token
- origin_node_token: 快捷方式对应实体 token
- title: 节点标题

## 输出结果

- 新创建的节点信息

## 失败与重试

- 400131002 param err 传参有误
- 400131003 out of limit 超出限制
- 400131006 permission denied 权限不足
- 400131009 lock contention 可稍后重试
- 400131010 doc type is deprecated 请使用 docx
- 400131001 rpc fail 可稍后重试

## 安全与合规提示

- 不支持创建旧版 doc 类型
