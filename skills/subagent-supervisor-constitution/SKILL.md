---
name: subagent-supervisor-constitution
description: Use when coordinating multiple subagents for medium/high-risk tasks with repeated alignment loops, cross-module changes, or costly review churn; apply a fixed task constitution, strict ownership boundaries, and mandatory verification gates before commit.
---

# Subagent Supervisor Constitution

## Overview
Use this skill to reduce management overhead in multi-agent delivery.
Core rule: **Constitution first, delegation second, verification before merge**.

## Constitution (lock before dispatch)
Define and freeze:
1. `Success`: goal, measurable outputs, deadline.
2. `Red lines`: must-not-break behavior, compatibility constraints, forbidden paths.
3. `Decision weights`: feasibility, risk, ROI, maintainability, verifiability (sum=100).
4. `Stop rule`: max exploration rounds, forced convergence point.

If constitution is not locked, do not dispatch workers.

## Dispatch Protocol
Per subagent, provide:
1. Exact ownership (`write whitelist` paths only).
2. Clear output contract:
- changed files
- key change points
- test commands
- test results
- remaining risks
3. Explicit anti-drift rule:
- do not act as supervisor
- do not return advice-only summaries
- do not touch files outside ownership

## Verification Gates
After each worker delivery:
1. **Spec gate**: does output satisfy constitution + task scope?
2. **Quality gate**: safety, null/error paths, maintainability, regression risk.
3. **Command gate**: supervisor reruns critical commands locally.

No gate pass, no integration.

## Standard Build/Test Ladder
Use this order to avoid false diagnosis:
1. `git status` + isolate target scope.
2. Compile dependency chain: `mvn -pl <module> -am -DskipTests compile`.
3. If upstream tests block: `mvn -pl <module> -am -Dmaven.test.skip=true install`.
4. Run target tests in module only.
5. Run final focused regression set.

## Commit Discipline
1. Never `git add .` in dirty workspace.
2. Stage explicit files per module.
3. Commit by functional slice (Chinese messages if team convention).
4. Push only after final gate summary is green.

## Failure Patterns and Fixes
1. Role drift (worker returns reports): re-dispatch with strict output contract.
2. Boundary collision: tighten whitelist and split ownership.
3. Fake test confidence: require exact command + result + supervisor rerun.
4. Endless alignment: enforce stop rule and force decision round.

## Quick Supervisor Template
```txt
You own ONLY these files: <whitelist>.
You are not the supervisor. Implement directly.
Do not modify anything outside whitelist.
Return only:
1) changed files
2) key diffs
3) exact test commands
4) exact test results
5) open risks
No commit.
```
