# Dependencies

`spec-governed-coding` is now the only top-level entry skill in this bundle.

## Embedded companion skills

These companion skills live under `skill-dependencies/` and should not be published as peer directories in the TML root skill catalog:

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

## Bundled assets that must travel with `spec-governed-coding`

- `scripts/bootstrap_governance_baseline.py`
- `scripts/self_check_install.py`
- `references/bootstrap-baseline.md`
- `references/governance-layout.md`
- `references/run-log-policy.md`
- `references/state-discovery.md`
- `references/templates/delivery-constitution.md`
- `references/templates/delivery-protocol.md`
- `references/templates/executor-profile-catalog.md`
- `references/templates/run-log-template.md`
- `agents/openai.yaml`
- `skill-dependencies/`

## Packaging rule

Publish and install only the `spec-governed-coding` directory.

The entry skill is responsible for:

- self-checking whether companion skills are already available in the searchable skill namespace
- dynamically installing missing companion skills from `skill-dependencies/`
- keeping the TML top-level `skills/` directory limited to directly invoked atomic skills
