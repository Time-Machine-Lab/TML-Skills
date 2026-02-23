import argparse
import json
import os
import random
import re
import sys
from typing import Dict, List, Optional

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import image_prompt_gen
import search_references
import text_formatter
import xianyu_live_search


CATEGORY_KEYWORDS = {
    "electronics": ["手机", "平板", "耳机", "相机", "电脑", "macbook", "iphone", "airpods", "显卡", "键盘", "主机", "显示器"],
    "digital": ["课程", "网盘", "电子书", "教程", "素材", "源码", "会员", "账号", "pdf", "资料", "提示词", "自动化", "部署"],
    "fashion": ["鞋", "包", "衣", "外套", "手表", "首饰", "裙", "球鞋"],
    "home": ["桌", "椅", "床", "灯", "家电", "厨房", "扫地机", "空气炸锅"],
    "beauty": ["护肤", "面霜", "口红", "香水", "面膜", "彩妆"],
}

CONDITION_ALIASES = {
    "全新": "new",
    "99新": "like_new",
    "95新": "good",
    "9新": "good",
    "8成新": "fair",
    "正常使用": "good",
    "new": "new",
    "like new": "like_new",
    "good": "good",
    "fair": "fair",
    "used": "used",
}

CONDITION_ZH = {
    "new": "全新",
    "like_new": "99新",
    "good": "9成新",
    "fair": "8成新",
    "used": "二手",
}

DIGITAL_HINTS = ["课程", "教程", "资料", "网盘", "账号", "会员", "素材", "源码", "pdf", "提示词", "虚拟"]


def parse_input(raw_text: str) -> Dict[str, str]:
    text = text_formatter.normalize_whitespace(raw_text)

    fields = {
        "product_name": "",
        "category": "",
        "condition": "",
        "price": "",
        "original_price": "",
        "reason": "",
        "highlights": "",
        "defects": "",
        "delivery": "",
        "location": "",
        "shipping": "",
        "warranty": "",
        "accessories": "",
        "notes": "",
    }

    key_map = {
        "商品": "product_name",
        "商品名称": "product_name",
        "名称": "product_name",
        "品名": "product_name",
        "product": "product_name",
        "product_name": "product_name",
        "category": "category",
        "分类": "category",
        "类目": "category",
        "成色": "condition",
        "condition": "condition",
        "价格": "price",
        "售价": "price",
        "一口价": "price",
        "price": "price",
        "原价": "original_price",
        "original_price": "original_price",
        "转手原因": "reason",
        "原因": "reason",
        "reason": "reason",
        "亮点": "highlights",
        "卖点": "highlights",
        "优势": "highlights",
        "highlights": "highlights",
        "瑕疵": "defects",
        "缺陷": "defects",
        "defects": "defects",
        "发货": "delivery",
        "交易方式": "delivery",
        "delivery": "delivery",
        "地区": "location",
        "城市": "location",
        "location": "location",
        "包邮": "shipping",
        "邮费": "shipping",
        "shipping": "shipping",
        "质保": "warranty",
        "售后": "warranty",
        "warranty": "warranty",
        "配件": "accessories",
        "accessories": "accessories",
        "备注": "notes",
        "notes": "notes",
    }

    for line in text.split("\n"):
        m = re.match(r"^\s*([^:：]{1,20})\s*[:：]\s*(.+?)\s*$", line)
        if not m:
            continue

        key = m.group(1).strip().lower()
        value = m.group(2).strip()
        mapped = key_map.get(key)
        if mapped and value:
            fields[mapped] = value

    if not fields["product_name"]:
        first_line = next((ln for ln in text.split("\n") if ln.strip()), "闲置物品")
        fields["product_name"] = re.sub(r"^[#\-*\s]+", "", first_line).strip()

    if not fields["reason"]:
        fields["reason"] = "闲置不用，准备转给更需要的人。"

    if not fields["highlights"]:
        bullets = [ln.strip("-• ").strip() for ln in text.split("\n") if ln.strip().startswith(("-", "•"))]
        if bullets:
            fields["highlights"] = "；".join(bullets[:4])

    if not fields["price"]:
        m_price = re.search(r"(?:售[价价]|一口价|价格)\s*[:：]?\s*([¥￥]?\d+(?:\.\d+)?)", text, flags=re.IGNORECASE)
        if m_price:
            fields["price"] = m_price.group(1)

    fields["source_text"] = text
    return fields


def infer_category(fields: Dict[str, str]) -> str:
    if fields.get("category"):
        return fields["category"].strip().lower()

    haystack = (fields.get("product_name", "") + " " + fields.get("source_text", "")).lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(k.lower() in haystack for k in keywords):
            return category
    return "other"


def is_digital_product(fields: Dict[str, str], category: str) -> bool:
    if category == "digital":
        return True
    haystack = f"{fields.get('product_name', '')} {fields.get('source_text', '')}".lower()
    return any(k in haystack for k in DIGITAL_HINTS)


def normalize_condition(raw_condition: str, source_text: str) -> str:
    candidate = (raw_condition or "").strip().lower()
    if candidate in CONDITION_ALIASES:
        return CONDITION_ALIASES[candidate]

    for key, value in CONDITION_ALIASES.items():
        if key.lower() in candidate:
            return value

    text = source_text.lower()
    if "全新" in text or "未拆" in text:
        return "new"
    if "99新" in text or "几乎没用" in text:
        return "like_new"
    if "正常使用" in text or "轻微使用" in text:
        return "good"
    return "used"


def parse_price(raw_price: str) -> Optional[float]:
    if not raw_price:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)", raw_price)
    return float(match.group(1)) if match else None


def build_tags(product_name: str, category: str, style_key: str, is_digital: bool) -> str:
    base = ["#闲鱼", "#个人闲置"]
    category_map = {
        "electronics": "#数码",
        "digital": "#知识付费",
        "fashion": "#穿搭",
        "home": "#家居",
        "beauty": "#美妆",
        "other": "#二手好物",
    }
    base.append(category_map.get(category, "#二手好物"))
    if is_digital:
        base.append("#虚拟商品")

    compact_name = re.sub(r"\s+", "", product_name)
    if compact_name:
        base.append(f"#{compact_name[:12]}")

    style_tag = {
        "normal": "#真实描述",
        "emotional": "#走心出物",
        "urgent": "#急出",
        "professional": "#专业卖家风",
        "concise": "#高效成交",
        "trust": "#诚信交易",
    }.get(style_key)
    if style_tag:
        base.append(style_tag)
    return " ".join(base)


def select_styles(requested_style: str, available_styles: Dict[str, Dict], is_digital: bool) -> List[str]:
    if requested_style != "auto":
        return [requested_style]
    preferred = ["concise", "professional"] if is_digital else ["normal", "trust"]
    selected = [s for s in preferred if s in available_styles]
    if selected:
        return selected
    return [next(iter(available_styles.keys()))] if available_styles else ["normal"]


def _trim_title_noise(title: str) -> str:
    noise_words = ["自用闲置转", "价格友好", "真实描述可验货", "细节透明，放心拍", "忍痛转给有缘人", "着急转，爽快优先"]
    out = text_formatter.normalize_whitespace(title)
    if len(out) <= 30:
        return out
    for word in noise_words:
        out = out.replace(word, "").strip()
        out = re.sub(r"\s{2,}", " ", out)
        if len(out) <= 30:
            return out
    return out[:30]


def render_variation(
    style_key: str,
    style_cfg: Dict,
    fields: Dict[str, str],
    references: List[Dict],
    emojis: Dict[str, str],
    category: str,
    condition_key: str,
    is_digital: bool,
) -> Dict[str, str]:
    product_name = fields["product_name"]
    condition_zh = CONDITION_ZH.get(condition_key, "二手")

    ref_price_line = ""
    if references:
        prices = []
        for ref in references:
            if ref.get("price_text"):
                prices.append(str(ref.get("price_text")))
            elif ref.get("price") is not None:
                prices.append(f"¥{ref.get('price')}")
        if prices:
            ref_price_line = f"同类参考价：{' / '.join(prices[:3])}"

    defects = fields.get("defects") or "正常使用痕迹，细节如图。"
    accessories = fields.get("accessories") or "配件按实拍为准。"
    delivery = fields.get("delivery") or "支持同城面交或快递。"
    shipping = fields.get("shipping") or "邮费可协商。"
    warranty = fields.get("warranty") or "签收后尽快验货。"
    location = fields.get("location") or "同城优先"
    digital_notice = "虚拟商品具可复制性，发货后不退不换。"

    values = {
        "product_name": product_name,
        "condition": condition_zh,
        "price": fields.get("price") or "私聊",
        "original_price": fields.get("original_price") or "-",
        "reason": fields.get("reason") or "闲置转出",
        "highlights": fields.get("highlights") or "功能正常，实拍可验",
        "defects": defects,
        "accessories": accessories,
        "delivery": delivery,
        "shipping": shipping,
        "warranty": warranty,
        "location": location,
        "notes": fields.get("notes") or "",
        "ref_price_line": ref_price_line,
        "digital_notice": digital_notice if is_digital else "",
        "tags": build_tags(product_name, category, style_key, is_digital),
    }

    title_candidates = style_cfg.get("title_templates") or ["{product_name} 闲置转"]
    title = text_formatter.safe_format(random.choice(title_candidates), values)
    title = text_formatter.format_with_emojis(title, emojis)
    title = _trim_title_noise(title)

    body_template = style_cfg.get("body_template") or "{product_name}\n{highlights}\n{tags}"
    body = text_formatter.safe_format(body_template, {**values, "title": title})
    body = text_formatter.format_with_emojis(body, emojis)
    body = text_formatter.compact_lines(text_formatter.normalize_whitespace(body))

    if is_digital and digital_notice not in body:
        body = f"{body}\n{digital_notice}"

    return {"style": style_key, "title": title, "body": body}


def merge_references(local_refs: List[Dict], live_refs: List[Dict], max_refs: int) -> List[Dict]:
    merged: List[Dict] = []
    seen_titles = set()

    for item in (local_refs or []) + (live_refs or []):
        title = (item or {}).get("title", "").strip()
        if not title or title in seen_titles:
            continue
        seen_titles.add(title)
        merged.append(item)
        if len(merged) >= max(1, max_refs):
            break
    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate high-quality Xianyu post content")
    parser.add_argument("input_data", help="Listing text or path to a text file")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--style", default="auto", help="Style key from assets/styles.json or auto")
    parser.add_argument("--max-references", type=int, default=3)
    parser.add_argument("--max-variants", type=int, default=2)
    parser.add_argument("--live-search", action="store_true", help="Enable live search from Xianyu web")
    parser.add_argument("--live-limit", type=int, default=3, help="Max live posts to include")
    parser.add_argument("--live-timeout-sec", type=int, default=10, help="HTTP timeout for live search")
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets_dir = os.path.join(base_dir, "assets")

    styles = text_formatter.load_styles(assets_dir)
    emojis = text_formatter.load_emojis(assets_dir)

    raw = args.input_data
    if os.path.isfile(raw):
        with open(raw, "r", encoding="utf-8") as f:
            raw = f.read()

    fields = parse_input(raw)
    category = infer_category(fields)
    condition_key = normalize_condition(fields.get("condition", ""), fields.get("source_text", ""))
    is_digital = is_digital_product(fields, category)

    keywords = [fields.get("product_name", "")]
    if fields.get("highlights"):
        keywords.extend(fields["highlights"].split("；")[:2])

    local_refs = search_references.search_references(
        keywords=keywords,
        category=category,
        condition=condition_key,
        price=parse_price(fields.get("price", "")),
        limit=max(1, args.max_references),
    )

    live_search_info = {"keywords": [], "search_urls": [], "posts": [], "error": ""}
    if args.live_search:
        live_search_info = xianyu_live_search.search_recent_posts(
            raw_text=fields.get("source_text", ""),
            product_name=fields.get("product_name", ""),
            limit=max(1, args.live_limit),
            timeout_sec=max(3, args.live_timeout_sec),
        )

    merged_limit = max(1, args.max_references) + (max(1, args.live_limit) if args.live_search else 0)
    refs = merge_references(
        local_refs=local_refs,
        live_refs=live_search_info.get("posts", []),
        max_refs=merged_limit,
    )

    visual_style = "real-shot"
    if category == "electronics":
        visual_style = "tech"
    elif category in ("home", "fashion", "beauty"):
        visual_style = "lifestyle"
    elif is_digital:
        visual_style = "clean"

    image_prompt = image_prompt_gen.generate_image_prompt(
        product_name=fields["product_name"],
        category=category,
        condition=condition_key,
        style=visual_style,
        highlights=(fields.get("highlights") or "").split("；"),
    )

    chosen_styles = select_styles(args.style, styles, is_digital)[: max(1, args.max_variants)]
    variations = []
    for style_key in chosen_styles:
        style_cfg = text_formatter.get_style_config(style_key, styles)
        variations.append(
            render_variation(
                style_key=style_key,
                style_cfg=style_cfg,
                fields=fields,
                references=refs,
                emojis=emojis,
                category=category,
                condition_key=condition_key,
                is_digital=is_digital,
            )
        )

    result = {
        "product_name": fields.get("product_name", ""),
        "category": category,
        "condition": condition_key,
        "condition_zh": CONDITION_ZH.get(condition_key, "二手"),
        "price": fields.get("price", ""),
        "references": refs,
        "local_references": local_refs,
        "live_references": live_search_info.get("posts", []),
        "live_search": {
            "enabled": bool(args.live_search),
            "keywords": live_search_info.get("keywords", []),
            "search_urls": live_search_info.get("search_urls", []),
            "error": live_search_info.get("error", ""),
        },
        "image_prompt": image_prompt,
        "suggested_visual_style": visual_style,
        "variations": variations,
        "content": variations[0] if variations else {"title": "", "body": ""},
        "quality_checks": {
            "contains_price": bool(fields.get("price")),
            "contains_reason": bool(fields.get("reason")),
            "contains_condition": bool(fields.get("condition") or condition_key),
            "digital_notice_included": (not is_digital) or all("发货后不退不换" in v.get("body", "") for v in variations),
        },
    }

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    print(f"[商品] {result['product_name']}  [分类] {category}  [成色] {result['condition_zh']}")
    if refs:
        print("\n[同类参考]")
        for idx, ref in enumerate(refs, 1):
            price_label = ref.get("price_text") or (f"¥{ref.get('price')}" if ref.get("price") else "N/A")
            print(f"{idx}. {ref.get('title')} | 价格: {price_label} | 想要: {ref.get('want_count')}")

    if args.live_search:
        print("\n[实时搜索]")
        print(f"关键词: {', '.join(result['live_search'].get('keywords', [])) or 'N/A'}")
        if result["live_search"].get("error"):
            print(f"错误: {result['live_search']['error']}")
        for u in result["live_search"].get("search_urls", []):
            print(f"- {u}")

    print("\n[封面图 Prompt]")
    print(image_prompt)

    for var in variations:
        print(f"\n[文案方案 - {var['style']}]\n标题: {var['title']}\n\n{var['body']}")


if __name__ == "__main__":
    main()
