# Bootstrap Baseline

Use this reference when the current workspace does not yet have governance files.

## Default behavior

Bootstrap the workspace baseline automatically from this skill's templates.

Preferred command:

`python3 <installed-skill-root>/scripts/bootstrap_governance_baseline.py --workspace <workspace-root>`

Create:

- `docs/governance/delivery-constitution.md`
- `docs/governance/delivery-protocol.md`
- `docs/governance/executor-profile-catalog.md`
- `docs/governance/run-log-template.md`

using:

- `references/templates/delivery-constitution.md`
- `references/templates/delivery-protocol.md`
- `references/templates/executor-profile-catalog.md`
- `references/templates/run-log-template.md`

## Important rule

Missing workspace governance files are a setup condition, not a governance failure.

Bootstrap first, then continue with normal governed execution.

## After bootstrap

Report briefly:

- that the workspace baseline was installed
- where it was installed
- that future runs should use the workspace-local copies
