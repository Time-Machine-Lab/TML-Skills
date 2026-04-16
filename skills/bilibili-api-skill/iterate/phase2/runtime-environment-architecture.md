# bilibili-api-skill 二期运行环境构成

## 设计原则

二期运行环境统一按下面这套来组织：

- 数据库：存结构化事实
- 文件目录：存详细内容、任务文档、策略模板、能力说明

目录结构需要保持清晰、稳定、可维护。

原则是：

- 不把目录拆得过细
- 不把所有内容都挤进一个文件
- 每一层都保留清楚的主入口

## 总体结构

运行目录统一按下面这套结构组织：

```text
runtime-root/
├── db/
│   └── bilibili-skill.db
├── resources/
│   ├── products/
│   │   ├── <product-slug>/
│   │   │   ├── PRODUCT.md
│   │   │   ├── assets/
│   │   │   └── tasks/
│   │   │       ├── <task-id>/
│   │   │       │   ├── TASK.md
│   │   │       │   ├── WORKLOG.md
│   │   │       │   └── outputs/
│   ├── strategies/
│   │   ├── <strategy-slug>/
│   │   │   ├── STRATEGY.md
│   │   │   └── examples.md
│   └── capabilities/
│       ├── <capability-slug>/
│       │   ├── CAPABILITY.md
│       │   └── prompts.md
└── exports/
```

## 1. `db/`

这里存数据库文件。

数据库只负责存结构化事实，不负责存长篇说明。

数据库中包含的结构化事实：

- `Account`
- `Product` 的基础信息
- `BilibiliUser`
- `BilibiliVideo`
- `BilibiliComment`
- `OperationRecord`

关于 `Product`，数据库里只放基础信息。

适合放的内容包括：

- `product_id`
- `slug`
- `title`
- `status`
- `resource_path`

产品的完整说明，不放数据库。

## 2. `resources/`

这里是整个运行环境的主工作区。

这里负责放：

- 产品完整资料
- 任务文档
- 策略模板
- 能力包说明
- 图片素材

## 3. `resources/products/`

这里放所有产品。

一个产品一个目录，并且和数据库里的 `Product` 一一对应。

建议结构：

```text
resources/products/<product-slug>/
├── PRODUCT.md
├── assets/
└── tasks/
```

### `PRODUCT.md`

这是产品主文件。

它负责承载完整产品说明。

建议把产品层的重要内容统一收在这个主文件里。

适合写的内容包括：

- 产品介绍
- 目标用户
- 核心卖点
- 对外表达方式
- FAQ
- 回复和私信时的边界说明

`PRODUCT.md` 是产品层的主入口。

### `assets/`

这里放产品素材。

适合放的内容包括：

- 图片
- 海报
- 截图
- 其他附件

### `tasks/`

这里放当前产品下面创建出来的所有任务。

## 4. `resources/products/<product-slug>/tasks/`

这里放当前产品下的任务。

一个任务一个目录。

建议结构：

```text
resources/products/<product-slug>/tasks/<task-id>/
├── TASK.md
├── WORKLOG.md
└── outputs/
```

### `TASK.md`

这是任务主文件，也是任务主控文件。

它负责说明：

- 这次任务的目标
- 这次任务基于哪个产品
- 这次任务使用哪个策略
- 这次任务由哪些账号执行
- 整体阶段流程
- 当前大阶段进度
- 暂停、恢复、异常说明

`TASK.md` 负责任务的大局和总览。

适合在这些时候更新：

- 一个大阶段完成后
- 任务暂停时
- 任务恢复时
- 任务出现重要异常时

### `WORKLOG.md`

这是任务工作日志。

它负责承载执行过程中的持续记录。

适合写的内容包括：

- 当前推进到哪一步了
- 为什么跳过某个目标
- 某一步为什么失败
- 需要注意什么
- 下一次从哪里继续

`WORKLOG.md` 负责任务过程。

### `outputs/`

这是任务输出目录。

这里放阶段性产物。

适合放的内容包括：

- 视频列表
- 意向用户列表
- 某一阶段的总结
- 某一轮执行后的中间结果

例如：

- `video-list.md`
- `intent-users.md`
- `comment-round-summary.md`

`outputs/` 放阶段产物，不放过于细碎的逐条流水。

## 5. `resources/strategies/`

这里放所有策略模板。

一个策略一个目录。

建议结构：

```text
resources/strategies/<strategy-slug>/
├── STRATEGY.md
└── examples.md
```

### `STRATEGY.md`

这是策略主文件。

它需要写清楚：

- 这套策略的目标
- 适合什么产品
- 分几个阶段
- 每个阶段调用哪些能力
- 每个阶段的进入和退出条件
- 风控注意事项
- 禁止动作

### `examples.md`

这里放策略示例。

方便后续理解和复用。

## 6. `resources/capabilities/`

这里放所有能力包说明。

一个能力一个目录。

建议结构：

```text
resources/capabilities/<capability-slug>/
├── CAPABILITY.md
└── prompts.md
```

### `CAPABILITY.md`

这是能力包主文件。

它需要写清楚：

- 这个能力是做什么的
- 输入是什么
- 输出是什么
- 适合在哪个阶段使用
- 使用时要注意什么

### `prompts.md`

这里放这个能力对应的提示词或工作流说明。

## 7. `exports/`

这里放导出内容。

适合放的内容包括：

- 汇报材料
- 阶段总结
- 导出的结果文件

## 当前定案

- 运行环境必须有独立的 `runtime-root`
- `db/` 只存结构化事实
- `resources/` 存详细内容和工作文件
- `products/` 下一个产品一个目录
- 每个产品默认保留：
  - `PRODUCT.md`
  - `assets/`
  - `tasks/`
- 每个任务默认保留：
  - `TASK.md`
  - `WORKLOG.md`
  - `outputs/`
- `strategies/` 下一个策略一个目录
- 每个策略默认保留：
  - `STRATEGY.md`
  - `examples.md`
- `capabilities/` 下一个能力一个目录
- 每个能力默认保留：
  - `CAPABILITY.md`
  - `prompts.md`
