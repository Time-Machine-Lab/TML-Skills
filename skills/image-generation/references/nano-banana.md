# Nano-banana 使用说明

## 目录

- 1. 支持能力
- 2. 入口脚本
- 3. 文生图（T2I）
- 4. 图生图（I2I）
- 5. 常见错误与排查

## 1. 支持能力

- 文生图（Text-to-Image）
- 图生图（Image-to-Image，支持单图和多图输入）

适用场景：
- 电商封面、海报、插画
- 参考图风格迁移与重绘

先读：
- `references/common.md`

## 2. 入口脚本

- 文生图：`skills/image-generation/scripts/nanabana_api_client.js`
- 图生图：`skills/image-generation/scripts/nanabana_img2img_client.js`

说明：
- 脚本文件名使用 `nanabana_*`，模型名使用 `nano-banana-*`，调用时以脚本实际文件名为准。

## 3. 文生图（T2I）

脚本：
- `node skills/image-generation/scripts/nanabana_api_client.js`

参数：
- `--prompt` 必填，提示词
- `--model` 可选，默认 `nano-banana-2-4k`
- `--response-format` 可选，`url` 或 `b64_json`，默认 `url`
- `--aspect-ratio` 可选，默认 `1:1`
- `--image-size` 可选，`1K` / `2K` / `4K`，默认 `1K`
- `--download` 可选，输出文件路径
- `--timeout` 可选，超时秒数，默认 `120`
- `--retry` 可选，重试次数，默认 `2`
- `--retry-delay` 可选，重试基准延迟毫秒，默认 `800`

示例：
```bash
node skills/image-generation/scripts/nanabana_api_client.js \
  --prompt "电商海报，极简风格，荧光绿背景" \
  --model "nano-banana-2-4k" \
  --aspect-ratio "3:4" \
  --image-size "4K" \
  --download "output/cover.png"
```

返回：
- 标准输出打印完整 JSON
- 当 `--response-format url` 且提供 `--download` 时，自动下载 `data[0].url`

## 4. 图生图（I2I）

脚本：
- `node skills/image-generation/scripts/nanabana_img2img_client.js`

参数：
- `--image-path` 必填，本地输入图路径，支持多个路径（空格分隔）
- `--prompt` 必填，风格/重绘描述
- `--model` 可选，默认 `nano-banana-2-4k`
- `--aspect-ratio` 可选，默认 `1:1`
- `--image-size` 可选，`1K` / `2K` / `4K`，默认 `1K`
- `--download` 可选，输出文件路径
- `--timeout` 可选，超时秒数，默认 `120`
- `--retry` 可选，重试次数，默认 `2`
- `--retry-delay` 可选，重试基准延迟毫秒，默认 `800`

单图示例：
```bash
node skills/image-generation/scripts/nanabana_img2img_client.js \
  --image-path "input/photo.jpg" \
  --prompt "Anime style, 2D illustration" \
  --download "output/anime_version.png"
```

多图示例：
```bash
node skills/image-generation/scripts/nanabana_img2img_client.js \
  --image-path "input/pose.jpg" "input/style.jpg" \
  --prompt "Combine pose and style, vibrant colors" \
  --download "output/combined.png"
```

实现要点：
- 脚本会以 `FormData` 上传图像文件。
- 推荐 Node.js 18+（依赖运行时 `fetch` / `FormData` / `Blob`）。

## 5. 常见错误与排查

- `Missing required argument`
  - 检查 `--prompt` 或 `--image-path` 是否传入。
- `unexpected argument ... found`（PowerShell 常见）
  - 提示词含空格时，优先使用单引号：`--prompt 'A B C'`。
  - 新版本脚本会尝试把多余位置参数自动拼接回 `--prompt`，但仍建议显式加引号。
- `Invalid --image-size`
  - 仅支持 `1K` / `2K` / `4K`。
- `Image file not found`
  - 图生图输入路径不存在，检查当前工作目录或改用绝对路径。
- `HTTP 413`
  - 上传图片过大，优先压缩到更小尺寸后重试。
- 配置错误
  - 检查 `skills/image-generation/scripts/api_config.json` 中 `api_key` 是否有效。

补充说明：
- 若 `--download` 指向的目录不存在，脚本会自动创建目录后再写入图片。
- 生成大图（如 `4K`）时会有明显等待时间，CLI 会输出 `Generating image... please wait.` 提示。
