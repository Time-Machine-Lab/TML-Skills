---
name: xianyu-post-gen
description: 为闲鱼帖子生成高质量内容与封面方案。用于用户希望基于产品介绍文档，一次性产出可发布的闲鱼标题、正文、封面提示词、竞品借鉴与发布检查清单。支持工作区模式（input/output）、实时检索同类帖子、闲鱼兼容表情清洗（移除 Unicode emoji 并替换为 [] 风格）。
---

# Xianyu Post Gen

用途：当用户有创建闲鱼帖子需求时，使用本 skill。agent 负责对话、需求澄清与内容生成；脚本只负责初始化工作区与即梦生成图片。

## 1. 触发条件

用户出现“要发布闲鱼帖子/想生成闲鱼文案/要写闲鱼标题和正文/要做闲鱼封面”等意图时，启用本 skill。

## 2. 种子与参考体系（核心能力）

### 2.1 种子 (Seed)

- 定义：某一类闲鱼商品帖子在“标题/正文结构/卖点表达/交易边界/信任提示”的通用模式。
- 存储位置：`references/seed/*.md`
- 当前种子：
  - `references/seed/ai-tutorial-seed.md`
  - `references/seed/cloud-deploy-seed.md`

### 2.2 种子参考库

- 存储位置：`references/document/seed/<seed_name>/`
- 用途：为该类种子提供真实参考帖样本（Top 5）

### 2.3 原始数据

- `references/*.jsonl` 为原始爬取数据
- 新数据进入后，需要进行“特征提取 + 归类 + 参考库补充”

## 3. 工作区创建

先创建一个新的工作区：

```bash
python skills/xianyu-post-gen/scripts/init_workspace.py <workspace_path>
```

`init_workspace.py` 参数说明：
- `workspace`（位置参数，必填）：工作区路径（建议带时间戳或商品名）

示例：
```bash
python skills/xianyu-post-gen/scripts/init_workspace.py workspaces/xianyu_20260224_macbook
```

工作区结构：
- `input/context.txt`
- `input/product_brief.md`
- `input/similar_posts.txt`
- `output/`

提示：工作区路径建议带时间戳或商品名，便于后续管理。

## 4. 需求澄清与输入补充

agent 需要以“友好 + 最少打扰”的方式提问，优先收集以下信息并写入 `input/`：
- `input/context.txt`: 发帖目标、语气偏好（真实/专业/简洁/情绪化）、价格策略、禁用词
- `input/product_brief.md`: 商品名称、类型（实物/虚拟）、成色、价格、卖点、瑕疵、交易方式、发货方式、同城优先与否
- `input/similar_posts.txt`: 可选，用户补充竞品/参考帖

用户可自行编辑 `input/` 文件后再继续。

必须等待用户确认：
- agent 完成 `input/` 填充后，必须给用户明确选择，并等待用户回复再继续
- 允许的选项必须包含以下三类：
  - 选项 A：用户现在补充更多信息（agent 继续提问并写入 `input/`）
  - 选项 B：用户自己去编辑 `input/` 文件（agent 等待用户确认“已编辑完成”）
  - 选项 C：用户允许 agent 按当前信息自由发挥（但仍需明确确认“是否按当前内容生成”）
- 只有在用户明确选择并确认后，才能进入生成步骤

如果用户明确表示“先出一版”，agent 可基于现有信息合理发散，但必须遵守质量规则。

## 5. 生成内容（agent 负责）

agent 读取并综合：
- `input/` 下所有内容
- `references/seed/` 与 `references/document/seed/` 中的参考样本
- `assets/emojis.json` 的表情映射规则

输出内容写入 `output/`：
- `output/post.md`: 最终可发布帖子（包含标题与正文）
- `output/cover_prompt.md`: 封面图提示词（中文为主，包含风格、质感、构图、信息层级）

生成规则：
- 标题 <= 30 字
- 正文包含：商品信息、价格/成色、瑕疵、交易方式
- 不编造“官方授权/保真无风险”等无法验证承诺
- 虚拟商品必须包含“发货后不退不换”
- 严禁输出 Unicode emoji，必须严格且仅能使用 `assets/emojis.json` 中定义的 `[]` 表情。
- 严禁使用 Markdown 加粗语法（如 **text**），因为闲鱼不支持，直接输出纯文本即可。
- 借鉴参考帖子但不抄袭，保留用户产品独特卖点

封面提示词质量规范（必须遵守）：
- `output/cover_prompt.md` 至少输出 2 个可用方案（A/B）
- 每个方案必须包含：主体、信息层级、构图、配色、风格质感、背景/道具、光线
- 信息层级必须明确：主标题、核心卖点（1-3 条）、价格/关键承诺区位
- 视觉风格要“电商封面可用”，避免空泛描述（如“高级感/好看/简约”）
- 文案与商品类型强绑定，避免通用模板
- 需要有可执行的排版描述（如“左上主标题/右下价格条/中间产品主视觉”）

## 6. 封面图流程（必须询问）

生成帖子后，必须询问用户是否需要封面图：
- 如果不需要，流程结束
- 如果需要，继续询问比例与数量

必须询问的信息：
- 比例：常用 `3:4`、`9:16`、`1:1`
- 数量：默认 1 张，用户可指定多张
- 若用户有其它比例/分辨率需求，允许直接提供分辨率（如 `1024x1536`）

多套提示词选择：
- 若 `output/cover_prompt.md` 中包含多套方案（A/B/...），必须先询问用户选择哪几套用于生成
- 默认建议用户选择 1~3 套

## 7. 图片生成（通过 image-generation skill）

本 Skill 不再直接包含图片生成脚本，而是通过调用 `image-generation` skill 来实现。

### 7.1 提示词种子 (Prompt Seed)

- **种子位置**: `skills/xianyu-post-gen/references/seed/cover-prompt-seed.md`
- **使用原则**: 优先参考种子库中的模板（如“经典电商大字报”）。

### 7.2 调用 image-generation skill

请参考 `skills/image-generation/SKILL.md` 文档。

常用调用路径：
- Nano-banana 文生图: `skills/image-generation/scripts/nanabana_api_client.py`
- Jimeng 文生图: `skills/image-generation/scripts/jimeng_api_client.py`

### 7.3 图片保存规则

- 下载路径必须放到 `output/` 下，例如：`output/cover_3x4_1.png`
- 多张时按序号命名：`output/cover_3x4_1.png`、`output/cover_3x4_2.png`
- 生成完成后，agent 告知用户下载路径

## 8. 新数据导入与种子提取（重要）

当用户提供新的 `*.jsonl` 数据时，agent 需要完成以下步骤：

1. **抽取 Top 5 参考帖**
   - 以“想要人数”排序，取前 5
   - 输出为 `references/document/seed/<seed_name>/<data_name>_reference.md`

2. **归类到现有种子**
   - 若内容属于“AI 教程/资料/工具”，归入 `ai-tutorial-seed`
   - 若内容属于“云服务器/部署/运维”，归入 `cloud-deploy-seed`
   - 若无法归类，新增种子文件并创建对应参考目录

3. **更新种子特征**
   - 从新增参考帖提炼：标题结构、常见卖点、交付/交易边界、常见标签
   - 更新对应 `references/seed/<seed_name>.md`

4. **同步表情映射**
   - 从新数据中提取可用的 `[]` 表情标签
   - 补充到 `assets/emojis.json`

## 9. 目录结构

```text
./skills/xianyu-post-gen/
├─ SKILL.md
├─ assets/
│  └─ emojis.json
├─ references/
│  ├─ seed/
│  │  ├─ ai-tutorial-seed.md
│  │  ├─ cloud-deploy-seed.md
│  │  └─ cover-prompt-seed.md
│  ├─ document/
│  │  └─ seed/
│  │     ├─ ai-tutorial-seed/
│  │     └─ cloud-deploy-seed/
│  └─ *.jsonl
└─ scripts/
   └─ init_workspace.py
```
