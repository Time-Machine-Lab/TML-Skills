# Product 模块

## 作用

负责把用户要推广的对象沉淀成稳定产品资料，供候选池、话术和跟进流程复用。

## 本模块负责的事情

- 建立产品资料目录
- 写入标题、目标人群、卖点、联系方式、素材
- 提供 `reply-strategy`、`faq`、`brief` 等长期上下文
- 产出关键词来源，供候选池模块使用

## 运行后会得到什么

一个产品目录，默认包含这些文件：

- `product.json`
- `brief.md`
- `reply-strategy.md`
- `faq.md`
- `docs/context.md`
- `images/`
- `attachments/`

其中：

- `product.json`：结构化资料，适合脚本读取
- `brief.md`：产品简介和卖点概览
- `reply-strategy.md`：公开回复和私信承接原则
- `faq.md`：常见问题与边界回答

## 推荐命令与用途

```bash
node scripts/bili.js product init --title "<产品名>"
node scripts/bili.js product setup --title "<产品名>" --intro "<介绍>" --audience "a,b" --selling-points "a,b"
node scripts/bili.js product doctor --slug "<slug>"
node scripts/bili.js product summarize --slug "<slug>"
node scripts/bili.js product get --slug "<slug>"
```

命令说明：

- `product init`
  作用：先生成一个最小产品目录骨架
- `product setup`
  作用：一次性写入主要资料
  常用参数：
  - `--title`
  - `--slug`
  - `--intro`
  - `--audience "a,b"`
  - `--selling-points "a,b"`
  - `--group-number`
  - `--group-link`
  - `--qq-number`
  - `--qr-image </绝对路径>`
  - `--product-images </a.png,/b.png>`
- `product doctor`
  作用：看产品是否已经具备推广可用性
- `product summarize`
  作用：拿简明摘要给 agent 用
- `product get`
  作用：查看完整产品资料和目录路径

## 执行顺序

1. 如果还没有产品目录，先 `product init`
2. 用 `product setup` 一次性补齐核心信息
3. 用 `product doctor` 查缺口
4. 用 `product summarize` 给后续模块喂摘要

## 进入下一个模块前应确认

- 产品至少有标题、简介、目标人群、核心卖点
- 联系方式或后续承接方式已经明确
- `reply-strategy.md` 已经写出公开区和私信的边界
- 可以导出一组可用于候选池采集的关键词

## 不要省略的内容

- 不要只有产品名，没有用户画像
- 不要只有卖点，没有联系方式承接方式
- 不要让 agent 自己猜“哪些说法不能说”
