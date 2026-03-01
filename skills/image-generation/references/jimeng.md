# Jimeng（即梦）使用说明

## 目录

- 1. 支持能力
- 2. 入口脚本
- 3. 参数说明
- 4. 示例
- 5. 输出与下载
- 6. 常见错误与排查

## 1. 支持能力

- 文生图
- 图生图（支持 URL、本地路径和 data URI）
- 批量生成（`n=1-4`）

适用场景：
- 中文语义理解要求较高的生成任务
- 多图参考融合
- 一次输出多张候选图

先读：
- `references/common.md`

## 2. 入口脚本

- `skills/image-generation/scripts/jimeng_api_client.js`

执行：
```bash
node skills/image-generation/scripts/jimeng_api_client.js ...
```

## 3. 参数说明

- `--prompt` 必填，提示词
- `--model` 可选，默认 `doubao-seedream-4-5-251128`
- `--response-format` 可选，`url` 或 `b64_json`，默认 `url`
- `--size` 可选，默认 `2K`
- `--n` 可选，默认 `1`，仅允许 `1` / `2` / `3` / `4`
- `--image` 可选，参考图，可传多个（空格分隔）
- `--seed` 可选，整数
- `--guidance-scale` 可选，浮点数
- `--watermark` 可选，布尔值字符串（`true/false/1/0/yes/no/on/off`）
- `--download` 可选，输出文件路径
- `--timeout` 可选，超时秒数，默认 `60`
- `--retry` 可选，重试次数，默认 `2`
- `--retry-delay` 可选，重试基准延迟毫秒，默认 `800`

约束提示：
- 即梦 4.5 常见要求是较高分辨率，建议使用 `2K` 或满足最小像素要求的尺寸。

## 4. 示例

文生图：
```bash
node skills/image-generation/scripts/jimeng_api_client.js \
  --prompt "一只可爱的猫" \
  --size "2K" \
  --download "output/cat.png"
```

多图参考 + 批量生成：
```bash
node skills/image-generation/scripts/jimeng_api_client.js \
  --prompt "生成3张女孩和奶牛玩偶在游乐园开心坐过山车的图片，分别表现早晨、中午、晚上" \
  --image "https://example.com/ref1.png" "https://example.com/ref2.png" \
  --n 3 \
  --size "2K" \
  --download "output/story.png"
```

## 5. 输出与下载

- 标准输出会打印完整 JSON。
- 当 `--response-format url` 且提供 `--download` 时：
  - 单张结果下载到给定路径。
  - 多张结果自动命名为 `xxx_0.ext`、`xxx_1.ext` 等。

## 6. 常见错误与排查

- `Invalid --n. Use: 1, 2, 3, or 4`
  - `--n` 超出范围。
- `Invalid --seed value` / `Invalid --guidance-scale value`
  - 参数类型错误。
- `watermark must be true/false`
  - 使用标准布尔字符串。
- `Error encoding image`
  - 本地图片路径不存在或不可读。
- `unexpected argument ... found`（PowerShell 常见）
  - 提示词含空格时优先使用单引号：`--prompt 'A B C'`。
- 配置错误
  - 检查 `skills/image-generation/scripts/api_config.json` 中 `api_key` 与 `base_url`。
