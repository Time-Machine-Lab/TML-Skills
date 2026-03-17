from __future__ import annotations

import json
from pathlib import Path


def _load_local_json(provider: dict[str, object], *, base_dir: Path) -> dict[str, object]:
    raw_path = str(provider.get("path", "")).strip()
    if not raw_path:
        raise ValueError("local_json provider requires path")

    path = Path(raw_path)
    if not path.is_absolute():
        path = (base_dir / path).resolve()
    else:
        path = path.resolve()

    if not path.exists():
        raise ValueError(f"Provider file does not exist: {path}")

    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, dict):
        raise ValueError("Provider payload must decode to an object")
    return payload


def resolve_payload(spec: dict[str, object], *, base_dir: str | Path) -> dict[str, object]:
    base = Path(base_dir).resolve()
    payload = spec.get("payload", {})
    if not isinstance(payload, dict):
        payload = {}

    provider = spec.get("provider")
    if not isinstance(provider, dict):
        return dict(payload)

    provider_type = str(provider.get("type", "")).strip().lower()
    if not provider_type:
        return dict(payload)
    if provider_type != "local_json":
        raise ValueError(f"Unsupported provider type: {provider_type}")

    provider_payload = _load_local_json(provider, base_dir=base)
    return {**provider_payload, **payload}
