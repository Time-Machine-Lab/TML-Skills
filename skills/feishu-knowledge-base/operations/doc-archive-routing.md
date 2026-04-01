## 前提条件

- 用户意图为“文档归档/归类到知识库路径”
- 已有文档标题与正文（或摘要）
- 本地缓存存在 `skills/feishu-knowledge-base/.cache/nodes_cache.json`

## 操作步骤

1. 用文档标题+正文调用归档推荐脚本，获取推荐知识库与路径：
   ```bash
   node scripts/suggest_archive_path.js "<doc_title>" "<doc_content_or_summary>" --top 3
   ```
2. 读取输出中的：
   - `confidence`
   - `recommendation.space_id`
   - `recommendation.target_node_token`
   - `recommendation.target_path`
3. 用户未指定归档目标时，直接使用 `recommendation` 执行归档（Agent 主观判断生效）。
4. `confidence` 仅用于解释推荐可信度，不作为执行阻断条件。
5. 路径回退规则（必须）：
   - 如果未命中明确文件夹（脚本返回 `target_path="/"`），直接归档到知识库根目录。
   - 禁止为了“看起来合理”而硬选类似 `归档/...` 的模糊目录。
6. 若命中路径失败（节点不存在/权限变化），先刷新缓存再重试一次；仍失败则回退到该知识库根目录执行。

## 输入参数

- doc_title: 待归档文档标题
- doc_content_or_summary: 正文或摘要
- top: 候选数量（建议 3）

## 输出结果

- recommendation: 推荐的知识库 `space_id` 和路径节点 `target_node_token`
- alternatives: 备选路径列表
- confidence: high / medium / low

## 失败与重试

- 缓存缺失：先通过空间列表和节点列表接口重建缓存
- 推荐路径无权限：停止自动归档，提示用户无权限
- 推荐路径不存在：刷新缓存后重算，仍失败则回退知识库根目录

## 安全与合规提示

- 推荐结果仅用于归档决策，不应泄露文档敏感内容
- 低置信度场景无需阻断执行，但应在结果回报中明确提示“自动归档，建议复核路径”
