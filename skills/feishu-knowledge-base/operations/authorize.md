## 前提条件

- 需要应用 App ID（client_id）
- 需要配置并校验 redirect_uri（必须在开放平台后台已配置）
- 授权时从配置读取 redirect_uri
- 需要确定用户授权的 scope 列表
- 授权时从配置读取 scope，按配置中的权限发起授权
- 授权码 code 有效期 5 分钟且只能使用一次

## 操作步骤

1. 生成授权页 URL 并引导用户访问
2. 用户同意授权后浏览器跳转至 redirect_uri，并携带 code 与 state
3. 校验 state 防止 CSRF

授权页地址：
https://accounts.feishu.cn/open-apis/authen/v1/authorize

必填查询参数：
- client_id
- response_type 固定为 code
- redirect_uri

可选查询参数：
- scope（空格分隔，按配置中的权限拼接）
- state
- code_challenge 与 code_challenge_method（PKCE）
- prompt=consent

请求示例：
GET https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=cli_a5d611352af9d00b&redirect_uri=https%3A%2F%2Fexample.com%2Fapi%2Foauth%2Fcallback%2F%23%2Flogin%0A&scope=bitable:app:readonly%20contact:contact&state=RANDOMSTRING

## 输入参数

- client_id: App ID
- response_type: code
- redirect_uri: 回调地址，需 URL 编码（按配置读取）
- scope: 需要用户增量授权的权限列表（按配置中的权限拼接）
- state: 防止 CSRF 的随机字符串
- code_challenge: PKCE code_challenge
- code_challenge_method: S256 或 plain
- prompt: consent

## 输出结果

- 浏览器跳转到 redirect_uri 并携带 code 与 state

## 失败与重试

- code 过期或已使用需要重新发起授权
- redirect_uri 未配置会被安全校验拦截

## 安全与合规提示

- 必须校验 state
- 仅请求业务所需的最小 scope
