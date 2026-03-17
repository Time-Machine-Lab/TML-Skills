from __future__ import annotations

from pathlib import Path

import cairosvg


def export_svg_variants(
    svg_text: str,
    output_base: str | Path,
    *,
    formats: list[str],
    scale: float = 2,
) -> list[dict[str, str]]:
    base = Path(output_base).resolve()
    base_no_suffix = base.with_suffix("") if base.suffix else base
    rendered_files: list[dict[str, str]] = []

    for fmt in formats:
        normalized = fmt.lower().lstrip(".")
        if normalized == "svg":
            path = base_no_suffix.with_suffix(".svg")
            path.write_text(svg_text, encoding="utf-8")
            rendered_files.append({"format": "svg", "path": str(path)})
            continue
        if normalized != "png":
            raise ValueError(f"Unsupported export format: {normalized}")

        path = base_no_suffix.with_suffix(".png")
        cairosvg.svg2png(
            bytestring=svg_text.encode("utf-8"),
            write_to=str(path),
            scale=scale,
        )
        rendered_files.append({"format": "png", "path": str(path)})

    return rendered_files
