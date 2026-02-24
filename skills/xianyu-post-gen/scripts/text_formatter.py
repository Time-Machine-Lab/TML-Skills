import json
import os
import re
from typing import Any, Dict


def _load_json(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def load_emojis(assets_dir: str) -> Dict[str, str]:
    return _load_json(os.path.join(assets_dir, "emojis.json"))


def load_styles(assets_dir: str) -> Dict[str, Dict[str, Any]]:
    return _load_json(os.path.join(assets_dir, "styles.json"))


def normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def safe_format(template: str, values: Dict[str, Any]) -> str:
    class SafeDict(dict):
        def __missing__(self, key: str) -> str:
            return ""

    return template.format_map(SafeDict(values))


def format_with_emojis(template_str: str, emojis: Dict[str, str]) -> str:
    out = template_str
    for key, value in emojis.items():
        out = out.replace("{" + key + "}", value)

    defaults = {
        "{fire}": "[火]",
        "{star}": "[星星]",
        "{check}": "[对勾]",
        "{heart}": "[爱心]",
        "{lightning}": "[闪电]",
    }
    for key, value in defaults.items():
        out = out.replace(key, value)

    return out


def sanitize_to_xianyu_emoji(text: str) -> str:
    # Replace common unicode emojis with Xianyu-friendly bracket tags, then remove the rest.
    if not text:
        return ""

    replacements = {
        "🔥": "[火]",
        "⭐": "[星星]",
        "🌟": "[星星]",
        "✨": "[星星]",
        "❤️": "[爱心]",
        "❤": "[爱心]",
        "💖": "[爱心]",
        "✅": "[对勾]",
        "✔️": "[对勾]",
        "⚡": "[闪电]",
        "⚠️": "[警告]",
        "⚠": "[警告]",
        "💎": "[钻石]",
        "🚀": "[火箭]",
        "🎁": "[礼物]",
        "🤝": "[握手]",
        "💰": "[钱]",
        "📷": "[相机]",
        "🆕": "[全新]",
        "😎": "[酷]",
    }
    out = text
    for src, dst in replacements.items():
        out = out.replace(src, dst)

    # Strip remaining pictographic emojis to avoid unsupported symbols on Xianyu.
    emoji_pattern = re.compile(
        "["
        "\U0001F300-\U0001F5FF"
        "\U0001F600-\U0001F64F"
        "\U0001F680-\U0001F6FF"
        "\U0001F700-\U0001F77F"
        "\U0001F780-\U0001F7FF"
        "\U0001F800-\U0001F8FF"
        "\U0001F900-\U0001F9FF"
        "\U0001FA00-\U0001FAFF"
        "\u2600-\u26FF"
        "\u2700-\u27BF"
        "]+",
        flags=re.UNICODE,
    )
    out = emoji_pattern.sub("", out)
    return normalize_whitespace(out)


def clamp_title(title: str, max_len: int = 30) -> str:
    title = normalize_whitespace(title)
    if len(title) <= max_len:
        return title
    return title[: max_len - 1] + "…"


def compact_lines(text: str) -> str:
    lines = [line.strip() for line in text.split("\n")]
    lines = [line for line in lines if line]
    return "\n".join(lines)


def get_style_config(style_name: str, styles_config: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    return styles_config.get(style_name) or styles_config.get("normal", {})
