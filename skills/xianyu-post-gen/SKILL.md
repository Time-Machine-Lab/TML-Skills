---
name: xianyu-post-gen
description: 为闲鱼帖子生成高质量内容与封面方案。用于用户希望基于产品介绍文档，一次性产出可发布的闲鱼标题、正文、封面提示词、竞品借鉴与发布检查清单。支持工作区模式（input/output）、实时检索同类帖子、闲鱼兼容表情清洗（移除 Unicode emoji 并替换为 [] 风格）。
---

# Xianyu Post Gen

按工作区流程执行，默认不跳步。

## 1. 初始化工作区

优先使用工作区模式。先执行：

```bash
python skills/xianyu-post-gen/scripts/init_workspace.py <workspace_path>
```

初始化后目录应为：
- `input/context.txt`: 用户要求、风格偏好、价格策略、禁用词
- `input/product_brief.md`: 产品介绍文档（功能、特点、目标人群等）
- `input/similar_posts.txt`: 用户手工补充的竞品帖子（可选）
- `output/`: 生成结果目录

## 2. 读取输入并生成结果

执行：

```bash
python skills/xianyu-post-gen/scripts/run_workspace.py <workspace_path>
```

可选参数：
- `--style auto|normal|trust|concise|professional|emotional|urgent`
- `--max-variants 3`
- `--live-limit 5`
- `--live-timeout-sec 10`

脚本会自动：
- 合并 `input/` 下文档
- 检索参考库与实时闲鱼同类帖子
- 生成多版文案并挑选推荐稿
- 生成多套封面提示词
- 强制清洗成闲鱼可用表情格式（`[火]` 等）
- 写入 `output/` 文件

## 3. 输出交付顺序

优先按下列顺序向用户展示：
1. `output/market_insights.md`（竞品借鉴与定价锚点）
2. `output/cover_prompts.md`（封面图方案与提示词）
3. `output/post_variants.md`（多版帖子文案）
4. `output/post_best.md`（推荐发布稿）
5. `output/publish_checklist.md`（发布前检查）

如用户要结构化结果，返回 `output/result.json`。

## 4. 质量规则

必须满足：
- 标题 `<= 30` 字。
- 正文包含商品信息、价格/成色、瑕疵、交易方式。
- 不编造“官方授权/保真无风险”等无法验证承诺。
- 虚拟商品必须含“发货后不退不换”。
- 不输出 Unicode emoji，统一使用闲鱼兼容 `[]` 表情风格。
- 借鉴竞品但不照抄，保留用户产品独有卖点。

## 5. 脚本与资源

- `scripts/init_workspace.py`: 初始化 input/output 工作区。
- `scripts/run_workspace.py`: 工作区主流程，一键产出所有结果文件。
- `scripts/generate_post.py`: 帖子文案核心生成器。
- `scripts/xianyu_live_search.py`: 实时检索 goofish 同类帖子。
- `scripts/search_references.py`: 从本地 `references/` 召回竞品样本。
- `scripts/image_prompt_gen.py`: 封面图提示词生成。
- `scripts/text_formatter.py`: 模板格式化与闲鱼表情兼容清洗。
- `assets/styles.json`: 文案风格模板。
- `assets/emojis.json`: 闲鱼表情映射。

## 6. 失败兜底

- 若实时检索失败，继续使用本地 `references/`，并提示用户补充 `input/similar_posts.txt`。
- 若输入信息缺失，先让用户补充 `input/product_brief.md` 的核心字段，再重新运行。
