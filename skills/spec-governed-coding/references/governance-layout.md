# Governance Layout

Use this file to standardize workspace layout for spec-governed coding.

## Expected governance files

Store standing governance files in:

- `docs/governance/delivery-constitution.md`
- `docs/governance/delivery-protocol.md`
- `docs/governance/run-log-template.md`

Store per-task run logs in:

- `docs/governance/runs/YYYY-MM-DD-<task>.md`

## Relationship to spec-kit

Do not place these files inside the spec-kit task folders unless a repo has a strong existing convention.

Keep them separate from:

- `spec.md`
- `plan.md`
- `tasks.md`

Reason:

- task-definition artifacts describe the work
- governance artifacts describe how delivery is managed across tasks

## If the layout does not exist yet

Create the governance files once for the workspace before trying to run repeated governed delivery.

If the workspace already has equivalent files, prefer the existing convention instead of duplicating it.
