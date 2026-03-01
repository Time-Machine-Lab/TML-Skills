---
name: image-generation
description: 通用的 AI 图像生成服务。支持文生图 (Text-to-Image) 和图生图 (Image-to-Image)。集成了即梦 (Jimeng) 和 Nano-banana 等多个模型接口。当用户需要生成图片、设计封面、进行风格迁移或修改图片时调用。
---

# Image Generation Skill

本 Skill 封装了通用的 AI 图像生成能力，支持多种模型和生成方式。其他 Skill（如 `xianyu-post-gen`）可以通过调用本 Skill 中的脚本或参考本 Skill 的规范来生成图片。

## 1. 能力概览

| 功能 | 支持模型 | 脚本 | 特点 |
| :--- | :--- | :--- | :--- |
| **文生图 (T2I)** | Nano-banana | `nanabana_api_client.js` | 支持 4K 高清、多种比例、失败不扣费。推荐用于高质量封面。 |
| **文生图 (T2I)** | Jimeng (即梦) | `jimeng_api_client.js` | 字节跳动旗下模型，中文理解能力强。 |
| **图生图 (I2I)** | Nano-banana | `nanabana_img2img_client.js` | 支持单张或多张参考图进行风格迁移、重绘。 |
| **文生图/文图生图** | Midjourney (MJ) | `mj_imagine_client.js` | 对接 `/mj/submit/imagine` + `/mj/task/{id}/fetch`，支持轮询与下载。 |

## 2. 配置说明

所有脚本共用配置文件 `api_config.json`。

**配置文件路径**: `skills/image-generation/scripts/api_config.json`

```json
{
  "api_key": "YOUR_KEY",
  "base_url": "https://api.bltcy.top"
}
```

- `api_key` 为必填。
- `base_url` 为可选，默认 `https://api.bltcy.top`。
- 可通过环境变量 `IMAGE_API_CONFIG=/abs/path/to/api_config.json` 临时覆盖配置文件路径（便于测试）。

## 3. 详细使用指南

### 3.1 Nano-banana 文生图 (推荐)

**脚本**: `skills/image-generation/scripts/nanabana_api_client.js`

**用途**: 生成高质量的电商封面、海报、插画。

**参数**:
- `--prompt` (必填): 提示词
- `--model`: 模型名称，默认 `nano-banana-2-4k`
- `--aspect-ratio`: 图片比例，支持 `1:1`, `16:9`, `4:3`, `3:4`, `9:16`, `2:3`, `3:2`
- `--image-size`: 图片大小，支持 `1K`, `2K`, `4K`（默认 `1K`）
- `--download`: 输出文件路径

**示例**:
```bash
node skills/image-generation/scripts/nanabana_api_client.js \
  --prompt "电商海报，极简风格，荧光绿背景" \
  --model "nano-banana-2-4k" \
  --aspect-ratio "3:4" \
  --image-size "4K" \
  --download "output/cover.png"
```

### 3.2 Nano-banana 图生图 (风格迁移)

**脚本**: `skills/image-generation/scripts/nanabana_img2img_client.js`

**用途**: 基于参考图生成特定风格（如动漫、素描）的新图片。支持多图输入。

**参数**:
- `--image-path` (必填): 输入图片路径，支持多个路径（空格分隔）。**注意：单张图片建议小于 5MB，避免请求过大导致 413 错误。**
- `--prompt` (必填): 风格描述提示词
- `--model`: 模型名称，默认 `nano-banana-2-4k`
- `--aspect-ratio`: 输出比例
- `--download`: 输出文件路径

**单图示例**:
```bash
node skills/image-generation/scripts/nanabana_img2img_client.js \
  --image-path "input/photo.jpg" \
  --prompt "Anime style, 2D illustration" \
  --download "output/anime_version.png"
```

**多图示例**:
```bash
node skills/image-generation/scripts/nanabana_img2img_client.js \
  --image-path "input/pose.jpg" "input/style.jpg" \
  --prompt "Combine pose and style, vibrant colors" \
  --download "output/combined.png"
```

### 3.3 Jimeng (即梦4.5) 文生图/图生图

**脚本**: `skills/image-generation/scripts/jimeng_api_client.js`

**用途**: 备用模型，适合需要特定中文语境理解的场景。默认使用 `doubao-seedream-4-5-251128` 模型。支持多图参考和批量生成。

**参数**:
- `--prompt` (必填): 提示词
- `--size`: 尺寸 (支持 `2K`, `1920x1920` 等，默认 `2K`)。**注意：即梦4.5模型要求最小像素数为 3,686,400 (即 1920x1920)。**
- `--image`: (可选) 参考图 URL，支持多张 (空格分隔)。
- `--n`: (可选) 生成数量，支持 1-4 张 (默认 1)。
- `--download`: 输出文件路径。如果生成多张，会自动添加 `_0`, `_1` 后缀。

**文生图示例**:
```bash
node skills/image-generation/scripts/jimeng_api_client.js \
  --prompt "一只可爱的猫" \
  --size "2K" \
  --download "output/cat.png"
```

**多图参考 + 批量生成示例**:
```bash
node skills/image-generation/scripts/jimeng_api_client.js \
  --prompt "生成3张女孩和奶牛玩偶在游乐园开心地坐过山车的图片，涵盖早晨、中午、晚上" \
  --image "https://example.com/ref1.png" "https://example.com/ref2.png" \
  --n 3 \
  --size "2K" \
  --download "output/story.png"
```

### 3.4 Midjourney (MJ) 文生图/文图生图

**脚本**: `skills/image-generation/scripts/mj_imagine_client.js`

**用途**: 对接 MJ 的 `imagine` 提交接口与任务查询接口，支持纯文本与带参考图两种模式。

**CLI 参数**:
- `--prompt` (必填): 提示词
- `--image-path` (可选): 文图生图输入，可传本地路径、URL 或 data URI，支持多张
- `--route-prefix` (可选): 路由前缀，常用 `fast`、`mj-fast`（默认读取配置或使用 `fast`）
- `--base-url` (可选): 覆盖 API 域名
- `--notify-hook` (可选): 回调地址
- `--no-poll` (可选): 仅提交任务，不轮询
- `--poll-interval` (可选): 轮询间隔（秒）
- `--poll-timeout` (可选): 最长轮询时间（秒）
- `--download` (可选): 任务成功后下载图片到本地

**MJ 参数传递规则（重点）**:
- 比例、版本、风格强度等 MJ 参数需要写在 `--prompt` 里，不是独立 CLI 参数。
- 脚本默认会自动补 `--v 7`（当 prompt 未显式包含 `--v` / `--version` 时）。
- 如果你在 prompt 里手动写了版本（如 `--v 6.1`），脚本会保留你的显式设置。
- 常用写法：
  - `--ar 9:16`：手机竖屏比例
  - `--ar 3:4`：竖版封面常用比例
  - `--ar 1:1`：方图
  - `--v 7`：指定模型版本（当前默认推荐）
  - `--stylize 100`：风格化强度
  - `--chaos 10`：结果多样性
  - `--seed 12345`：固定随机种子（便于复现）

**手机竖屏壁纸推荐**:
- 在 prompt 末尾固定追加：`--ar 9:16 --v 7`

**文生图示例**:
```bash
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "手机竖屏壁纸，赛博城市夜景，霓虹灯雨夜，超清细节，--ar 9:16 --v 7" \
  --route-prefix fast \
  --download "output/mj_wallpaper_9x16.png"
```

**文图生图示例**:
```bash
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "基于参考图重绘为手机竖屏壁纸，紫蓝渐变星云，玻璃质感光效，--ar 9:16 --v 7" \
  --image-path "input/ref1.png" "input/ref2.png" \
  --route-prefix fast \
  --download "output/mj_i2i_wallpaper_9x16.png"
```

**MJ 输出说明（重点）**:
- `imageUrl`: 默认是 4 宫格合图。
- `imageUrls`: 这是 4 张单图链接（你需要的单图结果）。
- 当前脚本 `--download` 下载的是 `imageUrl`（4 宫格）。如果要 4 张单图，请从 `imageUrls` 下载。

**下载 4 张单图示例**:
```bash
# 先执行 MJ 脚本并保存 JSON 输出
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "手机竖屏壁纸，赛博城市夜景，--ar 9:16 --v 7" \
  --route-prefix fast > output/mj_result.json

# 从 imageUrls 下载 4 张单图（需要 jq）
jq -r '.imageUrls[].url' output/mj_result.json | nl -v1 | while read i url; do
  curl -L "$url" -o "output/mj_single_${i}.png"
done
```

## 4. 最佳实践 (Best Practices)

1.  **封面图生成**: 优先使用 `Nano-banana` + `4K` 模式，配合高对比度提示词（参考 `cover-prompt-seed.md`）。
2.  **错误处理**: 脚本已内置重试机制。如果生成失败，建议检查 `api_config.json` 中的 Key 是否有效。
3.  **路径规范**: 输出路径建议使用绝对路径，或相对于项目根目录的路径。
4.  **MJ 比例控制**: MJ 的比例参数通过 prompt 传递，手机壁纸固定使用 `--ar 9:16`。
