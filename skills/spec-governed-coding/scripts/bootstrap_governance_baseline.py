#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


FILES = (
    "delivery-constitution.md",
    "delivery-protocol.md",
    "executor-profile-catalog.md",
    "run-log-template.md",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install the spec-governed-coding governance baseline into a workspace."
    )
    parser.add_argument(
        "--workspace",
        default=".",
        help="Workspace root to install into. Defaults to the current directory.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing governance files.",
    )
    parser.add_argument(
        "--skill-root",
        help="Explicit installed skill root. Defaults to the parent of this script.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    script_path = Path(__file__).resolve()
    skill_root = (
        Path(args.skill_root).resolve()
        if args.skill_root
        else script_path.parent.parent
    )
    templates_dir = skill_root / "references" / "templates"
    workspace = Path(args.workspace).resolve()
    governance_dir = workspace / "docs" / "governance"

    missing_templates = [name for name in FILES if not (templates_dir / name).exists()]
    if missing_templates:
        for name in missing_templates:
            print(f"missing template: {templates_dir / name}", file=sys.stderr)
        return 1

    governance_dir.mkdir(parents=True, exist_ok=True)

    created: list[Path] = []
    skipped: list[Path] = []
    overwritten: list[Path] = []

    for name in FILES:
        source = templates_dir / name
        destination = governance_dir / name
        existed_before = destination.exists()
        if existed_before and not args.force:
            skipped.append(destination)
            continue
        shutil.copy2(source, destination)
        if existed_before:
            overwritten.append(destination)
        else:
            created.append(destination)

    print(f"workspace: {workspace}")
    print(f"installed baseline dir: {governance_dir}")

    if created:
        print("created:")
        for path in created:
            print(f"  - {path}")

    if overwritten:
        print("overwritten:")
        for path in overwritten:
            print(f"  - {path}")

    if skipped:
        print("skipped existing:")
        for path in skipped:
            print(f"  - {path}")

    if not created and not overwritten:
        print("no files changed")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
