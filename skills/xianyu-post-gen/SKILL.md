---
name: xianyu-post-gen
description: 生成高质量闲鱼（二手交易）发布文案与封面图提示词。用于用户要“写闲鱼帖子/二手出售信息/优化成交文案/给出标题和标签/生成多风格版本”时，支持自动提取商品信息、匹配同类参考价、输出可直接发布的标题与正文。
---

# Xianyu Post Generator

按下面流程工作，不要跳步。

## 1. 收集必要信息

优先拿到这些字段：
- `商品名称`
- `成色`
- `售价`
- `转手原因`

可选但强烈建议：
- `原价`、`亮点`、`瑕疵`
- `配件`、`发货方式`、`地区`、`邮费`
- 是否为`虚拟商品`（课程/资料/账号等）

如果信息不足，先追问 1-3 个最关键缺口再生成。

## 2. 调用脚本

将用户信息整理为文本后执行：

```bash
py -3 skills/xianyu-post-gen/scripts/generate_post.py "<商品信息文本>" --json
```

若环境里没有 `py`，改用：

```bash
python skills/xianyu-post-gen/scripts/generate_post.py "<商品信息文本>" --json
```

可选参数：
- `--style normal|trust|concise|professional|emotional|urgent|auto`
- `--max-references 3`
- `--max-variants 2`

如果 `references/` 新增了预处理数据，先更新参考库：

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File skills/xianyu-post-gen/scripts/build_references.ps1
```

可选参数（增量场景）：
- `-RawDir <jsonl目录>`
- `-RefDir skills/xianyu-post-gen/references`
- `-TopPerCategory 20`

## 3. 输出给用户的格式

按这个顺序输出：
1. `参考价与竞品要点`（来自 `references`）
2. `封面图 Prompt`（来自 `image_prompt`）
3. `文案方案`（逐个展示 `variations`，每个方案放代码块）
4. `发布前检查清单`（价格、成色、瑕疵、发货、是否可小刀）

## 4. 质量规则

生成时强制满足：
- 标题不超过 30 字，信息明确，不堆叠夸张词。
- 正文包含：商品信息、核心亮点、瑕疵说明、交易方式。
- 不编造“全新/保修/官方渠道”等高风险承诺。
- 虚拟商品必须带“可复制，发货后不退不换”提示。
- 优先真实、可验证、可成交，不写空泛鸡汤。
- 优先匹配对应大类 reference 的高热度样本，避免跨类目错配。

## 5. 风格建议

- `normal`: 通用成交风格，适合大多数实物。
- `trust`: 强调真实描述和交易安全，适合高客单价。
- `concise`: 信息密度高，适合虚拟商品或快节奏成交。
- `professional`: 参数导向，适合数码/设备类。
- `emotional`: 轻情感表达，适合个人自用好物。
- `urgent`: 急出场景，强调效率。

## 6. 资源说明

- `scripts/generate_post.py`: 主入口，解析输入并生成多版本。
- `scripts/search_references.py`: 从 `references/reference_major_*.md` 打分召回竞品样例。
- `scripts/image_prompt_gen.py`: 生成闲鱼封面图提示词。
- `scripts/build_references.ps1`: 将 jsonl 预处理为大类 reference 和检索缓存。
- `scripts/validate_skill.py`: 快速检查依赖文件、reference 结构、脚本可运行性。
- `assets/styles.json`: 风格模板库，可扩展新风格。
- `assets/emojis.json`: 闲鱼风格符号映射。
- `references/REFERENCE_CATALOG.md`: 参考库总览与统计。
- `references/reference_major_*.md`: 大类参考库，按需加载。

如果用户要求“更像某类商品圈层话术”，先在 `styles.json` 增加样式，再调用脚本生成。

## 7. 参考库按需加载规则

先读 `references/REFERENCE_CATALOG.md`，再只加载一个最相关的大类文件：

- AI 与自动化: `reference_major_ai_and_automation.md`
- 编程与开发: `reference_major_programming_and_development.md`
- 部署与运维: `reference_major_deployment_and_ops.md`
- 账号与杂项: `reference_major_account_and_misc.md`
