## 目录索引功能（按需）
仅在用户提出“索引/缓存/路径映射/减少重复查询”等需求时阅读本节。

### 目标
- 建立本地索引，缓存空间/节点/文档的稳定标识（space_id、node_token、document_id、block_id）与路径映射，减少重复查询。
- 支持快速定位父节点与文档，尤其是多级嵌套的知识库结构。
- 以知识库（space_id）为维度切分索引文件，避免单文件过大，并支持渐进式读取。

### 索引数据结构（建议）
- 索引文件位置：统一放在 `references/index/` 目录下。
- 文件拆分策略：
  - 全局空间索引：`references/index/spaces.json`，保存空间列表及 `space_id` 与 `space_name` 的映射。
  - 空间专属索引：`references/index/{space_id}.json`，保存该知识库下的节点树与文档映射。
- `spaces.json` 基础结构示例：
  - metadata：全局索引版本、更新时间。
  - spaces：space_id 与 space_name 映射。
- `{space_id}.json` 基础结构示例：
  - metadata：该空间索引的更新时间。
  - nodes：以 node_token 为主键，保存 parent_token、obj_type、obj_token、title、path。
  - docs：以 document_id 为主键，保存 node_token、title、page_block_id。
  - path_map：以“父路径/文档名”作为键，映射到 node_token 或 document_id。

### 构建流程
1. 获取知识空间列表（wiki-space-list），构建并写入 `spaces.json`。
2. 当需要操作某个具体的知识库时，按需获取该 `space_id` 的节点树（wiki-space-node-list）。
3. 对该空间下的 obj_type=docx 的节点，提取 document_id（obj_token）并构建 docs。
4. 将该空间的节点和路径映射原子写入 `{space_id}.json`，并更新其 metadata。

### 查询策略
- 查询空间：直接读取 `spaces.json` 命中 space_id。
- 查询节点/文档：根据目标空间，读取对应的 `{space_id}.json`。
- 优先本地索引命中：路径 → node_token/document_id。
- 未命中时回源查询：拉取目标空间节点树或文档列表，仅更新该 `{space_id}.json` 后重试。

### 更新与失效策略
- 手动刷新：用户显式要求“更新索引/重新同步”。
- 事件触发：创建/移动/删除节点或文档后，增量更新相关条目。
- 失效回退：索引命中但返回 404/不存在时，触发回源重建该路径。
- 周期刷新：可选，按天/小时刷新 metadata（仅在频繁变动时启用）。

### 流程设计（建议执行路径）
1. 初始化
   - 无需前置读取配置文件。
   - 检查 `references/index/spaces.json` 是否存在，若不存在则标记为首次构建。
2. 空间索引构建
   - 获取知识空间列表，生成 `spaces.json`。
3. 空间内部按需构建
   - 当访问特定 space_id 时，检查 `references/index/{space_id}.json`。
   - 若不存在，获取该空间节点树，生成对应节点的 `path_map` 和 `docs` 结构并写入。
4. 查询与使用
   - 用户输入空间与路径 → 查 `spaces.json` 获 space_id → 查 `{space_id}.json` 命中。
   - 命中后直接使用 node_token/document_id 执行后续操作。
5. 回源与修复
   - 若 `{space_id}.json` 缺失或命中失败 → 回源拉取该空间节点树 → 更新对应的 `{space_id}.json`。
   - 更新后再次查询并继续流程。
6. 变更后的增量维护
   - 创建/移动/删除节点时，仅更新对应的 `{space_id}.json`。
   - 若发现节点不存在或权限变更，触发对应空间的局部或全量重建。