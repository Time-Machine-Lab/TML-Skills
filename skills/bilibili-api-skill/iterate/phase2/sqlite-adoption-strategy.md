# bilibili-api-skill SQLite 方案定案

## 定案

二期统一采用以下方案：

- 运行时版本：`Node 22.13+`
- SQLite 接入方式：Node 内置 `node:sqlite`

## 安装口径

后续统一要求：

1. 安装 Node `22.13+`
2. 在 skill 根目录执行 `npm install`
3. 初始化 runtime
4. 直接运行 skill

## 约束

后续实现统一遵守：

- 不再兼容 Node 20
- 不使用 `better-sqlite3` 作为正式方案
- 不使用 `sql.js` 作为主持久化方案
- 不要求额外安装 SQLite npm 驱动
- 不要求额外安装系统级 `sqlite3`

## 对 skill 的要求

- `package.json` 的 `engines.node` 统一为 `>=22.13`
- SQLite 数据文件放在 runtime root 下管理

这就是二期关于 SQLite 的正式方案。
