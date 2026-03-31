## 前提条件

- 已获取授权码 code（5 分钟有效且只能使用一次）
- 已获取应用 App ID 与 App Secret
- 若使用 PKCE，需要准备 code_verifier
- 用户必须拥有应用使用权限，否则会报 20010

## 操作步骤

1. 调用 OAuth 令牌接口获取 user_access_token
2. 保存 access_token、expires_in、refresh_token（若返回）

请求地址：
https://open.feishu.cn/open-apis/authen/v1/oidc/access_token

请求方法：
POST

请求头：
Content-Type: application/json; charset=utf-8

请求体字段：
- grant_type 固定为 authorization_code
- client_id
- client_secret
- code
- redirect_uri（可选）
- code_verifier（PKCE 可选）
- scope（可选，用于缩减权限范围）

请求体示例：
{"grant_type":"authorization_code","client_id":"cli_xxx","client_secret":"secret_xxx","code":"code_xxx","redirect_uri":"https://example.com/api/oauth/callback","code_verifier":"verifier_xxx"}

## 输入参数

- grant_type: authorization_code
- client_id: App ID
- client_secret: App Secret
- code: 授权码
- redirect_uri: 回调地址
- code_verifier: PKCE 使用的随机字符串
- scope: 需要缩减的权限范围

## 输出结果

- access_token: user_access_token
- expires_in: 有效期秒数
- refresh_token: 仅在包含 offline_access 权限时返回

## 失败与重试

- code 过期或已使用需重新授权
- scope 未授权会报 20068
- scope 重复会报 20067

## 安全与合规提示

- 不要记录或泄露 access_token 与 refresh_token
- 建议基于 expires_in 进行过期管理
