# 任务书：系统定位、命名与主 Skill

## 1. 任务综述

### 1.1 任务定义

先把二期的新系统定位、正式名称和主 Skill 总入口定下来。

### 1.2 核心目标

这个任务主要解决两件事：

- 这套系统到底是什么
- 用户和 `Agent` 应该从哪里开始

### 1.3 当前状态

- 已完成
  - `phase2` 的核心概念和分层设计已经定下来
  - `Main Skill / Command / Capability / Strategy / TaskSpec / Domain / OperationRecord` 的口径已经统一
- 未开始
  - 新系统的正式名称还没有定案
  - 新的主 Skill 入口还没有正式产出
- 参考边界
  - 旧版 `SKILL.md` 只可作为历史样本，不能作为二期主入口的基础

### 1.4 重要性与紧急程度

- 优先级：`P0`
- 说明：这是所有任务的总起点

## 2. 任务上下文

### 2.1 设计依据

建议先看：
- [二期设计总览](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/README.md)
- [主 Skill 设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/main-skill-map-design.md)
- [用户故事与流程设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/user-stories-and-flows.md)
- [指令包设计](/Users/mac/Code/TML-Skills/skills/bilibili-api-skill/iterate/phase2/command-pack-design.md)

### 2.2 这份任务主要产出什么

这份任务主要要把下面几件事说清楚：

- 这套系统不是接口集合，而是面向 B 站推广场景的分层系统
- 主 Skill 不是命令清单，而是项目地图和导航入口
- 用户可以从自然语言、指令、功能包、策略任务四种入口进入
- `Agent` 需要按新的分层去理解系统，不再沿用旧链路

### 2.3 本任务范围

包括：

- 系统正式名称定案
- 系统定位文案定案
- 主 Skill 的结构和路由规则
- 用户第一次怎么开始
- `Agent` 第一次怎么开始

不包括：

- 具体指令实现
- 具体运行目录实现
- 具体策略内容实现
- 具体 B 站接口实现

## 3. 注意事项

### 3.1 已知风险

- 如果这一步不先收口，后面的文档和实现会继续挂在旧名字和旧心智上
- 如果主 Skill 写成手册堆砌，二期入口仍然会很混乱

### 3.2 强约束

- 二期按新系统建设，不按旧 skill 增量修补
- 主 Skill 只负责导航和路由，不负责展开所有细节
- 系统名称要服务于长期扩展，不能再被“API 工具”心智绑死

### 3.3 耦合点

- 任务 2 到任务 6 都依赖这里输出的系统名称和主入口口径
- 策略、功能包、任务体系都会复用这里定义的分层表达

### 3.4 避坑

- 不要把旧模块链路换个写法继续保留
- 不要把主 Skill 写成完整命令手册
- 不要在这一层提前展开实现细节

## 4. 验收标准与交付物

- [ ] 系统正式名称已经定案
- [ ] 系统定位已经能用一句话说清楚
- [ ] 主 Skill 的结构、入口和路由规则已经定清楚
- [ ] 用户和 `Agent` 的默认起步路径已经明确
- [ ] 新的主入口不再依赖旧版 skill 的链路表达
