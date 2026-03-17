#!/usr/bin/env python3


SUPPORTED_TEMPLATE_TYPES = {
    "daily_brief",
    "hot_list",
    "weekly_digest",
    "cover_card",
    "profile_card",
}


SUPPORTED_OUTPUT_FORMATS = {"svg", "png", "jpg", "jpeg", "webp"}
SUPPORTED_COMPANION_MODES = {"im_clickable", "discord_webhook"}

REQUIRED_PAYLOAD_FIELDS = {
    "daily_brief": ("title", "date"),
    "hot_list": ("title", "items"),
    "weekly_digest": ("title", "period"),
    "cover_card": ("title",),
    "profile_card": ("name",),
}


def _normalize_output_formats(value: object) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ValueError("output.formats must be a non-empty list")

    normalized: list[str] = []
    for item in value:
        fmt = str(item).strip().lower().lstrip(".")
        if fmt not in SUPPORTED_OUTPUT_FORMATS:
            raise ValueError(f"Unsupported output format: {fmt}")
        if fmt not in normalized:
            normalized.append(fmt)
    return normalized


def validate_envelope(spec: object) -> dict[str, object]:
    if not isinstance(spec, dict):
        raise ValueError("Spec must decode to an object")

    template_type = str(spec.get("template_type", "")).strip()
    if template_type not in SUPPORTED_TEMPLATE_TYPES:
        raise ValueError(f"Unsupported template_type: {template_type}")

    payload = spec.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    output = spec.get("output")
    if not isinstance(output, dict):
        raise ValueError("output must be an object")

    formats = _normalize_output_formats(output.get("formats"))
    scale = output.get("scale", 2)
    quality = output.get("quality", 92)

    meta = spec.get("meta")
    if not isinstance(meta, dict):
        meta = {}

    normalized: dict[str, object] = dict(spec)
    normalized["template_type"] = template_type
    normalized["payload"] = payload
    normalized["output"] = {
        "formats": formats,
        "scale": scale,
        "quality": quality,
    }
    companion = spec.get("companion")
    if companion is not None:
        if not isinstance(companion, dict):
            raise ValueError("companion must be an object")
        mode = str(companion.get("mode", "")).strip()
        if not mode:
            raise ValueError("companion.mode is required when companion is provided")
        if mode not in SUPPORTED_COMPANION_MODES:
            raise ValueError(f"Unsupported companion mode: {mode}")
        normalized["companion"] = dict(companion)
    normalized["meta"] = {
        "lang": str(meta.get("lang", "zh-CN")).strip() or "zh-CN",
    }
    return normalized


def validate_payload(template_type: str, payload: object) -> dict[str, object]:
    if template_type not in REQUIRED_PAYLOAD_FIELDS:
        raise ValueError(f"Unsupported template_type: {template_type}")
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    for field in REQUIRED_PAYLOAD_FIELDS[template_type]:
        value = payload.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValueError(f"Missing required field: {field}")

    if template_type == "hot_list" and not isinstance(payload.get("items"), list):
        raise ValueError("Missing required field: items")

    return payload
