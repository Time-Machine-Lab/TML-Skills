# Embedded Skill Dependencies

This directory keeps the companion skills that `spec-governed-coding` needs at runtime.

Design rule:

- keep the TML top-level `skills/` directory focused on atomic skills that users invoke directly
- place non-entry companion skills under this directory instead of exposing them as first-class root skills
- let `spec-governed-coding/scripts/self_check_install.py` copy missing companion skills into the target IDE skill namespace on demand

If you change the dependency list here, also update:

- `manifest.json`
- `DEPENDENCIES.md`
- `AI_INSTALL.md`
- `README.md`
- `SKILL.md`
