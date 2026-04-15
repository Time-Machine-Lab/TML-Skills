# TML Spec Coding 工作流规范

## 目的

本项目使用 TML Spec Coding + OpenSpec + Codex 的协作方式开发，目标是让文档、提案、任务和代码始终处于同一套上下文约束下。

## 全局红线

1. `docs/` 是项目级单一真实来源。
2. `docs/api/*.yaml` 是 API 契约的权威来源。
3. `docs/sql/*.sql` 是数据库与存储结构的权威来源。
4. 涉及接口或存储变更时，必须先更新对应文档，再开发业务代码。
5. `openspec apply` 或任何实现动作开始前，必须先读取 `docs/spec/` 下的规范文档。
6. 规范化文档优先使用 `tml-docs-spec-generate` 生成或补全。

## 分阶段要求

### Explore

- 优先阅读 `docs/design/*.md`、`docs/api/*.yaml`、`docs/sql/*.sql`。
- 先确认需求边界、可行性和潜在冲突，再进入提案或实现。
- 如果发现架构与现有设计冲突，应先回到文档层修正。

### Propose

- 使用 OpenSpec 生成 `proposal.md`、`design.md`、`tasks.md`。
- 如果需求涉及 API 或存储变更，任务拆解中必须把 `docs/sql` 和 `docs/api` 更新排在业务代码之前。
- 任务描述必须具体、可执行、可验证。

### Apply

- 先读取变更工件和 `docs/spec/**/*.md`。
- 编码时严格对齐 `docs/api/*.yaml` 与 `docs/sql/*.sql`。
- 如实现过程中发现契约缺失或不一致，先修正文档，再继续代码实现。
- 完成后至少验证任务状态、关键测试和契约一致性。

## Codex 使用约定

- TML 命令入口位于 `.codex/prompts/`：
  - `/tml-doctor`
  - `/tml-update`
  - `/tml-ai-spec`
- OpenSpec 命令入口位于 `.codex/prompts/`：
  - `/opsx-explore`
  - `/opsx-propose`
  - `/opsx-apply`
  - `/opsx-archive`
- 团队受控执行入口位于 `.codex/skills/spec-governed-coding/`。
- 需要按团队 spec-first 方式推进实现时，优先使用 `spec-governed-coding`。

## 治理文件

以下文件用于长期治理，不应按单个需求随意改写：

- `docs/governance/delivery-constitution.md`
- `docs/governance/delivery-protocol.md`
- `docs/governance/executor-profile-catalog.md`
- `docs/governance/run-log-template.md`

## 默认执行建议

1. 先补齐或确认文档上下文。
2. 再创建或推进 OpenSpec change。
3. 实施前核对 `docs/spec/`、`docs/api/`、`docs/sql/`。
4. 复杂实现优先走 `spec-governed-coding` 的受控执行流程。
