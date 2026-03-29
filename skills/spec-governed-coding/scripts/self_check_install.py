#!/usr/bin/env python3
"""Self-check and install embedded skill dependencies for spec-governed-coding."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify embedded dependencies for spec-governed-coding and install missing ones."
    )
    parser.add_argument(
        "--skill-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Path to the installed spec-governed-coding skill root.",
    )
    parser.add_argument(
        "--repair-existing",
        action="store_true",
        help="Re-copy dependencies even when a target directory already exists.",
    )
    return parser.parse_args()


def load_manifest(skill_root: Path) -> dict:
    manifest_path = skill_root / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def is_valid_skill_dir(path: Path) -> bool:
    return path.is_dir() and (path / "SKILL.md").is_file()


def copy_skill(src: Path, dst: Path, repair_existing: bool) -> str:
    if not is_valid_skill_dir(src):
        raise FileNotFoundError(f"Embedded dependency is incomplete: {src}")

    if dst.exists():
        if not repair_existing and is_valid_skill_dir(dst):
            return "ok"
        shutil.rmtree(dst)

    shutil.copytree(src, dst)
    return "installed"


def main() -> int:
    args = parse_args()
    skill_root = args.skill_root.resolve()

    try:
        manifest = load_manifest(skill_root)
    except Exception as exc:  # pragma: no cover - defensive path reporting
        print(f"ERROR {exc}", file=sys.stderr)
        return 1

    dependency_root = skill_root / manifest.get("dependency_root", "skill-dependencies")
    dependency_names = manifest.get("embedded_skill_dependencies", [])
    searchable_root = skill_root.parent

    if not dependency_root.is_dir():
        print(f"ERROR dependency root not found: {dependency_root}", file=sys.stderr)
        return 1

    print(f"SELF-CHECK skill_root={skill_root}")
    print(f"SELF-CHECK searchable_root={searchable_root}")
    print(f"SELF-CHECK dependency_root={dependency_root}")

    failed = False
    for name in dependency_names:
        src = dependency_root / name
        dst = searchable_root / name
        try:
            status = copy_skill(src, dst, repair_existing=args.repair_existing)
            print(f"{status.upper()} {name} -> {dst}")
        except Exception as exc:
            failed = True
            print(f"ERROR {name}: {exc}", file=sys.stderr)

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
