---
name: bilibili-api-skill
description: 用于 B 站(Bilibili)账号初始化、评论区互动、私信跟进、产品推广和长时间 campaign 运行的技能。当用户要登录 B 站、建立推广产品、跑推广任务、查看评论/私信、跟进会话、扫描视频评论区或执行基于 B 站的引流动作时，优先使用这个技能，并优先走内置 Node 脚本而不是临时写请求代码。
---

# 使用范围

这个技能负责两类事情：

- B 站基础能力：登录、会话、视频、评论、私信、消息轮询
- B 站推广流程：产品建档、campaign、评论区互动、私信跟进、复盘

优先把用户的自然语言目标映射成高层命令，不要一上来就直接拼底层接口。

# 首次安装

团队成员第一次拿到这个 skill 后，先在 skill 根目录执行：

```bash
npm install
```

然后按这条顺序初始化：

```bash
node scripts/bili.js init start --runtime-root </绝对路径> --reset true
node scripts/bili.js auth qr-generate
node scripts/bili.js auth qr-poll
```

`init start` 会创建独立运行目录，用来存放：

- token / cookie / session
- 日志与复盘数据
- 产品资料
- playbook / campaign / task

不要把这些运行态数据写回 skill 包本身。

# 主链路

默认按这条链路驱动 agent：

1. `init start`
2. `auth qr-generate` / `auth qr-poll`
3. `product setup`
4. `campaign plan --product <slug> --hours <n> --scheme scheme1`
5. `campaign run --product <slug> --hours <n> --scheme scheme1`
6. `campaign next --id <campaign_id>`
7. `inbox list --campaign <campaign_id>`
8. `thread continue`
9. `thread draft`
10. `thread send`

如果目标只是巡检，则优先：

- `system doctor`
- `system onboard`
- `watch state`
- `trace recent`
- `campaign status`

# 产品建档

用户只需要提供：

- 产品名称
- 一段介绍
- 目标人群
- 卖点
- 群号 / QQ / 二维码 / 产品图

推荐命令：

```bash
node scripts/bili.js product setup --title "产品名" --intro "产品介绍" --audience "a,b" --selling-points "a,b" --group-number "群号" --group-link "链接" --qq-number "QQ号" --qr-image </abs/path/to/qr.png> --product-images </abs/path/a.png,/abs/path/b.png>
```

然后先跑：

```bash
node scripts/bili.js product doctor --slug "<slug>"
node scripts/bili.js product summarize --slug "<slug>"
```

# Campaign 默认心法

当前默认方案是 `scheme1`。

按下面这套规则理解，不要自己扩动作：

- 每隔 `1-2` 分钟可以找 `1` 个新视频
- 但前提是当前视频已经处理完、价值不高，或明确决定切换
- 进入一个视频后先停留，不要继续刷搜索
- 同一视频内公开回复最少间隔 `20` 秒
- 切到下一个视频前保留 `60-120` 秒缓冲
- 高质量评论区可以多停留，低质量评论区尽快退出
- 高意向：评论回复 + 可直接私信
- 中意向：只做评论回复

当前视频发现的默认门槛：

- 播放量 `> 3000`
- 评论数 `> 3`

推荐入口：

```bash
node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme scheme1
node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme scheme1
node scripts/bili.js campaign status --id <campaign_id>
node scripts/bili.js campaign next --id <campaign_id>
```

# Agent 规则

- 优先高层命令：`system`、`product`、`campaign`、`inbox`、`thread`
- 默认优先用 `thread send`，不要直接跳到底层 `dm send` / `comment send`
- 命中 `403`、`352`、`412`、冷却、budget block 时先退避
- 当前视频没吃完时，不要继续 `discovery videos`
- 搜索命中 `412` 时，优先切换到已知 BV 池或当前聚焦视频的评论区，不要硬刷搜索
- 评论是否值得互动，最终交给大模型结合线程上下文判断
- 公开区回复要短、像真人、带一点钩子，不要太平，不要直接发群号/二维码

# 常用命令

```bash
node scripts/bili.js system doctor
node scripts/bili.js system onboard
node scripts/bili.js system settings

node scripts/bili.js watch prime
node scripts/bili.js watch run --interval-sec 180 --iterations 0
node scripts/bili.js inbox list --product "<slug>"

node scripts/bili.js discovery videos --keyword "<kw>" --product "<slug>" --campaign "<campaign_id>" --order click --days-within 30 --min-play 3000 --min-comments 3 --page-size 8 --pages 1
node scripts/bili.js discovery comments --id "<BV>" --product "<slug>" --campaign "<campaign_id>" --pages 1 --size 20
node scripts/bili.js discovery thread --id "<BV>" --root <rpid>

node scripts/bili.js thread continue --mid <mid> --product "<slug>"
node scripts/bili.js thread draft --mid <mid> --product "<slug>"
node scripts/bili.js thread send --channel dm|comment ... --yes
```

# 运行态约定

- 默认运行目录：`~/.openclaw/state/bilibili-api-skill`
- 可通过环境变量覆盖：
  - `BILI_SKILL_RUNTIME_DIR`
  - `BILI_SKILL_PRODUCTS_DIR`
  - `BILI_SKILL_PLAYBOOKS_DIR`
- 本 skill 包里不要保存真实 cookie、refresh token、日志、产品资料

# 复盘入口

```bash
node scripts/bili.js trace recent --limit 20
node scripts/bili.js watch state
node scripts/bili.js campaign status --id <campaign_id>
node scripts/bili.js thread list
```

优先用这些命令判断：

- 现在该继续当前视频，还是该切回 inbox
- 有没有命中冷却、风控、budget
- 当前 campaign 还剩多少动作预算
