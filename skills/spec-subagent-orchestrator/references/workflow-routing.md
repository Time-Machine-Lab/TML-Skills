# Workflow Routing

Use this reference when the correct path is not obvious.

Assume a single master orchestrator. Do not depend on recursive subagent trees.

## Artifact-first ladder

1. No stable problem statement:
   Stay local and clarify scope.
2. Problem exists but success is not locked:
   Route to spec.
3. Spec exists but implementation shape is vague:
   Route to plan.
4. Plan exists but execution slices are not concrete:
   Route to tasks.
5. Tasks exist:
   Choose the execution wrapper.
6. Tasks exist but are still too broad:
   Run a scoping pass to create atomic executor slices.

## Execution wrapper matrix

| Situation | Route |
| --- | --- |
| One small, tightly coupled change | Direct local execution |
| Context pressure is high but boundaries are not fully locked | Dispatch one scoping pass |
| Multiple mostly independent atomic slices, same session | `subagent-driven-development` |
| Cross-module or high-regression task | `subagent-supervisor-constitution` |
| Unclear boundaries plus high risk | Lock constitution, then supervise dispatch |

## Signals for `subagent-driven-development`

- A real task list already exists.
- Slices can be handed off one at a time.
- Each slice has a narrow write scope.
- Each slice has one primary deliverable.
- Review order matters more than parallel throughput.

## Signals for `subagent-supervisor-constitution`

- Ownership drift has happened before.
- Review churn is expensive.
- Multiple modules or teams are implicated.
- Hidden constraints or red lines matter.
- Verification must be rerun locally before merge.

## Refusal conditions

Do not delegate yet when:

- The user is still choosing what to build.
- The acceptance criteria are still moving.
- Every next action depends on the same unresolved design question.
- The work is so small that routing overhead dominates execution.

## Atomic executor checklist

Dispatch only when the next slice has all of:

- One goal
- One deliverable
- Explicit boundaries
- Explicit validation
- No hidden dependency on an unresolved design question
