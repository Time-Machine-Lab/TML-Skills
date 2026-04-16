# bilibili-api-skill 二期设计总览

## 说明

这个目录存放二期主设计文档。

二期设计的理解路径是：

1. 先看这个 skill 整体是什么
2. 再看产品在用户眼里会变成什么
3. 再看整体运行环境怎么组织
4. 再看上层编排怎么设计
5. 再看指令和功能包怎么分层
6. 再看领域事实层
7. 最后再看底层接口和技术定案

这就是二期设计的统一口径。

## 统一口径

二期统一按下面理解：

- `Main Skill`
  - 项目地图和总入口
- `Command`
  - 最小、最稳定的原子化指令
  - 一条指令只做一件明确的事
- `Capability`
  - 基于指令集再包装一层的高层功能包
  - 用来完成一个更复杂的功能
  - 需要 agent 参与执行和判断
- `Strategy`
  - 推广策略模板
  - 是一整套推广打法、节奏和判断原则
- `TaskSpec`
  - 基于 `Product + Strategy` 生成的具体任务文档
- `Domain`
  - 平台对象和系统事实层
- `OperationRecord`
  - 关键操作记录

可以直接这样理解：

- `Command` 解决“做一个动作”
- `Capability` 解决“完成一个功能”
- `Strategy` 解决“这套推广怎么打”

## 阅读顺序

建议按下面顺序阅读：

1. [main-skill-map-design.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/main-skill-map-design.md)
2. [user-stories-and-flows.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/user-stories-and-flows.md)
3. [runtime-environment-architecture.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/runtime-environment-architecture.md)
4. [orchestration-objects.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/orchestration-objects.md)
5. [command-pack-design.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/command-pack-design.md)
6. [domain-entities.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/domain-entities.md)
7. [phase2-core-interfaces.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/phase2-core-interfaces.md)
8. [sqlite-adoption-strategy.md](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/sqlite-adoption-strategy.md)

## 文档说明

### `main-skill-map-design.md`

主 Skill / 项目地图设计。

回答：

1. 整个 skill 的总入口应该怎么设计
2. 用户和 agent 第一次应该怎么看这套 skill
3. 主 Skill 应该负责什么，不应该负责什么

### `runtime-environment-architecture.md`

运行环境构成设计。

回答：

1. `runtime-root` 下应该有哪些目录
2. 数据库和文件目录分别存什么
3. 产品、任务、策略、能力包分别放在哪里

### `user-stories-and-flows.md`

用户故事与流程设计。

回答：

1. 这个产品最终在用户眼里会变成什么
2. 不同类型用户会怎么使用这套 skill
3. 用户操作流程和业务流程是什么

### `orchestration-objects.md`

上层编排对象设计。

回答：

1. 什么是 `Capability`
2. 什么是 `Strategy`
3. 什么是 `TaskSpec`
4. 它们之间怎么协作

### `command-pack-design.md`

指令包设计。

回答：

1. 什么是 `Command`
2. 什么是 `Capability`
3. 指令、功能包、策略三层如何分开

### `domain-entities.md`

领域实体设计。

回答：

1. 二期需要哪些核心实体
2. 这些实体分别负责什么
3. `OperationRecord` 为什么要作为统一的关键操作记录

### `phase2-core-interfaces.md`

底层核心接口设计。

回答：

1. 二期最核心的底层接口能力有哪些
2. 每个接口最小需要哪些入参
3. 返回结果大概长什么样

### `sqlite-adoption-strategy.md`

SQLite 技术方案。

回答：

1. 二期统一采用什么 SQLite 方案
2. 安装口径是什么
3. 后续实现需要遵守哪些约束

## 备注

- `phase2-core-interfaces.md` 里的返回示例只用于帮助理解，不代表最终字段已经完全定稿。
