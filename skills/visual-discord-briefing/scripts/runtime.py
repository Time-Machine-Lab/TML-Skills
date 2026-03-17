#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path

from exporters import export_discord_webhook_json, export_im_clickable_markdown, export_svg_variants
from providers import resolve_payload
from renderers import RENDERER_REGISTRY
from validators import validate_envelope, validate_payload


def build_result() -> dict[str, object]:
    return {
        "ok": True,
        "templates": sorted(RENDERER_REGISTRY),
    }


def load_spec(spec_path: str | Path) -> dict[str, object]:
    path = Path(spec_path).resolve()
    if not path.exists():
        raise ValueError(f"Spec file does not exist: {path}")
    if path.suffix.lower() != ".json":
        raise ValueError(f"Spec file must be a .json file: {path}")

    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, dict):
        raise ValueError("Spec JSON must decode to an object")
    return payload


def render_spec(spec: object, *, base_dir: str | Path | None = None) -> dict[str, object]:
    envelope = validate_envelope(spec)
    template_type = str(envelope["template_type"])
    resolved_payload = resolve_payload(
        envelope,
        base_dir=Path(base_dir).resolve() if base_dir is not None else Path.cwd(),
    )
    payload = validate_payload(template_type, resolved_payload)
    renderer = RENDERER_REGISTRY[template_type]
    svg = renderer(payload)

    return {
        "ok": True,
        "goal": envelope.get("goal", ""),
        "meta": envelope["meta"],
        "output": envelope["output"],
        "output_formats": envelope["output"]["formats"],
        "payload": payload,
        "renderer": renderer.__name__,
        "svg": svg,
        "template_type": template_type,
    }


def render_to_file(spec: object, output_path: str | Path, *, base_dir: str | Path | None = None) -> dict[str, object]:
    target = Path(output_path).resolve()
    resolved_base_dir = Path(base_dir).resolve() if base_dir is not None else target.parent
    result = render_spec(spec, base_dir=resolved_base_dir)
    target.parent.mkdir(parents=True, exist_ok=True)
    rendered_files = export_svg_variants(
        str(result["svg"]),
        target,
        formats=list(result["output_formats"]),
        scale=float(result["output"].get("scale", 2)) if isinstance(result["output"], dict) else 2,
    )

    primary_output = rendered_files[0]["path"] if rendered_files else ""
    for file_info in rendered_files:
        if file_info["format"] == "svg":
            primary_output = file_info["path"]
            break

    result["primary_output"] = primary_output
    result["rendered_files"] = rendered_files

    companion = spec.get("companion")
    if isinstance(companion, dict):
        mode = str(companion.get("mode", "")).strip()
        if mode == "im_clickable":
            companion_path = export_im_clickable_markdown(
                template_type=str(result["template_type"]),
                payload=dict(result["payload"]) if isinstance(result["payload"], dict) else {},
                companion=companion,
                output_base=target,
            )
            result["companion_output"] = str(companion_path)
            result["rendered_files"].append({"format": "im_md", "path": str(companion_path)})
        if mode == "discord_webhook":
            discord_path = export_discord_webhook_json(
                template_type=str(result["template_type"]),
                payload=dict(result["payload"]) if isinstance(result["payload"], dict) else {},
                companion=companion,
                output_base=target,
                primary_output=primary_output,
            )
            result["discord_output"] = str(discord_path)
            result["rendered_files"].append({"format": "discord_json", "path": str(discord_path)})
    return result


def main() -> None:
    print(json.dumps(build_result(), ensure_ascii=False))
