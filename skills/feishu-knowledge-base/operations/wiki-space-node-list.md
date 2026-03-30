## 前提条件

- 已获取 access_token（tenant_access_token 或 user_access_token）
- access_token 对父节点具备阅读权限
- 已知 space_id

## 操作步骤

1. 使用 access_token 调用获取知识空间子节点列表接口
2. 根据 has_more 与 page_token 进行分页

请求地址：
https://open.feishu.cn/open-apis/wiki/v2/spaces/:space_id/nodes

请求方法：
GET

请求头：
Authorization: Bearer access_token
Content-Type: application/json; charset=utf-8

路径参数：
- space_id（若查询我的文档库可替换为 my_library）

查询参数：
- page_size（最大 50）
- page_token
- parent_node_token（可选）

## 输入参数

- access_token: tenant_access_token 或 user_access_token
- space_id: 知识空间 ID
- page_size: 分页大小
- page_token: 分页标记
- parent_node_token: 父节点 token

## 输出结果

- 子节点列表
- has_more 与 page_token 用于分页

## 失败与重试

- 400131002 param err 传参有误
- 400131005 not found 相关数据不存在
- 400131006 permission denied 权限不足
- 400131001 rpc fail 可稍后重试

## 安全与合规提示

- 确保 access_token 对父节点有读取权限
