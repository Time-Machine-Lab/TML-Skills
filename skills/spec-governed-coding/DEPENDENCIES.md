# Dependencies

This bundle is intended to be installed as a complete governed-delivery stack.

## Required for the published bundle

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
- `references/bootstrap-baseline.md`
- `references/governance-layout.md`
- `references/run-log-policy.md`
- `references/state-discovery.md`
- `references/templates/delivery-constitution.md`
- `references/templates/delivery-protocol.md`
- `references/templates/executor-profile-catalog.md`
- `references/templates/run-log-template.md`
- `agents/openai.yaml`

## Packaging rule

Do not publish `spec-governed-coding` alone. Publish the full set above so installation stays deterministic and the workflow never has to fall back to missing-skill behavior.
