## 前提条件

- 已获取 refresh_token，且 refresh_token 只能使用一次
- 已开通 offline_access 权限并在授权时声明
- 用户必须拥有应用使用权限，否则会报 20010

## 操作步骤

1. 调用 OAuth 令牌接口刷新 user_access_token
2. 更新本地 access_token 与 refresh_token

请求地址：
https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token

请求方法：
POST

请求头：
Content-Type: application/json; charset=utf-8

请求体字段：
- grant_type 固定为 refresh_token
- client_id
- client_secret
- refresh_token
- scope（可选，用于缩减权限范围）

请求体示例：
{"grant_type":"refresh_token","client_id":"cli_xxx","client_secret":"secret_xxx","refresh_token":"refresh_xxx"}

## 输入参数

- grant_type: refresh_token
- client_id: App ID
- client_secret: App Secret
- refresh_token: 刷新令牌
- scope: 需要缩减的权限范围

## 输出结果

- access_token: 新的 user_access_token
- expires_in: 有效期秒数
- refresh_token: 新的刷新令牌

## 失败与重试

- refresh_token 过期
- 用户授权超过 365 天需重新授权
- 刷新失败时的处理流程：
  1. 按 operations/authorize.md 获取授权链接，提示用户完成授权并拿到 code
  2. 按 operations/get-user-access-token.md 使用 code 换取新的 access_token 与 refresh_token
  3. 原子性更新 config/credentials.yaml 中的 access_token 与 refresh_token

## 安全与合规提示

- 刷新后立即替换旧 token，旧 token 不再可用
- 不要记录或泄露 refresh_token
