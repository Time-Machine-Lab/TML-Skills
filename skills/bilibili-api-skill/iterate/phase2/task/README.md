# B 站 AI 引流系统二期任务书总览

## 总原则

二期按一套新系统来建设，不按旧版 skill 做增量重构。

这批任务书统一以 `phase2` 目录下已经定下来的设计文档为准。

旧版 skill 只保留很小的参考价值：

- 可以参考少量 B 站接口调用行为
- 可以参考个别脚本里的请求参数和返回形态
- 不继承旧的工程结构、运行目录、命令体系、任务链路和编排方式

## 这次要重新做什么

二期要重新搭一套新的系统骨架：

- 新的系统定位和主 Skill
- 新的运行空间和初始化底座
- 新的 `SQLite` 事实层
- 新的 B 站适配层和原子指令层
- 新的功能包、策略包和 `TaskSpec` 体系
- 新的主副 `Agent` 执行闭环

重点不是修旧链路，而是直接建立新链路。

## 拆分原则

- 每份任务书都可以独立负责
- 每份任务书只说明关键目标、边界、依赖和验收
- 不在任务书里展开具体实现细节
- 明确哪些地方可以参考旧版，哪些地方不能沿用旧版

## 任务一览

| 任务 | 重点 | 前置关系 |
| --- | --- | --- |
| [task-system-positioning-and-main-skill.md](./task-system-positioning-and-main-skill.md) | 系统定位、命名、主 Skill 总入口 | 所有任务的起点 |
| [task-runtime-workspace-foundation.md](./task-runtime-workspace-foundation.md) | `runtime-root`、初始化、目录底座 | 依赖任务 1 |
| [task-sqlite-domain-foundation.md](./task-sqlite-domain-foundation.md) | `SQLite` 事实层、领域对象、`OperationRecord` | 依赖任务 2 |
| [task-bilibili-adapter-and-command-layer.md](./task-bilibili-adapter-and-command-layer.md) | B 站适配层、原子指令层、统一输出口径 | 依赖任务 2；与任务 3 对接 |
| [task-capability-strategy-and-taskspec.md](./task-capability-strategy-and-taskspec.md) | 功能包、策略包、`TaskSpec` 体系 | 依赖任务 3 和任务 4 |
| [task-main-sub-agent-execution-loop.md](./task-main-sub-agent-execution-loop.md) | 主副 `Agent` 协作闭环、任务派发、暂停恢复、回溯 | 依赖前面 5 项 |

## 推荐推进顺序

建议按下面顺序推进：

1. 先定系统定位、命名和主 Skill
2. 再定运行空间和初始化底座
3. 在新底座上建设 `SQLite` 事实层
4. 同步建设 B 站适配层和原子指令层
5. 基于数据层和指令层建立功能包、策略包和 `TaskSpec`
6. 最后把主副 `Agent` 执行闭环接起来

- 任务 3 和任务 4 可以并行
- 任务 5 需要等任务 3 和任务 4 收口后再落稳
- 任务 6 是整期收口任务

## 全局边界

所有任务统一遵守下面几条：

- 二期不以旧版 skill 为工程基础
- 二期不要求兼容旧版运行目录和旧版任务链路
- 数据库只存事实，不存长篇任务内容
- `TaskSpec`、`TASK.md`、`WORKLOG.md` 继续使用文件承载
- `OperationRecord` 是关键操作记录的统一事实入口
- 二期默认以自然语言和 CLI 为主，不优先做复杂图形化页面

## 总体验收

如果这 6 份任务都完成，二期应该达到下面这些结果：

- 有一套新的系统定位和对外入口
- 有一套新的运行空间和工程底座
- 有一套新的事实层和可回溯能力
- 有一套新的原子能力与指令体系
- 有一套新的策略驱动任务体系
- 有一套新的主副 `Agent` 协作与派发闭环
