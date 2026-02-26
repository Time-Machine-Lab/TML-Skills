---
name: image-generation
description: 通用的 AI 图像生成服务。支持文生图 (Text-to-Image) 和图生图 (Image-to-Image)。集成了即梦 (Jimeng) 和 Nano-banana 等多个模型接口。当用户需要生成图片、设计封面、进行风格迁移或修改图片时调用。
---

# Image Generation Skill

本 Skill 封装了通用的 AI 图像生成能力，支持多种模型和生成方式。其他 Skill（如 `xianyu-post-gen`）可以通过调用本 Skill 中的脚本或参考本 Skill 的规范来生成图片。

## 1. 能力概览

| 功能 | 支持模型 | 脚本 | 特点 |
| :--- | :--- | :--- | :--- |
| **文生图 (T2I)** | Nano-banana | `nanabana_api_client.py` | 支持 4K 高清、多种比例、失败不扣费。推荐用于高质量封面。 |
| **文生图 (T2I)** | Jimeng (即梦) | `jimeng_api_client.py` | 字节跳动旗下模型，中文理解能力强。 |
| **图生图 (I2I)** | Nano-banana | `nanabana_img2img_client.py` | 支持单张或多张参考图进行风格迁移、重绘。 |

## 2. 配置说明

所有脚本共用配置文件 `api_config.json`。

**配置文件路径**: `skills/image-generation/scripts/api_config.json`

```json
{
  "api_key": "YOUR_KEY"
}
```

## 3. 详细使用指南

### 3.1 Nano-banana 文生图 (推荐)

**脚本**: `skills/image-generation/scripts/nanabana_api_client.py`

**用途**: 生成高质量的电商封面、海报、插画。

**参数**:
- `--prompt` (必填): 提示词
- `--model`: 模型名称，默认 `nano-banana-2-4k`
- `--aspect-ratio`: 图片比例，支持 `1:1`, `16:9`, `4:3`, `3:4`, `9:16`, `2:3`, `3:2`
- `--image-size`: 图片大小，支持 `1K`, `2K`, `4K`（默认 `1K`）
- `--download`: 输出文件路径

**示例**:
```bash
python skills/image-generation/scripts/nanabana_api_client.py \
  --prompt "电商海报，极简风格，荧光绿背景" \
  --model "nano-banana-2-4k" \
  --aspect-ratio "3:4" \
  --image-size "4K" \
  --download "output/cover.png"
```

### 3.2 Nano-banana 图生图 (风格迁移)

**脚本**: `skills/image-generation/scripts/nanabana_img2img_client.py`

**用途**: 基于参考图生成特定风格（如动漫、素描）的新图片。支持多图输入。

**参数**:
- `--image-path` (必填): 输入图片路径，支持多个路径（空格分隔）。**注意：单张图片建议小于 5MB，避免请求过大导致 413 错误。**
- `--prompt` (必填): 风格描述提示词
- `--model`: 模型名称，默认 `nano-banana-2-4k`
- `--aspect-ratio`: 输出比例
- `--download`: 输出文件路径

**单图示例**:
```bash
python skills/image-generation/scripts/nanabana_img2img_client.py \
  --image-path "input/photo.jpg" \
  --prompt "Anime style, 2D illustration" \
  --download "output/anime_version.png"
```

**多图示例**:
```bash
python skills/image-generation/scripts/nanabana_img2img_client.py \
  --image-path "input/pose.jpg" "input/style.jpg" \
  --prompt "Combine pose and style, vibrant colors" \
  --download "output/combined.png"
```

### 3.3 Jimeng (即梦4.5) 文生图/图生图

**脚本**: `skills/image-generation/scripts/jimeng_api_client.py`

**用途**: 备用模型，适合需要特定中文语境理解的场景。默认使用 `doubao-seedream-4-5-251128` 模型。支持多图参考和批量生成。

**参数**:
- `--prompt` (必填): 提示词
- `--size`: 尺寸 (支持 `2K`, `1920x1920` 等，默认 `2K`)。**注意：即梦4.5模型要求最小像素数为 3,686,400 (即 1920x1920)。**
- `--image`: (可选) 参考图 URL，支持多张 (空格分隔)。
- `--n`: (可选) 生成数量，支持 1-4 张 (默认 1)。
- `--download`: 输出文件路径。如果生成多张，会自动添加 `_0`, `_1` 后缀。

**文生图示例**:
```bash
python skills/image-generation/scripts/jimeng_api_client.py \
  --prompt "一只可爱的猫" \
  --size "2K" \
  --download "output/cat.png"
```

**多图参考 + 批量生成示例**:
```bash
python skills/image-generation/scripts/jimeng_api_client.py \
  --prompt "生成3张女孩和奶牛玩偶在游乐园开心地坐过山车的图片，涵盖早晨、中午、晚上" \
  --image "https://example.com/ref1.png" "https://example.com/ref2.png" \
  --n 3 \
  --size "2K" \
  --download "output/story.png"
```

## 4. 最佳实践 (Best Practices)

1.  **封面图生成**: 优先使用 `Nano-banana` + `4K` 模式，配合高对比度提示词（参考 `cover-prompt-seed.md`）。
2.  **错误处理**: 脚本已内置重试机制。如果生成失败，建议检查 `api_config.json` 中的 Key 是否有效。
3.  **路径规范**: 输出路径建议使用绝对路径，或相对于项目根目录的路径。
