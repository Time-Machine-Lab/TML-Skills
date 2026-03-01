# Midjourney（MJ）使用说明

## 目录

- 1. 支持能力
- 2. 入口脚本
- 3. 参数说明
- 4. MJ 参数传递规则
- 5. 示例
- 6. 输出与下载
- 7. 常见错误与排查

## 1. 支持能力

- 文生图（imagine）
- 文图生图（prompt + 参考图）
- 任务轮询（提交后查询直至完成）

适用场景：
- 艺术化风格图
- 手机壁纸和创意探索图
- 需要 MJ 风格控制参数（`--ar` / `--v` / `--stylize` 等）的任务

先读：
- `references/common.md`

## 2. 入口脚本

- `skills/image-generation/scripts/mj_imagine_client.js`

执行：
```bash
node skills/image-generation/scripts/mj_imagine_client.js ...
```

## 3. 参数说明

- `--prompt` 必填，提示词
- `--image-path` 可选，参考图输入（本地路径 / URL / data URI，支持多张）
- `--base-url` 可选，覆盖 API 域名
- `--route-prefix` 可选，默认读取配置或使用 `fast`
- `--notify-hook` 可选，回调地址
- `--no-poll` 可选，只提交不轮询
- `--poll-interval` 可选，轮询间隔秒，默认 `3`
- `--poll-timeout` 可选，轮询最长秒，默认 `600`
- `--timeout` 可选，请求超时秒，默认 `120`
- `--retry` 可选，重试次数，默认 `2`
- `--retry-delay` 可选，重试基准延迟毫秒，默认 `800`
- `--download` 可选，下载结果到本地
- `--download-mode` 可选，`grid` / `single` / `both`，默认 `grid`

## 4. MJ 参数传递规则

- 比例、版本、风格强度等 MJ 参数写在 `--prompt` 内，不是独立 CLI 参数。
- 脚本会在 prompt 未指定版本时自动追加 `--v 7`。
- 若 prompt 已显式设置版本（如 `--v 6.1`），脚本保留你的设置。

常用参数写法（写在 prompt 里）：
- `--ar 9:16` 手机竖屏
- `--ar 3:4` 竖版封面
- `--ar 1:1` 方图
- `--v 7` 版本
- `--stylize 100` 风格化强度
- `--chaos 10` 多样性
- `--seed 12345` 固定随机种子

## 5. 示例

文生图：
```bash
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "手机竖屏壁纸，赛博城市夜景，霓虹灯雨夜，超清细节 --ar 9:16 --v 7" \
  --route-prefix fast \
  --download "output/mj_wallpaper_9x16.png"
```

文图生图：
```bash
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "基于参考图重绘为手机竖屏壁纸，紫蓝渐变星云，玻璃质感光效 --ar 9:16 --v 7" \
  --image-path "input/ref1.png" "input/ref2.png" \
  --route-prefix fast \
  --download "output/mj_i2i_wallpaper_9x16.png"
```

只提交任务不轮询：
```bash
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "未来都市概念图 --ar 16:9 --v 7" \
  --no-poll
```

## 6. 输出与下载

- 提交后会先输出 submit JSON（含任务 ID）。
- 轮询模式会继续输出 task JSON。
- `--download-mode grid`：下载 `imageUrl`（通常是 4 宫格合图）。
- `--download-mode single`：下载 `imageUrls` 里的单图。
- `--download-mode both`：同时下载宫格图和单图。
- 多张单图会自动命名为 `xxx_single_1.ext`、`xxx_single_2.ext`。

示例（下载 4 张单图）：
```bash
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "手机壁纸，赛博城市夜景 --ar 9:16 --v 7" \
  --route-prefix fast \
  --download "output/mj_result.png" \
  --download-mode both
```

## 7. 常见错误与排查

- `Missing required argument: --prompt`
  - 提示词未传入。
- `No task id found in submit result.result`
  - 提交响应结构异常或接口变更。
- `Polling timed out`
  - 提高 `--poll-timeout` 或拉大 `--poll-interval`。
- `Task finished but imageUrl is empty`
  - 可改用 `--download-mode single` 从 `imageUrls` 下载。
- `unexpected argument ... found`（PowerShell 常见）
  - 提示词含空格时优先使用单引号：`--prompt 'A B C --ar 9:16 --v 7'`。
- 配置错误
  - 检查 `skills/image-generation/scripts/api_config.json` 中 `api_key`、`base_url`，以及可选 `mj_route_prefix`、`mj_base_url`。
