# AI Install Instructions

## Goal

Install `spec-governed-coding` as a single entry skill with embedded companion skills, without flattening its dependencies into the top-level TML skill catalog.

## Detect target directory

- Codex: `.codex/skills/`
- Trae: `.trae/skills/`
- Claude Code: `.claude/skills/`

If the IDE uses a different but equivalent searchable skill directory, use that directory instead.

## Copy this directory

- `spec-governed-coding`

Keep the directory intact, including:

- `scripts/`
- `references/`
- `agents/`
- `skill-dependencies/`

Do not flatten `skill-dependencies/` into the target skill root during repository packaging.

## Self-check and dynamic install

After copying, run:

`python <installed-skill-root>/scripts/self_check_install.py`

This script verifies embedded dependencies and installs any missing companion skills from:

`<installed-skill-root>/skill-dependencies/`

into the target IDE's searchable skill directory.

## Verification

After copying, verify:

- the copied `spec-governed-coding` directory contains its expected primary file
- `spec-governed-coding/scripts/bootstrap_governance_baseline.py` exists
- `spec-governed-coding/scripts/self_check_install.py` exists
- `spec-governed-coding/references/templates/` contains all four governance templates
- `spec-governed-coding/skill-dependencies/` contains every embedded companion skill
- no installation step rewrote the skill content, removed sibling asset folders, or flattened companion skills into the TML root catalog

## First-use smoke test

Ask the assistant to use:

`spec-governed-coding`

Then confirm it can:

- locate the installed skill directory
- describe the self-check helper path relative to that installed directory
- describe the governance bootstrap helper path relative to that installed directory
- confirm that missing companion skills are installed from `skill-dependencies/`
- name `spec-subagent-orchestrator` as the next routing skill after self-check passes
