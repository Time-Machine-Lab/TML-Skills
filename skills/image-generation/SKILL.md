---
name: image-generation
description: 通用 AI 图像生成与图像编辑能力。支持文生图和图生图，集成 Nano-banana、Jimeng、Midjourney。用于封面设计、海报/插画生成、风格迁移、参考图重绘、手机壁纸与营销素材生成等场景。先在本技能中选择模型与功能，再按索引加载 references 下的对应模型文档执行。
---

# Image Generation Skill

仅提供模型能力与文档索引。不要在本文件展开参数细节和完整调用示例。需要执行时，按模型加载 `references/` 对应文档。

## 模型与能力索引

| 模型 | 支持功能 | 适用场景 | 详细文档 |
| :--- | :--- | :--- | :--- |
| Nano-banana | 文生图、图生图（单图/多图） | 电商封面、海报、插画、风格迁移、重绘 | `references/nano-banana.md` |
| Jimeng（即梦） | 文生图、图生图、批量生成（1-4） | 中文语境生成、故事组图、备用模型 | `references/jimeng.md` |
| Midjourney（MJ） | 文生图、文图生图、任务轮询 | 艺术风格图、壁纸、创意探索 | `references/midjourney.md` |

## 通用调用规范

- 先读取：`references/common.md`
- 再按模型读取对应文档，不要一次性加载全部 references。

## 共享配置

- 配置文件：`skills/image-generation/scripts/api_config.json`
- 必填字段：`api_key`
- 可选字段：`base_url`（默认 `https://api.bltcy.top`）
- 临时覆盖：`IMAGE_API_CONFIG=/abs/path/to/api_config.json`

## 懒加载规则

1. 先加载 `references/common.md`，确认环境、引号规范、重试与输出约定。
2. 再根据需求选模型，不要一次性读取全部模型文档。
3. 仅加载目标模型文档：
   - Nano-banana：`references/nano-banana.md`
   - Jimeng：`references/jimeng.md`
   - Midjourney：`references/midjourney.md`
4. 执行命令前，核对参数约束、输入输出与错误处理建议。

## 快速选型

- 需要高质量商品封面/海报：优先 Nano-banana（可用 `4K`）。
- 需要中文语义稳定和批量产图：优先 Jimeng。
- 需要 MJ 风格和创意探索：使用 Midjourney。
