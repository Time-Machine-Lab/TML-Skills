import os
import re
from typing import Dict, List, Optional


REF_FILE_CATEGORY = {
    "reference_major_ai_and_automation.md": "ai_automation",
    "reference_major_programming_and_development.md": "programming",
    "reference_major_deployment_and_ops.md": "deployment_ops",
    "reference_major_account_and_misc.md": "account_misc",
}

CATEGORY_ALIASES = {
    "electronics": "programming",
    "digital": "ai_automation",
    "fashion": "account_misc",
    "home": "account_misc",
    "beauty": "account_misc",
    "other": "account_misc",
    "ai_automation": "ai_automation",
    "programming": "programming",
    "deployment_ops": "deployment_ops",
    "account_misc": "account_misc",
}


def _skill_base_dir() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _normalize_price(raw: str) -> Optional[float]:
    if not raw:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", raw)
    if not m:
        return None
    return float(m.group(1))


def _load_reference_rows() -> List[Dict]:
    ref_dir = os.path.join(_skill_base_dir(), "references")
    if not os.path.isdir(ref_dir):
        return []

    rows: List[Dict] = []
    for fname, ref_category in REF_FILE_CATEGORY.items():
        path = os.path.join(ref_dir, fname)
        if not os.path.exists(path):
            continue

        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        in_table = False
        for line in lines:
            s = line.strip()
            if s == "| 标题 | 价格 | 想要人数 | 发布时间 |":
                in_table = True
                continue

            if not in_table:
                continue

            if s.startswith("|---"):
                continue
            if not s.startswith("|"):
                if in_table:
                    break
                continue

            parts = [p.strip() for p in s.strip("|").split("|")]
            if len(parts) < 4:
                continue

            title, raw_price, raw_want, publish_time = parts[0], parts[1], parts[2], parts[3]
            want_count = 0
            try:
                want_count = int(re.sub(r"[^\d]", "", raw_want) or "0")
            except ValueError:
                want_count = 0

            rows.append(
                {
                    "title": title,
                    "product_name": title[:24],
                    "price": _normalize_price(raw_price),
                    "price_text": raw_price,
                    "want_count": want_count,
                    "publish_time": publish_time,
                    "category": ref_category,
                    "condition": "used",
                    "selling_points": [],
                }
            )
    return rows


def _keyword_score(keywords: List[str], item: Dict) -> int:
    haystack = f"{item.get('product_name', '')} {item.get('title', '')}".lower()
    score = 0
    for kw in keywords:
        k = kw.strip().lower()
        if not k:
            continue
        if k in haystack:
            score += 3
    return score


def search_references(
    keywords: Optional[List[str]] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    price: Optional[float] = None,
    limit: int = 5,
) -> List[Dict]:
    del condition
    keywords = [k.strip() for k in (keywords or []) if k and k.strip()]
    target_category = CATEGORY_ALIASES.get((category or "").strip().lower(), None)
    candidates = _load_reference_rows()

    scored: List[Dict] = []
    for item in candidates:
        score = 0

        if target_category and item.get("category") == target_category:
            score += 5

        if price and item.get("price"):
            ref_price = float(item.get("price"))
            if ref_price > 0:
                diff_ratio = abs(ref_price - price) / max(price, 1)
                score += max(0, int(4 - diff_ratio * 5))

        score += _keyword_score(keywords, item)

        if score <= 0:
            continue

        row = dict(item)
        row["_score"] = score
        scored.append(row)

    scored.sort(key=lambda x: (x.get("_score", 0), x.get("want_count", 0)), reverse=True)

    result: List[Dict] = []
    for item in scored[: max(1, limit)]:
        result.append(
            {
                "title": item.get("title", ""),
                "product_name": item.get("product_name", ""),
                "price": item.get("price"),
                "price_text": item.get("price_text", ""),
                "want_count": item.get("want_count", 0),
                "category": item.get("category", "account_misc"),
                "condition": item.get("condition", "used"),
                "selling_points": item.get("selling_points", []),
                "publish_time": item.get("publish_time", ""),
            }
        )
    return result


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Search Xianyu market references from reference markdown")
    parser.add_argument("keyword", nargs="?", default="")
    parser.add_argument("--category", default=None)
    parser.add_argument("--condition", default=None)
    parser.add_argument("--price", type=float, default=None)
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    kws = [k for k in args.keyword.split() if k]
    hits = search_references(
        keywords=kws,
        category=args.category,
        condition=args.condition,
        price=args.price,
        limit=args.limit,
    )
    print(json.dumps(hits, ensure_ascii=False, indent=2))
