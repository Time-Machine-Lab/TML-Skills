# State Discovery

Use this reference when the user invokes `spec-governed-coding` with minimal instructions and expects the skill to figure out the current state.

## Discovery order

1. Start from the active workspace or repo.
2. Search for the nearest relevant `spec.md`, `plan.md`, and `tasks.md`.
3. Search for governance files under `docs/governance/`.
4. Determine whether the task is in:
   - definition
   - planning
   - execution
   - review
   - closeout

## Good default behavior

- Infer the next step from files before asking the user for status.
- Prefer one clear candidate path over a broad menu of possibilities.
- Ask a question only when multiple candidate artifact chains would lead to materially different execution.

## When to stop and ask

Ask the user only if:

- multiple unrelated task folders match the request
- the intended repo or workspace is unclear
- the task-definition files conflict with each other in a way that blocks execution
- governance files exist in multiple incompatible locations

## What to report back

Keep the summary short:

- chosen workspace
- chosen artifact chain
- chosen governance baseline
- current stage
- next action
