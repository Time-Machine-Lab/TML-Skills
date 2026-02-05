---
name: "pic-search"
description: "Search for high-quality wallpapers on Wallhaven. Invoke when user wants to find images, wallpapers, or pictures based on keywords, colors, or categories."
---

# Wallhaven Search Skill

给大模型/工具调用的 Wallhaven 搜索 skill。

- 输入：一组查询参数（等价于 Wallhaven 搜索页 query string）
- 输出：图片链接数组（默认返回直链图片；可选返回详情页链接）

## 目录结构

- `search.js`：核心能力（构建 URL / 拉取 HTML / 解析结果）
- `cli.js`：命令行调用入口（便于大模型通过工具执行）

## 参数说明

这些参数会被拼到 `https://wallhaven.cc/search` 上：

- `q`：搜索关键词（必填）
- `sorting`：`favorites` | `relevance` | `random` | `toplist` | `hot` | `date_added`
- `topRange`：`1d` | `3d` | `1w` | `1M` | `3M` | `1y`（仅当 `sorting=toplist` 时可用，分别代表最近 1 天/3 天/1 周/1 个月/3 个月/1 年）
- `categories`：三个 `0/1` 组成的字符串，每一位代表 `general/anime/people`，默认 `111`
- `purity`：默认 `100`
- `ratios`：可多选，用 `,` 分隔。例如：`16x9,21x9`
- `atleast`：默认 `1920x1080`
- `order`：`asc` 或 `desc`，默认 `desc`
- `colors`：单选，可为空（不传或传空串即忽略）；枚举：
  `60000, 990000, cc0000, cc3333, ea4c88, 993399, 663399, 333399, 0066cc, 0099cc, 66cccc, 77cc33, 669900, 336600, 666600, 999900, cccc33, ffff00, ffcc33, ff9900, ff6600, cc6633, 996633, 663300, 000000, 999999, cccccc, ffffff, 424153`
- `page`：页码
- `direct`：不传默认输出直链图片；传 `false/0/no` 则输出详情页链接

### 关键词（q）写法建议

#### 基本原则

- **避免与其他参数重复**：
  - 如果已用 `categories` 限定范围（如 `--categories 010` 表示仅 anime），`q` 里不需要再写 `anime`
  - 如果已用 `colors` 筛选颜色，`q` 里不需要再写颜色词（如 `blue`/`pink`）
  - 示例：`--categories 010 --colors 0066cc` 时，`q` 写 `landscape` 即可，无需 `anime landscape blue`

#### 高级搜索语法

Wallhaven 支持以下搜索语法：

| 语法 | 说明 | 示例 |
|------|------|------|
| `id:数字` | 按标签 ID 精确搜索 | `id:37` |
| `+关键词` | 必须包含（AND） | `+landscape +sunset` |
| `-关键词` | 排除关键词 | `landscape -anime` |
| `@用户名` | 搜索指定用户上传的壁纸 | `@AlphaCoders` |
| `like:壁纸ID` | 搜索相似壁纸 | `like:85okex` |
| `type:png/jpg` | 限定图片格式 | `type:png` |

#### 常用搜索示例

```bash
# 风景壁纸，排除动漫风格
--q "landscape nature -anime -cartoon"

# 搜索特定标签（如 cyberpunk 标签 ID 为 37）
--q "id:37"

# 组合多个必须包含的关键词
--q "+mountain +snow +sunset"

# 搜索某用户上传的壁纸
--q "@username"

# 搜索与某张壁纸相似的图片
--q "like:85okex"

# 极简风格桌面壁纸
--q "minimalist desktop clean"

# 赛博朋克城市夜景
--q "cyberpunk city night neon"
```

#### 关键词选择技巧

1. **使用英文**：Wallhaven 以英文标签为主，英文关键词效果更好
2. **具体优于抽象**：`cherry blossom` 比 `flower` 更精准
3. **组合场景词**：`mountain lake sunset` 比单独 `mountain` 结果更符合预期
4. **善用排除**：用 `-` 排除不想要的内容，如 `-logo -watermark`

> 解析策略：优先匹配你提供的 DOM 结构：
> `<a class="jsAnchor overlay-anchor wall-favs" data-href="https://wallhaven.cc/wallpaper/fav/0p82om">`
> 并从 `data-href` 中提取 ID；同时带了一个兜底规则，会从 `https://wallhaven.cc/w/<id>` 的链接里提取 ID。

## CLI 用法

在工作区根目录执行：

```bash
node skills/pic-search/cli.js \
  --q "风景" \
  --categories 111 \
  --purity 100 \
  --atleast 2560x1080 \
  --ratios 16x9 \
  --sorting date_added \
  --order desc \
  --colors 990000 \
  --page 2
```

输出（JSON 数组）：

```json
[
  "https://wallhaven.cc/w/0p82om",
  "https://wallhaven.cc/w/abcdef"
]
```

### 输出直链图片（默认）

默认会对每个结果额外请求一次详情页来提取 `<img id="wallpaper" ...>` 的 `src`，因此会更慢、请求更多。

如果你只需要可打开的链接（详情页），建议关闭直链模式：

```bash
node skills/pic-search/cli.js --q "风景" --sorting date_added --direct false
```

## 代理（可选）

如果你的网络环境需要代理才能访问 `wallhaven.cc`，可以传 `--proxy`：

```bash
node skills/pic-search/cli.js --q "风景" --sorting date_added --proxy 127.0.0.1:7890
```

说明：

- 目前支持 **HTTP 代理**（通过 `CONNECT` 建立 HTTPS 隧道）
- 也支持环境变量 `HTTPS_PROXY` / `HTTP_PROXY`

## 作为模块调用（JS）

```js
const { searchWallhaven } = require('./skills/pic-search/search');

const links = await searchWallhaven({
  q: '风景',
  sorting: 'date_added',
  ratios: '16x9',
  atleast: '2560x1080',
  colors: '990000',
  page: 2,
});

console.log(links);
```

## 依赖与环境

- 无第三方依赖（只用 Node 内置 `https` / `zlib`）
- 需要可访问 `wallhaven.cc`

## 常见问题

- 如果返回空数组：可能是 Wallhaven 页面结构调整、触发了限制、或网络不可达。可以先把 `--direct` 去掉，只验证列表解析是否正常。
