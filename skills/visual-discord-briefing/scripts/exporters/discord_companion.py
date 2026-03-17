from __future__ import annotations

import json
from pathlib import Path


def _collect_links(
    *,
    template_type: str,
    payload: dict[str, object],
    companion: dict[str, object],
) -> list[tuple[str, str]]:
    raw_links = companion.get("links")
    links: list[tuple[str, str]] = []
    if isinstance(raw_links, list):
        for item in raw_links:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label", "")).strip()
            url = str(item.get("url", "")).strip()
            if label and url:
                links.append((label, url))
        if links:
            return links

    if template_type == "hot_list":
        raw_items = payload.get("items")
        if isinstance(raw_items, list):
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                label = str(item.get("name", "")).strip()
                url = str(item.get("url", "")).strip()
                if label and url:
                    links.append((label, url))
    return links


def export_discord_webhook_json(
    *,
    template_type: str,
    payload: dict[str, object],
    companion: dict[str, object],
    output_base: str | Path,
    primary_output: str,
) -> Path:
    base = Path(output_base).resolve()
    out_path = (base.with_suffix("") if base.suffix else base).with_suffix(".discord.json")

    title = str(payload.get("title") or payload.get("name") or template_type).strip()
    subtitle = str(payload.get("subtitle", "")).strip()
    image_url = f"attachment://{Path(primary_output).name}" if primary_output else None
    links = _collect_links(template_type=template_type, payload=payload, companion=companion)

    discord_payload: dict[str, object] = {
        "embeds": [
            {
                "title": title,
                "description": subtitle,
            }
        ],
        "components": [],
    }
    if image_url:
        discord_payload["embeds"][0]["image"] = {"url": image_url}

    components: list[dict[str, object]] = []
    for label, url in links[:5]:
        components.append(
            {
                "type": 1,
                "components": [
                    {
                        "type": 2,
                        "style": 5,
                        "label": label,
                        "url": url,
                    }
                ],
            }
        )
    discord_payload["components"] = components

    out_path.write_text(json.dumps(discord_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path
