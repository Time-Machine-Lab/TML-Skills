# Init 模块

## 作用

负责账号初始化、运行目录初始化、登录态建立和环境自检。

## 什么时候进入本模块

- 第一次使用这个 skill
- 切换了新的 `runtime-root`
- Bilibili 登录态失效
- `system doctor` 提示 cookie / refresh token 缺失

## 本模块负责的事情

- 初始化 `runtime-root`
- 建立 `config / data / products / video-pools`
- 完成二维码登录
- 检查 cookie、refresh token、watch 状态、候选池目录是否存在

## 推荐命令与用途

```bash
node scripts/bili.js init status
node scripts/bili.js init start --runtime-root </绝对路径> --reset true
node scripts/bili.js auth qr-generate
node scripts/bili.js auth qr-poll
node scripts/bili.js system doctor
```

命令说明：

- `init status`
  作用：查看当前 runtime 指向哪里、是否初始化过
- `init start --runtime-root </绝对路径> --reset true`
  作用：创建新的运行目录并写入默认配置
  关键参数：
  - `--runtime-root`：运行态根目录，必须是绝对路径
  - `--reset true`：清空并重建该运行目录，首次初始化时推荐使用
- `auth qr-generate`
  作用：生成二维码文件和终端 ASCII 二维码
- `auth qr-poll`
  作用：在扫码确认后写入 cookie 与 refresh token
- `system doctor`
  作用：做总体验证，决定是否可以进入 `product`

## 执行顺序

1. 先确认 Node 版本是 `22.13+`
2. 再看 `init status`
3. 首次使用时执行 `init start`
4. 用 `auth qr-generate` 生成二维码
5. 扫码确认后执行 `auth qr-poll`
6. 用 `system doctor` 看剩余缺口

## 输出里重点看什么

- `init status`
  - `currentRuntimeRoot`
  - `initialized`
  - `recommendedSequence`
- `auth qr-generate`
  - `qrSvgPath`
  - `qrPngPath`
  - `qrcodeKey`
- `system doctor`
  - `checks`
  - `nextSteps`
  - `recommendedFlows`

## 完成标志

- `system doctor` 中登录态相关检查通过
- 运行目录和候选池目录已经写入
- 可以继续进入 `product` 模块

## 常见错误

- Node 版本低于 `22.13`，后续无法按二期方案接入内置 `node:sqlite`
- 没有先 `npm install`，导致二维码或图片相关依赖缺失
- 用相对路径传 `--runtime-root`
- 扫码后没有执行 `auth qr-poll`
