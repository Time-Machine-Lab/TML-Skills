import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import image_prompt_gen
import text_formatter


def read_input_texts(input_dir: Path) -> str:
    texts: List[str] = []
    preferred = ["context.txt", "product_brief.md", "similar_posts.txt"]

    for name in preferred:
        p = input_dir / name
        if p.exists() and p.is_file():
            texts.append(f"\n\n## {name}\n" + p.read_text(encoding="utf-8", errors="ignore"))

    for p in sorted(input_dir.glob("*")):
        if p.name in preferred or not p.is_file():
            continue
        if p.suffix.lower() not in {".txt", ".md", ".json"}:
            continue
        texts.append(f"\n\n## {p.name}\n" + p.read_text(encoding="utf-8", errors="ignore"))

    merged = "\n".join(texts).strip()
    if not merged:
        raise ValueError(f"No usable input files found in {input_dir}")
    return merged


def run_generate_post(raw_text_path: Path, style: str, max_variants: int, live_limit: int, timeout_sec: int) -> Dict:
    base = Path(__file__).resolve().parent
    script = base / "generate_post.py"
    cmd = [
        sys.executable,
        str(script),
        str(raw_text_path),
        "--json",
        "--style",
        style,
        "--max-variants",
        str(max_variants),
        "--live-search",
        "--live-limit",
        str(live_limit),
        "--live-timeout-sec",
        str(timeout_sec),
    ]
    output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, encoding="utf-8")
    return json.loads(output)


def score_variant(v: Dict) -> int:
    title = v.get("title", "")
    body = v.get("body", "")
    score = 0
    if title and len(title) <= 30:
        score += 20
    if "商品" in body:
        score += 12
    if "成色" in body:
        score += 12
    if "价格" in body or "售价" in body:
        score += 12
    if "瑕疵" in body:
        score += 10
    if "发货" in body or "交易" in body:
        score += 10
    if "#" in body:
        score += 8
    if "[" in body and "]" in body:
        score += 8
    if len(body) >= 120:
        score += 8
    return score


def build_cover_prompts(result: Dict) -> List[Dict[str, str]]:
    name = result.get("product_name") or "闲置商品"
    category = result.get("category") or "other"
    condition = result.get("condition") or "used"
    refs = result.get("references", [])

    top_prices = []
    for r in refs[:3]:
        p = r.get("price_text") or (f"¥{r.get('price')}" if r.get("price") is not None else "")
        if p:
            top_prices.append(p)
    ref_line = " / ".join(top_prices) if top_prices else "市场同类价"

    styles = [
        ("clean", "极简可信封面"),
        ("real-shot", "真实转手封面"),
        ("tech", "参数导向封面"),
    ]

    prompts = []
    for style, title in styles:
        base_prompt = image_prompt_gen.generate_image_prompt(
            product_name=name,
            category=category,
            condition=condition,
            style=style,
            highlights=[],
        )
        prompts.append(
            {
                "name": title,
                "cover_copy": text_formatter.sanitize_to_xianyu_emoji(f"[{name}] [真实描述] [可验细节]"),
                "prompt": f"{base_prompt} Overlay text guidance: keep short Chinese labels only, emphasize trust and clarity. Reference price anchor: {ref_line}.",
            }
        )
    return prompts


def write_outputs(workspace: Path, result: Dict, cover_prompts: List[Dict[str, str]]) -> None:
    output_dir = workspace / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    variants = result.get("variations", [])
    for v in variants:
        v["title"] = text_formatter.sanitize_to_xianyu_emoji(v.get("title", ""))
        v["body"] = text_formatter.sanitize_to_xianyu_emoji(v.get("body", ""))

    best = max(variants, key=score_variant) if variants else {"title": "", "body": ""}

    references = result.get("references", [])
    market_lines = ["# 竞品与参考洞察", ""]
    if references:
        for i, r in enumerate(references[:8], start=1):
            price = r.get("price_text") or (f"¥{r.get('price')}" if r.get("price") is not None else "N/A")
            market_lines.append(f"{i}. {r.get('title', '')} | 价格: {price} | 想要: {r.get('want_count', 0)}")
    else:
        market_lines.append("- 未抓到有效竞品，建议手动补充 input/similar_posts.txt")

    market_lines.extend([
        "",
        "## 可借鉴方向",
        "- 标题先给核心品类+状态+价格锚点，避免抽象表达。",
        "- 正文先讲真实信息，再讲交易方式与风险边界。",
        "- 亮点和瑕疵并列写，提升信任感。",
    ])

    cover_lines = ["# 封面提示词方案", ""]
    for i, c in enumerate(cover_prompts, start=1):
        cover_lines.extend([
            f"## 方案 {i}: {c['name']}",
            f"- 建议封面短文案: {c['cover_copy']}",
            "- 生成提示词:",
            f"```text\n{c['prompt']}\n```",
            "",
        ])

    variant_lines = ["# 帖子文案候选", ""]
    for i, v in enumerate(variants, start=1):
        variant_lines.extend([
            f"## 方案 {i} ({v.get('style', 'unknown')})",
            f"- 标题: {v.get('title', '')}",
            "```text",
            v.get("body", ""),
            "```",
            "",
        ])

    best_lines = [
        "# 推荐发布稿",
        "",
        f"- 标题: {best.get('title', '')}",
        "```text",
        best.get("body", ""),
        "```",
    ]

    checklist_lines = [
        "# 发布前检查清单",
        "",
        "- 标题长度 <= 30 字",
        "- 文案包含：商品信息、价格、成色、瑕疵、交易方式",
        "- 已替换为闲鱼可识别表情（[] 格式），无 Unicode emoji",
        "- 虚拟商品已声明：发货后不退不换",
        "- 价格策略明确：是否可小刀/是否包邮",
        "- 封面图无夸大承诺、无违禁词",
    ]

    (output_dir / "market_insights.md").write_text("\n".join(market_lines), encoding="utf-8")
    (output_dir / "cover_prompts.md").write_text("\n".join(cover_lines), encoding="utf-8")
    (output_dir / "post_variants.md").write_text("\n".join(variant_lines), encoding="utf-8")
    (output_dir / "post_best.md").write_text("\n".join(best_lines), encoding="utf-8")
    (output_dir / "publish_checklist.md").write_text("\n".join(checklist_lines), encoding="utf-8")

    result["best_variant"] = best
    result["cover_prompt_pack"] = cover_prompts
    (output_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Xianyu post generation pipeline in workspace mode")
    parser.add_argument("workspace", help="Workspace root, must contain input/ and output/")
    parser.add_argument("--style", default="auto")
    parser.add_argument("--max-variants", type=int, default=3)
    parser.add_argument("--live-limit", type=int, default=5)
    parser.add_argument("--live-timeout-sec", type=int, default=10)
    args = parser.parse_args()

    workspace = Path(os.path.abspath(args.workspace))
    input_dir = workspace / "input"
    output_dir = workspace / "output"

    if not input_dir.exists():
        raise FileNotFoundError(f"Missing input directory: {input_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    merged_text = read_input_texts(input_dir)
    merged_path = output_dir / "_merged_input.txt"
    merged_path.write_text(merged_text, encoding="utf-8")

    result = run_generate_post(
        raw_text_path=merged_path,
        style=args.style,
        max_variants=max(1, args.max_variants),
        live_limit=max(1, args.live_limit),
        timeout_sec=max(3, args.live_timeout_sec),
    )

    cover_prompts = build_cover_prompts(result)
    write_outputs(workspace, result, cover_prompts)

    print(f"Workspace processed: {workspace}")
    print(f"Output files written to: {output_dir}")


if __name__ == "__main__":
    main()
