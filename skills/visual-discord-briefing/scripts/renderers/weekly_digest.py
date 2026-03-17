from __future__ import annotations

from xml.sax.saxutils import escape


def render_weekly_digest(payload: dict[str, object]) -> str:
    title = escape(str(payload.get("title", "")).strip())
    period = escape(str(payload.get("period", "")).strip())
    insights = payload.get("insights", [])
    insight_text = "Three systems improved in parallel."
    if isinstance(insights, list) and insights:
        insight_text = str(insights[0]).strip() or insight_text
    insight_text = escape(insight_text)

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1600" viewBox="0 0 1280 1600">'
        '<rect width="1280" height="1600" fill="#eaf2ff"/>'
        '<rect x="52" y="52" width="1176" height="1496" rx="34" fill="#fcfdff"/>'
        '<rect x="80" y="82" width="1120" height="200" rx="28" fill="#17355e"/>'
        f'<text x="118" y="146" font-size="28" font-family="Georgia, serif" letter-spacing="2" fill="#a8c8ff">{period}</text>'
        f'<text x="118" y="230" font-size="92" font-family="Georgia, serif" font-weight="700" fill="#f3f7ff">{title}</text>'
        '<rect x="80" y="332" width="536" height="280" rx="24" fill="#102745"/>'
        '<text x="112" y="388" font-size="22" font-family="Georgia, serif" letter-spacing="2" fill="#90b5ec">SIGNAL</text>'
        '<text x="112" y="504" font-size="104" font-family="Georgia, serif" font-weight="700" fill="#ffffff">78%</text>'
        '<text x="112" y="554" font-size="26" font-family="Georgia, serif" fill="#c0d6fb">Weekly priority completion</text>'
        '<rect x="664" y="332" width="536" height="280" rx="24" fill="#f1f6ff" stroke="#cad9f2" stroke-width="4"/>'
        '<text x="700" y="388" font-size="22" font-family="Georgia, serif" letter-spacing="2" fill="#375f9a">NOTES</text>'
        f'<text x="700" y="470" font-size="40" font-family="Georgia, serif" fill="#15263f">{insight_text}</text>'
        '<rect x="80" y="656" width="1120" height="796" rx="24" fill="#ffffff" stroke="#d8e3f6" stroke-width="4"/>'
        '<text x="118" y="720" font-size="24" font-family="Georgia, serif" letter-spacing="2" fill="#33588e">DIGEST BLOCKS</text>'
        '<rect x="118" y="764" width="316" height="250" rx="22" fill="#eff5ff"/>'
        '<rect x="482" y="764" width="316" height="250" rx="22" fill="#eff5ff"/>'
        '<rect x="846" y="764" width="316" height="250" rx="22" fill="#eff5ff"/>'
        '<text x="148" y="838" font-size="26" font-family="Georgia, serif" fill="#37588c">Top wins</text>'
        '<text x="512" y="838" font-size="26" font-family="Georgia, serif" fill="#37588c">Metrics</text>'
        '<text x="876" y="838" font-size="26" font-family="Georgia, serif" fill="#37588c">Next steps</text>'
        '<text x="148" y="902" font-size="42" font-family="Georgia, serif" font-weight="700" fill="#15263f">03</text>'
        '<text x="512" y="902" font-size="42" font-family="Georgia, serif" font-weight="700" fill="#15263f">12</text>'
        '<text x="876" y="902" font-size="42" font-family="Georgia, serif" font-weight="700" fill="#15263f">05</text>'
        '</svg>'
    )
