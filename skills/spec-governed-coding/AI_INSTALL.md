# AI Install Instructions

## Goal

Install the full `spec-governed-coding` bundle into the target AI IDE without changing workflow content.

## Detect target directory

- Codex: `.codex/skills/`
- Trae: `.trae/skills/`
- Claude Code: `.claude/skills/`

If the IDE uses a different but equivalent searchable skill directory, use that directory instead.

## Copy these directories

- `spec-governed-coding`
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

## Verification

After copying, verify:

- every copied directory contains its expected primary file
- `spec-governed-coding/scripts/bootstrap_governance_baseline.py` exists
- `spec-governed-coding/references/templates/` contains all four governance templates
- no installation step rewrote the skill content or removed sibling asset folders

## First-use smoke test

Ask the assistant to use:

`spec-governed-coding`

Then confirm it can:

- locate the installed skill directory
- describe the governance bootstrap helper path relative to that installed directory
- name `spec-subagent-orchestrator` as the next routing skill
