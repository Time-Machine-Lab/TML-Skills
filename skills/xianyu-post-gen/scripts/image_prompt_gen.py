from typing import Iterable, Optional


def generate_image_prompt(
    product_name: str,
    category: str = "other",
    condition: str = "used",
    style: str = "real-shot",
    highlights: Optional[Iterable[str]] = None,
) -> str:
    highlight_text = ", ".join([h for h in (highlights or []) if h][:3])

    style_map = {
        "real-shot": "natural window light, handheld phone camera feel, clean background, realistic second-hand listing style",
        "clean": "bright clean tabletop, soft diffused light, high clarity product focus",
        "tech": "minimal dark backdrop, rim light, product detail close-up",
        "lifestyle": "home-use scenario, warm tone, natural props",
    }

    category_hint = {
        "electronics": "show ports/buttons and screen status clearly",
        "digital": "use screenshot-style composition with simple visual blocks",
        "fashion": "fabric texture and stitching in close-up",
        "home": "real room context and size scale",
        "beauty": "packaging integrity and expiry-related labels visible",
        "other": "core product visible from front + angle",
    }.get(category, "core product visible from front + angle")

    condition_hint = {
        "new": "new condition, package complete",
        "like_new": "almost new condition, tiny traces only",
        "good": "good used condition, normal traces",
        "fair": "visible traces but fully functional",
        "used": "used condition, honest display of details",
    }.get(condition, "used condition, honest display of details")

    style_desc = style_map.get(style, style_map["real-shot"])

    prompt = (
        f"Xianyu cover photo for {product_name}. "
        f"{condition_hint}. "
        f"{style_desc}. "
        f"{category_hint}. "
        "Include one overall shot and one detail shot in composition guidance. "
        "No watermark, no excessive text, realistic color, clear product edges."
    )

    if highlight_text:
        prompt += f" Highlight key points: {highlight_text}."

    return prompt


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate image prompt for Xianyu listing")
    parser.add_argument("product_name")
    parser.add_argument("--category", default="other")
    parser.add_argument("--condition", default="used")
    parser.add_argument("--style", default="real-shot")
    parser.add_argument("--highlights", default="")
    args = parser.parse_args()

    highlights = [x.strip() for x in args.highlights.split(",") if x.strip()]
    print(
        generate_image_prompt(
            product_name=args.product_name,
            category=args.category,
            condition=args.condition,
            style=args.style,
            highlights=highlights,
        )
    )
