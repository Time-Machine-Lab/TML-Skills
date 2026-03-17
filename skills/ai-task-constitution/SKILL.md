---
name: ai-task-constitution
description: Use when tasks keep stalling on AI alignment and review overhead, especially for design, architecture, cross-module changes, or high-risk decisions that need broad option exploration before convergence.
---

# AI Task Constitution

## Overview

Use this skill to reduce repeated alignment loops by separating work into three roles:
1. AI does wide exploration.
2. Human defines constraints and decision weights.
3. AI converges to top options with explicit risk and rollback.

Core principle: keep criteria structure fixed, keep thresholds dynamic per task.

## When to Use

Apply when one or more symptoms appear:
- Repeated back-and-forth to align intent.
- Many generated options but hard to decide quickly.
- Fear of hidden production/operational failures.
- Work is not only coding (architecture, process, strategy, system setup).

Do not use for tiny execution-only tasks that have clear acceptance criteria and near-zero risk.

## Standard Workflow

### Step 1: Build Task Constitution First

Before any solution generation, require a constitution with:
- Success definition (goal, metric, time boundary)
- Red lines (must-not-break constraints)
- Dynamic decision weights
- Stop rules (max exploration rounds and forced decision point)

### Step 2: AI-Led Divergence

AI should generate many candidates internally, but only show:
- Top 3 detailed options
- Option landscape map for rejected groups
- Rejection reasons

### Step 3: Human-Led Convergence

Human reviews only decision-critical items:
- Whether weights and red lines are right
- Whether top options expose failure points and rollback paths
- Whether blind spots were surfaced

### Step 4: Commit to Action Plan

After selecting one option, AI outputs:
- Milestones
- Validation checkpoints
- Trigger conditions for rollback/degrade

## Copy-Paste Prompt (Default)

Use this prompt directly when running a new high-value task:

```txt
你是我的策略协作AI。先不要执行，先完成“任务宪法”，并通过提问补齐缺失信息。

A. 任务目标（Success）
- 一句话目标：
- 成功判定指标（最多3个）：
- 时间边界：

B. 红线约束（Must-Not-Break）
- 不能破坏的现有能力：
- 合规/伦理/组织约束：
- 不可接受后果（尤其隐形事故）：

C. 决策权重（动态）
请你先向我提问并确认本次权重（总和100）：
- 可行性：
- 风险可控性：
- 预期收益：
- 演进维护性：
- 可验证性：

D. 停损条件（Stop Rule）
- 最多探索轮次：
- 到哪一轮必须收敛决策：
- 触发降级/回滚的条件：

E. 方案探索协议
- 先内部最大化发散（不限数量，不全量展示）
- 对候选方案按本次权重评分并淘汰
- 输出 Top 3 详细方案 + 其余方案分组淘汰原因
- 每个Top方案必须包含：失败点、监控信号、回滚路径、首周验证实验

F. 反盲区机制
- 单列“我可能忽略但影响成败的前提”
- 若这些前提不成立，给出替代路径

输出顺序：
1) 你先提问补齐任务宪法缺失项
2) 我确认后，你再输出方案
3) 我选定后，你再给执行计划（里程碑+验收点）
```

## Quick Variants

### Variant A: High-Risk Engineering

Add constraints:
- Compatibility boundaries
- Monitoring and alerting requirements
- Rollback switch requirement

### Variant B: Architecture/Workflow Design

Add constraints:
- Team adoption cost
- Dependency coupling risk
- Migration complexity

### Variant C: Strategy/Operations

Add constraints:
- Decision reversibility
- Resource ceilings
- External dependency uncertainty

## Review Checklist (5-Minute)

Before approving a plan, verify only these:
1. Is "out of scope" explicit?
2. Are unknown constraints explicitly listed?
3. Is there at least one rollback/degrade path?
4. Are both main path and edge-case checks present?
5. Is there a forced decision deadline?

## Common Failure Modes

- Asking for execution before constitution is confirmed.
- Showing too many options without elimination rationale.
- Mixing intent calibration and technical acceptance in one pass.
- Keeping weights implicit instead of explicit.

Fix by returning to Step 1 and re-locking constitution.
