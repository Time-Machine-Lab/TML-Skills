## 前提条件

- 已获取可用 `access_token`（建议先执行 `node scripts/auth.js status`）
- 对目标目录具备上传权限
- 已知目标目录 token（`parent_node`）
- 本地文件路径存在且可读取

## 操作步骤

1. 确认上传目标目录 token 与本地文件路径
2. 调用素材上传接口（`drive/v1/medias/upload_all`）
3. 使用返回的 `file_token` 进行后续挂载或节点创建（按业务需要）

请求地址：
https://open.feishu.cn/open-apis/drive/v1/medias/upload_all

请求方法：
POST

请求头：
Authorization: Bearer access_token  
Content-Type: multipart/form-data

表单字段（multipart）：
- file_name
- parent_type（通常为 `explorer`）
- parent_node（目录 token）
- size（文件字节数）
- file（二进制文件）

关键约束：
- 文件上传必须使用 `multipart/form-data` 二进制直传。
- 禁止将文件内容转为 Base64 后再上传（会显著增大体积并带来额外性能开销）。

## 建议调用方式（本 skill 内置脚本）

```bash
node scripts/upload_media.js "<file_path>" explorer "<parent_node>" [file_name]
```

示例：
```bash
node scripts/upload_media.js "D:/docs/spec.pdf" explorer "fldcnxxxxxxxxxxxx"
```

中文防乱码说明：
- 脚本已使用 UTF-8 方式传输 `file_name`，并在 multipart 文件头同时携带 `filename` 与 `filename*`（RFC 5987）以兼容中文文件名。
- 建议传入明确的 `file_name`，例如：
  ```bash
  node scripts/upload_media.js "D:/docs/项目计划书.pdf" explorer "fldcnxxxxxxxxxxxx" "项目计划书.pdf"
  ```

## 输入参数

- access_token: user_access_token 或 tenant_access_token
- file_path: 本地文件路径
- parent_type: 目录类型（通常 `explorer`）
- parent_node: 目标目录 token
- file_name: 飞书侧显示文件名（可选，默认使用本地文件名）

## 输出结果

- 上传结果对象
- 常见关键字段：`file_token`、`name`、`size`、`url`（以接口实际返回为准）

## 失败与重试

- 401/鉴权错误：先执行 `node scripts/auth.js refresh`，必要时重新授权
- 403/权限不足：直接告知用户当前账号无上传权限，不做无效重试
- 400/参数错误：重点检查 `parent_node`、`parent_type`、`size` 与文件路径
- 网络失败：可安全重试一次

## 安全与合规提示

- 不要改写用户原文件内容（直传场景默认只上传）
- 不记录 token 到日志
- 大文件上传前确认网络稳定和空间配额
