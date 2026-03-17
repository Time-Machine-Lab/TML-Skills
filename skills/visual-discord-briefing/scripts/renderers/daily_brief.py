from __future__ import annotations

from xml.sax.saxutils import escape


def _wrap_lines(text: str, limit: int = 30) -> list[str]:
    content = text.strip()
    if not content:
        return []
    return [escape(content[index : index + limit]) for index in range(0, len(content), limit)]


def render_daily_brief(payload: dict[str, object]) -> str:
    title = escape(str(payload.get("title", "")).strip())
    date = escape(str(payload.get("date", "")).strip())
    summary = str(payload.get("summary", "")).strip()
    highlights = payload.get("highlights", [])
    highlight_lines: list[str] = []
    if isinstance(highlights, list):
        for item in highlights[:3]:
            content = str(item).strip()
            if content:
                highlight_lines.append(escape(content))
    summary_lines = _wrap_lines(summary, 28)[:3]

    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">',
        '<rect width="1200" height="1600" fill="#efe3d0"/>',
        '<rect x="48" y="48" width="1104" height="1504" rx="18" fill="#fbf4e9" stroke="#1e1712" stroke-width="4"/>',
        '<rect x="76" y="76" width="724" height="168" rx="10" fill="#a23d26"/>',
        f'<text x="100" y="126" font-size="30" font-family="Georgia, serif" letter-spacing="2" fill="#fcefdc">{date}</text>',
        f'<text x="100" y="206" font-size="92" font-family="Georgia, serif" font-weight="700" fill="#fff7ea">{title}</text>',
        '<rect x="828" y="76" width="296" height="168" rx="10" fill="#1e1712"/>',
        '<text x="854" y="130" font-size="26" font-family="Georgia, serif" fill="#dcbf9d">EDITOR NOTES</text>',
        '<text x="854" y="182" font-size="58" font-family="Georgia, serif" font-weight="700" fill="#fff8ed">DAILY</text>',
        '<line x1="78" y1="288" x2="1122" y2="288" stroke="#ccbaa0" stroke-width="4"/>',
        '<line x1="78" y1="306" x2="1122" y2="306" stroke="#ccbaa0" stroke-width="1.5"/>',
        '<rect x="78" y="348" width="700" height="870" rx="16" fill="#fffdf8" stroke="#d9ccb7" stroke-width="3"/>',
        '<rect x="816" y="348" width="306" height="548" rx="16" fill="#f6ecdf" stroke="#d9ccb7" stroke-width="3"/>',
        '<rect x="816" y="924" width="306" height="294" rx="16" fill="#1f1a16"/>',
        '<text x="104" y="408" font-size="28" font-family="Georgia, serif" letter-spacing="3" fill="#a23d26">LEAD SUMMARY</text>',
    ]

    y = 492
    for line in summary_lines or [escape(summary)]:
        if not line:
            continue
        parts.append(
            f'<text x="104" y="{y}" font-size="52" font-family="Georgia, serif" fill="#2b231d">{line}</text>'
        )
        y += 74

    parts.append('<line x1="104" y1="620" x2="752" y2="620" stroke="#d6c7b2" stroke-width="2"/>')
    parts.append('<text x="104" y="686" font-size="24" font-family="Georgia, serif" letter-spacing="2" fill="#8a7660">HIGHLIGHTS</text>')
    y = 756
    for item in highlight_lines or ["No curated highlights yet."]:
        parts.append(f'<circle cx="120" cy="{y - 12}" r="7" fill="#a23d26"/>')
        parts.append(
            f'<text x="146" y="{y}" font-size="34" font-family="Georgia, serif" fill="#342a22">{item}</text>'
        )
        y += 88

    parts.extend(
        [
            '<text x="842" y="408" font-size="24" font-family="Georgia, serif" letter-spacing="2" fill="#7d6751">OUTLOOK</text>',
            '<text x="842" y="476" font-size="44" font-family="Georgia, serif" fill="#201813">Calm but alert.</text>',
            '<text x="842" y="542" font-size="28" font-family="Georgia, serif" fill="#4e4032">Focus on the story with the</text>',
            '<text x="842" y="586" font-size="28" font-family="Georgia, serif" fill="#4e4032">highest leverage, not the</text>',
            '<text x="842" y="630" font-size="28" font-family="Georgia, serif" fill="#4e4032">loudest headline.</text>',
            '<text x="842" y="984" font-size="22" font-family="Georgia, serif" letter-spacing="2" fill="#bea98f">BACK PAGE NOTE</text>',
            '<text x="842" y="1058" font-size="48" font-family="Georgia, serif" fill="#fff8eb">Signal over noise.</text>',
            '<text x="842" y="1122" font-size="28" font-family="Georgia, serif" fill="#ddcab3">Built for deliberate daily reading.</text>',
        ]
    )

    parts.append("</svg>")
    return "".join(parts)
