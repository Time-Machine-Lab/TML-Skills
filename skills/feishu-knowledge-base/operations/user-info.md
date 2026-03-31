## 前提条件

- 已获取 user_access_token
- 若需要手机号、邮箱、用户受雇信息或 user_id 等敏感字段，需在开放平台开通对应权限

## 操作步骤

1. 使用 user_access_token 调用获取用户信息接口

请求地址：
https://open.feishu.cn/open-apis/authen/v1/user_info

请求方法：
GET

请求头：
Authorization: Bearer user_access_token
Content-Type: application/json; charset=utf-8

## 输入参数

- user_access_token: 用户访问凭证

## 输出结果

- 用户信息 data.user_info

## 失败与重试

- 20020001 参数错误
- 20020005 user_access_token 无效
- 20020008 用户不存在
- 20020021 用户离职
- 20020022 用户被冻结
- 20020023 用户未注册
- 50020050 系统错误可重试

## 安全与合规提示

- 手机号和邮箱可能为管理员导入信息，不能直接作为登录凭证
