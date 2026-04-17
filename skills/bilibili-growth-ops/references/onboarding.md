# 初始化与登录

## 适用场景

- 第一次安装这个技能包
- 运行目录还没初始化
- 还没有可用的 B 站登录态

## 默认入口

```bash
node scripts/ops.js runtime bootstrap
node scripts/ops.js runtime doctor
node scripts/ops.js auth qr-start
node scripts/ops.js auth qr-poll
node scripts/ops.js account self-get
```

## 目标

- 建好统一运行目录
- 完成环境自检
- 建立单账号登录态
- 让后续产品、策略、任务都能在同一套运行环境下运行

## 进入下一步

- 如果账号已就绪，转到 [product-workspace.md](product-workspace.md)
- 如果要先看整体任务结构，转到 [strategy-task-work.md](strategy-task-work.md)
