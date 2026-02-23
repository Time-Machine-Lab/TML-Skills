import html
import json
import re
import urllib.parse
import urllib.request
from typing import Dict, List


STOPWORDS = {
    "的",
    "了",
    "和",
    "及",
    "与",
    "或",
    "可",
    "可以",
    "支持",
    "一个",
    "这个",
    "那个",
    "转手",
    "闲置",
    "商品",
    "出售",
    "自用",
    "全新",
    "95新",
    "99新",
}


def extract_keywords(raw_text: str, product_name: str, max_keywords: int = 3) -> List[str]:
    base = (product_name or "").strip()
    text = f"{base} {raw_text or ''}".strip()
    if not text:
        return []

    tokens = re.findall(r"[\u4e00-\u9fffA-Za-z0-9]{2,24}", text)
    freq: Dict[str, int] = {}
    for token in tokens:
        t = token.lower()
        if t in STOPWORDS or t.isdigit():
            continue
        freq[t] = freq.get(t, 0) + 1

    ranked = sorted(freq.items(), key=lambda x: (-x[1], -len(x[0])))
    keywords: List[str] = []
    if base:
        keywords.append(base)
    for token, _ in ranked:
        if token not in keywords:
            keywords.append(token)
        if len(keywords) >= max_keywords:
            break
    return keywords[:max_keywords]


def _build_search_url(keyword: str) -> str:
    q = urllib.parse.quote(keyword)
    return f"https://www.goofish.com/search?q={q}"


def _http_get(url: str, timeout_sec: int = 10) -> str:
    req = urllib.request.Request(
        url=url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def _clean_text(s: str) -> str:
    out = html.unescape(re.sub(r"\s+", " ", s or "")).strip()
    return out


def _normalize_item_url(url_or_path: str) -> str:
    raw = (url_or_path or "").strip().replace("&amp;", "&")
    if not raw:
        return ""
    if raw.startswith("https://www.goofish.com/item"):
        return raw
    if raw.startswith("/item"):
        return "https://www.goofish.com" + raw
    return ""


def _extract_item_urls(search_page: str) -> List[str]:
    urls: List[str] = []
    seen = set()

    for m in re.finditer(r"https://www\.goofish\.com/item\?[^\"' <]+", search_page):
        u = _normalize_item_url(m.group(0))
        if u and u not in seen:
            seen.add(u)
            urls.append(u)

    for m in re.finditer(r"/item\?[^\"' <]+", search_page):
        u = _normalize_item_url(m.group(0))
        if u and u not in seen:
            seen.add(u)
            urls.append(u)

    # Fallback: build item links from id/categoryId snippets
    ids = re.findall(r'"id"\s*:\s*"(\d{8,})"', search_page) + re.findall(r'"itemId"\s*:\s*"(\d{8,})"', search_page)
    cids = re.findall(r'"categoryId"\s*:\s*"(\d+)"', search_page)
    cid = cids[0] if cids else ""
    for item_id in ids:
        query = f"id={item_id}"
        if cid:
            query += f"&categoryId={cid}"
        u = f"https://www.goofish.com/item?{query}"
        if u not in seen:
            seen.add(u)
            urls.append(u)

    return urls


def _extract_text_field(page: str, field_names: List[str], max_len: int = 180) -> str:
    for name in field_names:
        p = re.compile(rf'"{name}"\s*:\s*"([^"]{{1,{max_len}}})"', flags=re.IGNORECASE)
        m = p.search(page)
        if m:
            return _clean_text(m.group(1))
    return ""


def _extract_price(page: str) -> Dict:
    patterns = [
        r'"price"\s*:\s*"?(?P<price>\d+(?:\.\d+)?)"?',
        r'"sellPrice"\s*:\s*"?(?P<price>\d+(?:\.\d+)?)"?',
        r'"currentPrice"\s*:\s*"?(?P<price>\d+(?:\.\d+)?)"?',
    ]
    for pattern in patterns:
        m = re.search(pattern, page, flags=re.IGNORECASE)
        if not m:
            continue
        raw = m.group("price")
        try:
            return {"price": float(raw), "price_text": f"¥{raw}"}
        except ValueError:
            return {"price": None, "price_text": ""}
    return {"price": None, "price_text": ""}


def _parse_item_detail(item_url: str, timeout_sec: int = 10) -> Dict:
    page = _http_get(item_url, timeout_sec=timeout_sec)

    title = _extract_text_field(page, ["title", "itemTitle", "subject", "name"], max_len=260)
    if not title:
        m = re.search(r"<title>([^<]{3,200})</title>", page, flags=re.IGNORECASE)
        title = _clean_text(m.group(1)) if m else ""

    price_obj = _extract_price(page)
    publish_time = _extract_text_field(page, ["publishTime", "pubTime", "gmtCreate", "createTime"], max_len=80)
    desc = _extract_text_field(page, ["description", "desc", "content"], max_len=320)
    want_raw = _extract_text_field(page, ["wantCount", "wantNum", "wantedCount"], max_len=20)
    want_count = int(re.sub(r"[^\d]", "", want_raw) or "0")

    return {
        "title": title,
        "product_name": title[:24] if title else "",
        "price": price_obj.get("price"),
        "price_text": price_obj.get("price_text", ""),
        "want_count": want_count,
        "category": "live_search",
        "condition": "used",
        "selling_points": [desc] if desc else [],
        "publish_time": publish_time,
        "source": "goofish_live",
        "item_url": item_url,
    }


def _parse_search_inline(search_page: str) -> List[Dict]:
    rows: List[Dict] = []
    seen = set()

    pattern = re.compile(
        r'"title"\s*:\s*"(?P<title>[^"]{3,240})".{0,260}?'
        r'"(?:price|sellPrice|currentPrice)"\s*:\s*"?(?P<price>\d+(?:\.\d+)?)"?',
        re.IGNORECASE | re.DOTALL,
    )
    for m in pattern.finditer(search_page):
        title = _clean_text(m.group("title"))
        if not title or title in seen:
            continue
        seen.add(title)
        raw_price = m.group("price")
        price = None
        try:
            price = float(raw_price)
        except ValueError:
            price = None
        rows.append(
            {
                "title": title,
                "product_name": title[:24],
                "price": price,
                "price_text": f"¥{raw_price}" if raw_price else "",
                "want_count": 0,
                "category": "live_search",
                "condition": "used",
                "selling_points": [],
                "publish_time": "",
                "source": "goofish_search_inline",
                "item_url": "",
            }
        )
        if len(rows) >= 20:
            break
    return rows


def search_recent_posts(raw_text: str, product_name: str, limit: int = 5, timeout_sec: int = 10) -> Dict:
    keywords = extract_keywords(raw_text=raw_text, product_name=product_name, max_keywords=3)
    if not keywords:
        return {"keywords": [], "search_urls": [], "posts": [], "error": "no_keywords"}

    posts: List[Dict] = []
    search_urls: List[str] = []
    errors: List[str] = []
    seen_titles = set()

    for kw in keywords:
        search_url = _build_search_url(kw)
        search_urls.append(search_url)
        try:
            page = _http_get(search_url, timeout_sec=timeout_sec)
            item_urls = _extract_item_urls(page)

            # Prefer item detail pages for better quality
            for item_url in item_urls[: max(3, limit * 3)]:
                try:
                    row = _parse_item_detail(item_url, timeout_sec=timeout_sec)
                except Exception:
                    continue
                title = row.get("title", "").strip()
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)
                posts.append(row)
                if len(posts) >= max(1, limit):
                    break

            # Fallback to inline search parsing
            if len(posts) < max(1, limit):
                for row in _parse_search_inline(page):
                    title = row.get("title", "").strip()
                    if not title or title in seen_titles:
                        continue
                    seen_titles.add(title)
                    posts.append(row)
                    if len(posts) >= max(1, limit):
                        break

            if len(posts) >= max(1, limit):
                break
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{kw}: {exc}")

    return {
        "keywords": keywords,
        "search_urls": search_urls,
        "posts": posts[: max(1, limit)],
        "error": "; ".join(errors) if errors and not posts else "",
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Live-search recent Goofish posts by inferred keywords")
    parser.add_argument("input_text")
    parser.add_argument("--product-name", default="")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--timeout-sec", type=int, default=10)
    args = parser.parse_args()

    result = search_recent_posts(
        raw_text=args.input_text,
        product_name=args.product_name,
        limit=args.limit,
        timeout_sec=args.timeout_sec,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
