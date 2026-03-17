from __future__ import annotations

from xml.sax.saxutils import escape


def render_cover_card(payload: dict[str, object]) -> str:
    title = escape(str(payload.get("title", "")).strip())
    subtitle = escape(str(payload.get("subtitle", "")).strip())
    kicker = escape(str(payload.get("kicker", "FEATURE")).strip() or "FEATURE")

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">'
        '<defs><linearGradient id="coverBg" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#10151e"/><stop offset="100%" stop-color="#c44d22"/></linearGradient></defs>'
        '<rect width="1600" height="900" fill="url(#coverBg)"/>'
        '<circle cx="1340" cy="170" r="210" fill="#ffd9b8" fill-opacity="0.16"/>'
        '<rect x="76" y="76" width="1448" height="748" rx="40" fill="#111722" fill-opacity="0.72" stroke="#ffd8b8" stroke-opacity="0.25" stroke-width="3"/>'
        f'<text x="120" y="166" font-size="28" font-family="Georgia, serif" letter-spacing="5" fill="#ffd6b0">{kicker}</text>'
        '<rect x="118" y="206" width="12" height="362" rx="6" fill="#ffb47c"/>'
        f'<text x="162" y="360" font-size="120" font-family="Georgia, serif" font-weight="700" fill="#fff4e7">{title}</text>'
        f'<text x="166" y="470" font-size="42" font-family="Georgia, serif" fill="#f5caa8">{subtitle}</text>'
        '<text x="120" y="732" font-size="26" font-family="Georgia, serif" letter-spacing="3" fill="#d8c4af">VISUAL SKILL FRAMEWORK</text>'
        '<text x="120" y="778" font-size="30" font-family="Georgia, serif" fill="#fff4e7">Bold cover composition for article and project launches.</text>'
        '</svg>'
    )
