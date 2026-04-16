# 任务书：功能包、策略包与 TaskSpec 体系

## 1. 任务综述

### 1.1 任务定义

建立二期新的 `Capability`、`Strategy`、`TaskSpec` 体系。

### 1.2 核心目标

这个任务主要解决两件事：

- 有了原子能力之后，怎么往上组织成打法
- 任务怎么真正变成可执行、可暂停、可恢复的文档

### 1.3 当前状态

- 已完成
  - `Command / Capability / Strategy / TaskSpec` 的分层关系已经定案
  - 资源目录和任务文件承载方式已经定案
- 未开始
  - 新系统的功能包模板、策略模板和 `TaskSpec` 模板还没有正式建立
- 参考边界
  - 旧版 `campaign`、`watch`、`candidate` 一类流程概念不作为二期上层体系继续沿用

### 1.4 重要性与紧急程度

- 优先级：`P0`
- 说明：这是二期从工具升级成推广系统的关键一层

## 2. 任务上下文

### 2.1 设计依据

建议先看：
- [编排对象设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/orchestration-objects.md)
- [指令包设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/command-pack-design.md)
- [运行环境构成](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/runtime-environment-architecture.md)
- [用户故事与流程设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/user-stories-and-flows.md)

### 2.2 这份任务主要产出什么

这份任务主要要把新的上层编排体系定清楚：

- `Capability` 负责完成一个功能
- `Strategy` 负责定义一套推广打法
- `TaskSpec` 负责把某个产品和某套打法变成一份具体任务
- 主 `Agent` 可以把某个 `Capability` 或某个任务片段派给副 `Agent` 去完成

如果这层没立住，二期就还只是“新底层 + 新脚本”，还不是新的推广系统。

### 2.3 本任务范围

包括：

- 功能包的模板和组织方式
- 策略包的模板和组织方式
- `TaskSpec` 的主文件结构和维护规则
- 系统内置模板与用户自定义模板的共存方式
- 产品、策略、任务之间的生成关系
- 功能包和 `TaskSpec` 阶段如何作为副 `Agent` 的任务单元被派发

不包括：

- 底层 B 站接口实现
- 具体数据库实现
- 主副 `Agent` 调度实现

## 3. 注意事项

### 3.1 已知风险

- 如果这一步只做“功能列表”，二期仍然没有策略核心
- 如果 `TaskSpec` 设计得太轻，任务无法稳定暂停和恢复

### 3.2 强约束

- `Strategy` 不是功能包集合
- `Capability` 不是指令清单
- `TaskSpec` 继续使用文件承载，不进数据库
- 上层体系按新系统重建，不承接旧版流程表达
- `Capability` 要适合被副 `Agent` 独立承接和完成

### 3.3 耦合点

- 依赖任务 3 的事实层提供历史和状态依据
- 依赖任务 4 的原子指令层提供稳定动作入口
- 任务 6 会直接以这里的任务结构为执行依据

### 3.4 避坑

- 不要把策略写成僵化死流程
- 不要让功能包越级承担整套打法
- 不要让 `TaskSpec` 只剩零散工作日志

## 4. 验收标准与交付物

- [ ] 新系统的功能包模板已经清楚
- [ ] 新系统的策略包模板已经清楚
- [ ] `Product + Strategy -> TaskSpec` 的关系已经定清楚
- [ ] `TaskSpec` 已经具备阶段、清单、暂停、恢复、输出等基本结构
- [ ] `Capability` 和 `TaskSpec` 阶段已经适合被主 `Agent` 派发给副 `Agent`
- [ ] 用户和 `Agent` 都可以基于这套体系理解任务如何推进
