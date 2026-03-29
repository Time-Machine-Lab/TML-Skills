# Spec Governed Coding Bundle

`spec-governed-coding` is the single published entry skill for a governed delivery workflow built around spec artifacts, explicit routing, and reusable governance files.

## What ships inside this one skill

- entry skill logic in `SKILL.md`
- governance helpers in `scripts/`, `references/`, and `agents/`
- embedded companion skills in `skill-dependencies/`

The embedded companion skills are:

- `spec-subagent-orchestrator`
- `subagent-supervisor-constitution`
- `subagent-driven-development`
- `using-git-worktrees`
- `writing-plans`
- `requesting-code-review`
- `finishing-a-development-branch`
- `test-driven-development`
- `executing-plans`
- `code-reviewer`

## Install shape

Install only the `spec-governed-coding` directory into the target IDE's searchable skill namespace.

On first use, or whenever the bundle is repaired, run:

`python <installed-skill-root>/scripts/self_check_install.py`

That self-check installs any missing companion skills from `skill-dependencies/` into the same searchable namespace as the entry skill.

## Entry point

Once installed, invoke:

`use spec-governed-coding to complete this task`

The entry skill should first self-check embedded dependencies, then discover `spec.md`, `plan.md`, `tasks.md`, and `docs/governance/` automatically.
