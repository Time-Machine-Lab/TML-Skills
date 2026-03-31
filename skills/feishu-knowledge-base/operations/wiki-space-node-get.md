## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 对节点具备阅读权限

## 操作步骤

1. 使用 access_token 调用获取知识空间节点信息接口
2. 如使用云文档 token，需传入对应 obj_type

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node

请求方法：
GET

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

查询参数：
- token
- obj_type（可选）

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- token: 节点 token 或云文档 token
- obj_type: docx、sheet、mindnote、bitable、wiki

## 输出结果

- 节点信息

## 失败与重试

- 400131002 param err 传参有误
- 400131005 not found 相关数据不存在
- 400131006 permission denied 权限不足
- 400131001 rpc fail 可稍后重试

## 安全与合规提示

- 使用云文档 token 时确保 obj_type 与文档类型一致
