#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path

from runtime import load_spec, render_to_file


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a visual artifact from a JSON spec.")
    parser.add_argument("--spec", required=True, help="Path to the JSON spec file.")
    parser.add_argument("--output", required=True, help="Output path or basename for the rendered file.")
    args = parser.parse_args()

    spec = load_spec(args.spec)
    result = render_to_file(spec, args.output, base_dir=str(Path(args.spec).resolve().parent))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
