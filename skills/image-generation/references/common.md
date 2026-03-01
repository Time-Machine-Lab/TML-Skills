# Image Generation 通用调用规范

## 1. 环境要求

- 推荐 Node.js 18+（依赖运行时 `fetch` / `FormData` / `Blob`）。
- 配置文件默认位置：`skills/image-generation/scripts/api_config.json`
- 可通过环境变量覆盖配置：`IMAGE_API_CONFIG=/abs/path/to/api_config.json`

## 2. 统一可靠性参数

以下脚本都支持：
- `--timeout`：单次请求超时（秒）
- `--retry`：失败后重试次数（非负整数，默认 `2`）
- `--retry-delay`：重试基准延迟（毫秒，默认 `800`，指数退避）

重试触发场景（自动）：
- 网络错误、超时
- 常见临时性 HTTP 错误（如 `429`、`5xx`）

## 3. Shell 引号规范（重点）

在 Windows PowerShell 中，提示词包含空格时，优先使用单引号：

```powershell
--prompt 'A B C'
```

脚本已对“提示词被拆分成多个参数”的情况做自动合并，但仍建议显式加引号以减少歧义。

## 4. 输出与下载约定

- 传入 `--download` 时，若目录不存在会自动创建。
- 脚本会输出完整 JSON，便于上层 agent 继续处理。
- 大图生成（如 `4K`）会有等待时间，脚本会打印 `Generating... please wait.` 类提示。

## 5. 建议执行流程

1. 根据任务选择模型（Nano-banana / Jimeng / Midjourney）。
2. 仅加载目标模型文档（懒加载）。
3. 先小规模验证参数（尺寸、比例、prompt），再批量生成。
4. 请求失败优先调高 `--timeout`，其次增加 `--retry` 与 `--retry-delay`。

