# Skill Change Log

Use this file to record why `spec-governed-coding` changed.

Keep entries short and evidence-driven.

## 2026-03-26 - Add executable governance bootstrap

- source run logs:
  - none
- observed pattern:
  - the skill described automatic workspace governance bootstrap, but there was no actual helper to perform it
- skill change:
  - added `scripts/bootstrap_governance_baseline.py`
  - updated `SKILL.md` and `references/bootstrap-baseline.md` to call the helper directly

## 2026-03-26 - Strengthen delegation posture

- source run logs:
  - `docs/governance/runs/2026-03-24-content-slicing-anti-corrosion-layer.md`
  - `docs/governance/runs/2026-03-24-pdf-segmented-content-detection.md`
  - `docs/governance/runs/2026-03-26-content-detection-structured-bundle-pre-llm.md`
- observed pattern:
  - the workflow was already producing atomic slices, but the master still defaulted to direct execution after slicing
- skill change:
  - added a `Delegation Posture` section
  - made master execution an exception path after `tasks.md` exists and the next step is atomically sliceable
  - tightened `spec-subagent-orchestrator` so dispatch becomes the default once a clean atomic executor task exists

## 2026-03-26 - Add explicit delegation blocker field

- source run logs:
  - `docs/governance/runs/2026-03-24-content-slicing-anti-corrosion-layer.md`
  - `docs/governance/runs/2026-03-24-pdf-segmented-content-detection.md`
  - `docs/governance/runs/2026-03-26-content-detection-structured-bundle-governance-baseline.md`
- observed pattern:
  - run logs explained why work stayed local, but the reasons were not stable or auditable enough to distinguish real blockers from habit
- skill change:
  - required `delegation blocker` in dispatch output whenever staying local
  - added examples of acceptable and unacceptable blocker phrases

## 2026-03-29 - Embed companion skills and add self-check install

- source run logs:
  - none
- observed pattern:
  - the TML top-level skill catalog was exposing bundle-internal companion skills that users do not invoke directly
  - installing the bundle required flattening multiple support skills into the root namespace by hand
- skill change:
  - moved companion skills under `spec-governed-coding/skill-dependencies/`
  - added `scripts/self_check_install.py` to verify and dynamically install missing companion skills
  - updated bundle docs and manifest so `spec-governed-coding` is installed as a single self-contained entry skill
