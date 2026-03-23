---
name: spec-subagent-orchestrator
description: Orchestrate complex work by combining spec-kit artifacts with the right subagent execution workflow. Use when a task should be structured through `spec.md`, `plan.md`, or `tasks.md` before implementation; when Codex needs to decide whether to fill missing spec-kit stages first; or when execution should be routed between direct work, `subagent-driven-development`, and `subagent-supervisor-constitution`. Triggers on requests to combine spec with subagents, run large multi-step delivery with explicit routing, or turn a spec-driven process into a governed execution system.
---

# Spec Subagent Orchestrator

## Overview

Use this skill as a thin orchestration layer. Do not replace spec-kit or existing subagent skills; decide when to invoke them, in what order, and with which verification gates.

Core rule: lock the right spec artifact first, then choose the lightest execution model that still protects quality and coordination.
Execution model rule: assume a single master orchestrator with no recursive agent tree. To get value from subagents, slice work into atomic executor tasks and dispatch them in multiple rounds.

## Workflow

1. Inspect what already exists.
   Look for `spec.md`, `plan.md`, `tasks.md`, or equivalent spec-kit outputs before doing new work.
2. Close the earliest missing artifact.
   If the work is still ambiguous, route to spec first.
   If the spec exists but execution shape does not, route to plan.
   If the plan exists but actionable slices are missing, route to tasks.
3. Classify execution risk and coupling.
   Judge independence, write-scope overlap, review churn risk, blast radius, and whether the task can be expressed as an atomic executor unit.
4. Route to the execution mode.
   Use direct execution for small, tightly scoped work.
   Use [$subagent-driven-development](/Users/welsir/.codex/superpowers/skills/subagent-driven-development/SKILL.md) when tasks are mostly independent and can be executed as separate atomic slices in the current session.
   Use [$subagent-supervisor-constitution](/Users/welsir/.codex/skills/subagent-supervisor-constitution/SKILL.md) when the work is medium/high risk, cross-module, drift-prone, or expensive to review incorrectly.
5. Enforce closure gates.
   No task is complete until spec alignment, quality review, and local verification all pass.

## Routing Rules

Use this decision order:

1. Is the task still underspecified?
   Route to the missing spec-kit stage instead of delegating early.
2. Is the next step blocked on one tightly coupled change?
   Stay local only long enough to create atomic slices or dispatch a boundary-locking subagent. Do not keep the whole implementation on the master by default.
3. Can the next work be written as one or more atomic executor tasks?
   If not, keep narrowing boundaries until it can.
4. Are there task slices with clean ownership and low overlap?
   Route to `subagent-driven-development`.
5. Are there repeated alignment loops, strict boundaries, or high regression risk?
   Route to `subagent-supervisor-constitution`.
6. Are both true?
   Lock constitution first, then let the supervisor pattern govern dispatch.

Default heuristics:

- Prefer direct work when there are fewer than 3 short steps and no meaningful branch risk.
- Prefer `subagent-driven-development` when tasks are already decomposed into atomic executor slices and write scopes are largely disjoint.
- Prefer `subagent-supervisor-constitution` when task count is not the main problem but coordination risk is.
- Prefer one boundary-locking subagent over long local reasoning when context pressure is rising but execution slices are not yet ready.

Read [workflow-routing.md](references/workflow-routing.md) when the routing choice is not obvious.

## Atomic Executor Rule

Never dispatch a generic worker with a vague brief. Dispatch only atomic executor tasks.

An atomic executor task must have:

- One concrete goal
- One primary deliverable
- Explicit file or module boundaries
- Explicit acceptance checks
- Enough context to execute without re-discovering the whole project

If a task fails these checks, it is not ready for delegation. Narrow it first or use a scoping pass to create smaller slices.

## Lifecycle Slots

Use fixed lifecycle slots, not a fixed cast of agent types:

- `scope`
  Lock boundaries, ownership, and dependency edges.
- `execute`
  Produce one atomic deliverable.
- `review`
  Check spec alignment or quality for one slice.
- `integrate`
  Combine accepted slices and resolve seams.
- `repair`
  Fix a concrete failed gate.

Each slot can be instantiated multiple times across rounds. Do not assume one broad executor can safely absorb multiple slots.

## Operating Procedure

### 1. Stabilize the artifact chain

- Confirm which of these exists: problem statement, spec, plan, tasks, validation targets.
- Do not let subagents invent scope that should have been locked in spec-kit artifacts.
- If the user already has `spec.md`, `plan.md`, and `tasks.md`, treat those as the source of truth.

### 2. Choose the execution wrapper

- For independent implementation slices in the current session, invoke `subagent-driven-development`.
- For high-risk or cross-boundary work, invoke `subagent-supervisor-constitution` first and follow its constitution, ownership, and gate rules.
- If the task is exploratory, ambiguous, or mostly design, stay local only until a scoping pass can define the next atomic slice.
- If context compression is already hurting the master, dispatch a scoping subagent before doing more local analysis.

### 3. Preserve ownership clarity

- Give each executor a precise write scope.
- Keep the main agent responsible for routing, integration, and final verification.
- Do not let executors redefine acceptance criteria.
- Do not hand one executor multiple unrelated deliverables just because they touch nearby files.

### 4. Dispatch in rounds, not trees

- Assume subagents do not recursively spawn their own child graph.
- Use the master to simulate depth through multiple dispatch rounds.
- Typical pattern: `scope -> execute -> review -> repair -> integrate`.
- Add more executors only when the extra slice lowers total coordination cost.

### 5. Close with explicit gates

- Spec gate: output matches `spec.md` and task scope.
- Quality gate: code or deliverable is maintainable and regression-aware.
- Command gate: rerun the important checks locally before claiming success.

## Non-Goals

- Do not rewrite spec-kit prompts or artifacts.
- Do not duplicate the internal procedures of the subagent skills.
- Do not dispatch vague, multi-goal executor tasks.
- Do not force subagents into tiny tasks where the overhead is larger than the work.
- Do not delegate before task boundaries are real.
- Do not assume recursive subagent trees are available.

## Outputs

When using this skill, produce a short orchestration decision:

1. Current artifact state
   Which spec-kit artifacts exist and which are missing.
2. Chosen route
   Direct work, `subagent-driven-development`, or `subagent-supervisor-constitution`.
3. Why this route
   Independence, risk, coupling, or review-cost reasoning.
4. Next concrete action
   The exact next command, skill, or task slice to run.
5. Atomic slice definition
   If delegating, state the exact deliverable, write boundary, and acceptance check for the next executor.
