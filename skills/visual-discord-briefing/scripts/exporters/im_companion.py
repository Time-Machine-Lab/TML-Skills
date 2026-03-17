from __future__ import annotations

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

    # Fallback for hot_list: infer clickable items from payload URLs.
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


def export_im_clickable_markdown(
    *,
    template_type: str,
    payload: dict[str, object],
    companion: dict[str, object],
    output_base: str | Path,
) -> Path:
    base = Path(output_base).resolve()
    base_no_suffix = base.with_suffix("") if base.suffix else base
    out_path = base_no_suffix.with_suffix(".im.md")

    title = str(payload.get("title") or payload.get("name") or template_type).strip()
    links = _collect_links(template_type=template_type, payload=payload, companion=companion)

    lines: list[str] = [f"# {title}", ""]
    if links:
        lines.append("Quick links:")
        for label, url in links:
            lines.append(f"- [{label}]({url})")
    else:
        lines.append("No clickable links were provided.")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path
