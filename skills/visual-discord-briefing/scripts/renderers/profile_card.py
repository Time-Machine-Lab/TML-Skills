from __future__ import annotations

from xml.sax.saxutils import escape


def render_profile_card(payload: dict[str, object]) -> str:
    name = escape(str(payload.get("name", "")).strip())
    role = escape(str(payload.get("role", "")).strip())
    bio = escape(str(payload.get("bio", "Focused operator with a sharp point of view.")).strip())

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">'
        '<rect width="1080" height="1350" fill="#edf5ef"/>'
        '<rect x="58" y="58" width="964" height="1234" rx="34" fill="#fbfdfb" stroke="#103c2e" stroke-width="4"/>'
        '<rect x="86" y="86" width="908" height="250" rx="28" fill="#143d2d"/>'
        '<circle cx="216" cy="212" r="92" fill="#d7efe0"/>'
        '<circle cx="216" cy="212" r="54" fill="#143d2d"/>'
        f'<text x="352" y="202" font-size="82" font-family="Georgia, serif" font-weight="700" fill="#f6fbf7">{name}</text>'
        f'<text x="352" y="268" font-size="36" font-family="Georgia, serif" fill="#c0dfce">{role}</text>'
        '<rect x="86" y="388" width="908" height="420" rx="26" fill="#eef7f1"/>'
        '<text x="122" y="448" font-size="24" font-family="Georgia, serif" letter-spacing="3" fill="#355f4f">PROFILE</text>'
        f'<text x="122" y="532" font-size="44" font-family="Georgia, serif" fill="#173528">{bio}</text>'
        '<rect x="86" y="848" width="430" height="366" rx="26" fill="#143d2d"/>'
        '<rect x="564" y="848" width="430" height="366" rx="26" fill="#f5fbf7" stroke="#d3e8db" stroke-width="3"/>'
        '<text x="122" y="918" font-size="24" font-family="Georgia, serif" letter-spacing="3" fill="#b7d9c6">TRAITS</text>'
        '<text x="122" y="1002" font-size="48" font-family="Georgia, serif" fill="#ffffff">Calm</text>'
        '<text x="122" y="1068" font-size="48" font-family="Georgia, serif" fill="#ffffff">Precise</text>'
        '<text x="122" y="1134" font-size="48" font-family="Georgia, serif" fill="#ffffff">Reliable</text>'
        '<text x="600" y="918" font-size="24" font-family="Georgia, serif" letter-spacing="3" fill="#456858">METRICS</text>'
        '<text x="600" y="1002" font-size="56" font-family="Georgia, serif" font-weight="700" fill="#143d2d">12Y</text>'
        '<text x="600" y="1050" font-size="30" font-family="Georgia, serif" fill="#4c6f60">Experience</text>'
        '<text x="600" y="1138" font-size="56" font-family="Georgia, serif" font-weight="700" fill="#143d2d">08</text>'
        '<text x="600" y="1186" font-size="30" font-family="Georgia, serif" fill="#4c6f60">Core programs</text>'
        '</svg>'
    )
