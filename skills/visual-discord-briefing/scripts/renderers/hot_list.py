from __future__ import annotations

from xml.sax.saxutils import escape


def render_hot_list(payload: dict[str, object]) -> str:
    title = escape(str(payload.get("title", "")).strip())
    items = payload.get("items", [])
    cards: list[dict[str, str]] = []
    if isinstance(items, list):
        for index, candidate in enumerate(items[:5], start=1):
            if not isinstance(candidate, dict):
                continue
            cards.append(
                {
                    "rank": escape(str(candidate.get("rank", index)).strip() or str(index)),
                    "name": escape(str(candidate.get("name", "")).strip()),
                    "tag": escape(str(candidate.get("tag", "TREND")).strip() or "TREND"),
                }
            )
    if not cards:
        cards = [{"rank": "1", "name": "No topic provided", "tag": "STANDBY"}]

    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">',
        '<rect width="1080" height="1350" fill="#0d1016"/>',
        '<rect x="54" y="54" width="972" height="1242" rx="34" fill="#121826"/>',
        '<rect x="72" y="72" width="936" height="168" rx="26" fill="#ff6b35"/>',
        f'<text x="110" y="176" font-size="86" font-family="Georgia, serif" font-weight="700" fill="#fff4e8">{title}</text>',
        '<text x="788" y="126" font-size="24" font-family="Georgia, serif" letter-spacing="2" fill="#381507">LIVE BOARD</text>',
        '<text x="788" y="176" font-size="40" font-family="Georgia, serif" font-weight="700" fill="#381507">NOW</text>',
    ]

    start_y = 294
    for index, card in enumerate(cards):
        y = start_y + index * 182
        parts.extend(
            [
                f'<rect x="72" y="{y}" width="936" height="150" rx="26" fill="#191f2e" stroke="#2f3950" stroke-width="3"/>',
                f'<circle cx="150" cy="{y + 75}" r="48" fill="#ff6b35"/>',
                f'<text x="132" y="{y + 92}" font-size="52" font-family="Georgia, serif" font-weight="700" fill="#fff4e8">{card["rank"]}</text>',
                f'<text x="236" y="{y + 70}" font-size="48" font-family="Georgia, serif" font-weight="700" fill="#f7f2ea">{card["name"]}</text>',
                f'<text x="236" y="{y + 112}" font-size="24" font-family="Georgia, serif" letter-spacing="2" fill="#99a6c3">{card["tag"]}</text>',
                f'<rect x="836" y="{y + 44}" width="132" height="56" rx="18" fill="#0d1016"/>',
                f'<text x="868" y="{y + 81}" font-size="22" font-family="Georgia, serif" fill="#ffb692">RISING</text>',
            ]
        )

    parts.append("</svg>")
    return "".join(parts)
