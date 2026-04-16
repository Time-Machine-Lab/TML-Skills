# 任务书：主副 Agent 执行闭环

## 1. 任务综述

### 1.1 任务定义

建立二期新的主副 `Agent` 协作模式，让主 `Agent` 负责规划和派发，让副 `Agent` 承接某一段相对完整的任务。

### 1.2 核心目标

这个任务主要解决三件事：

- 长任务怎么拆开跑
- 主副 `Agent` 怎么分工
- 任务怎么暂停、恢复和回溯

### 1.3 当前状态

- 已完成
  - 主副 `Agent` 模式已经成为二期共识
  - 二期已经明确要以策略为核心推进任务
  - 回溯与记录已经明确为必须能力
- 未开始
  - 新系统的主副 `Agent` 执行模型还没有正式建立
  - 新系统的暂停恢复与回溯闭环还没有落地
- 参考边界
  - 旧版单 `Agent` 长链路执行方式不作为二期执行模型继续沿用

### 1.4 重要性与紧急程度

- 优先级：`P0`
- 说明：这是整期价值真正落地的收口任务

## 2. 任务上下文

### 2.1 设计依据

建议先看：
- [编排对象设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/orchestration-objects.md)
- [用户故事与流程设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/user-stories-and-flows.md)
- [运行环境构成](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/runtime-environment-architecture.md)
- [领域实体设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/domain-entities.md)

### 2.2 这份任务主要产出什么

这份任务主要要把新的协作闭环定清楚：

- 主 `Agent` 基于 `TaskSpec` 规划和推进任务
- 副 `Agent` 被派去承接某一段任务，并返回结果
- 关键动作写入 `OperationRecord`
- 任务过程写入 `TASK.md`、`WORKLOG.md`、`outputs/`

二期的目标不是让一个 `Agent` 一直做下去，而是让系统可以长期稳定跑。

### 2.3 本任务范围

包括：

- 主副 `Agent` 的职责边界
- 可派发任务单元的定义
- 任务生命周期规则
- 暂停、恢复、重试和继续推进规则
- 结果汇总和回溯口径

不包括：

- 图形化调度页面
- 新增底层 B 站接口
- 替代 `TaskSpec` 或事实层本身

## 3. 注意事项

### 3.1 已知风险

- 如果仍然按单 `Agent` 长链路跑，二期会继续出现上下文污染和黑盒问题
- 如果执行结果不能稳定沉淀，后面仍然无法验收和优化

### 3.2 强约束

- 主 `Agent` 负责规划、派发、判断和总结
- 副 `Agent` 负责承接某一段被派发出去的任务，不长期驻留
- 副 `Agent` 承接的可以是一个 `Capability`，也可以是 `TaskSpec` 的某个阶段片段
- 关键动作必须沉淀到 `OperationRecord`
- 任务过程必须沉淀到 `TASK.md`、`WORKLOG.md`、`outputs/`

### 3.3 耦合点

- 依赖任务 2 的运行空间
- 依赖任务 3 的事实层
- 依赖任务 4 的原子指令层
- 依赖任务 5 的 `TaskSpec` 体系

### 3.4 避坑

- 不要让主 `Agent` 同时承担全部细节执行
- 不要把副 `Agent` 理解成只能执行一步命令的动作壳
- 不要让副 `Agent` 持有长期上下文
- 不要只做动作，不做回写和回溯

## 4. 验收标准与交付物

- [ ] 主副 `Agent` 的职责边界已经清楚
- [ ] 关键任务片段已经可以拆成副 `Agent` 可承接的单元
- [ ] `Capability` 或任务阶段已经可以被主 `Agent` 稳定派发给副 `Agent`
- [ ] 任务已经支持启动、暂停、恢复和继续推进
- [ ] 任务文件和事实层已经形成统一回写闭环
- [ ] 操作者可以直接看到做过什么、为什么做、结果如何
