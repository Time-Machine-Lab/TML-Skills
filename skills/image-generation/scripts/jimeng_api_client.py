#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

BASE_URL = "https://api.bltcy.top"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_config.json")


import base64
import mimetypes

def encode_image_to_base64(image_path: str) -> str:
    """Encodes a local image file to a Base64 data URI."""
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    
    mime_type, _ = mimetypes.guess_type(image_path)
    if not mime_type:
        mime_type = "image/png"  # Default fallback
        
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
        
    return f"data:{mime_type};base64,{encoded_string}"


def build_payload(args: argparse.Namespace) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "model": args.model,
        "prompt": args.prompt,
        "response_format": args.response_format,
        "size": args.size,
    }

    if args.seed is not None:
        payload["seed"] = args.seed
    if args.guidance_scale is not None:
        payload["guidance_scale"] = args.guidance_scale
    if args.watermark is not None:
        payload["watermark"] = args.watermark

    if args.image:
        processed_images = []
        for img in args.image:
            if img.startswith("http://") or img.startswith("https://") or img.startswith("data:"):
                processed_images.append(img)
            else:
                # Assume local file path
                try:
                    # Check if file exists first
                    if not os.path.exists(img):
                        # If not a file and not a URL, maybe it's a mistake?
                        print(f"Warning: Argument '{img}' is not a valid URL or file path. Treating as URL.", file=sys.stderr)
                        processed_images.append(img)
                        continue

                    print(f"Encoding local image: {img}", file=sys.stderr)
                    base64_img = encode_image_to_base64(img)
                    processed_images.append(base64_img)
                except Exception as e:
                    print(f"Error encoding image {img}: {e}", file=sys.stderr)
                    raise
        payload["image"] = processed_images

    if args.n is not None:
        payload["n"] = args.n

    return payload


def load_api_key(config_path: str = CONFIG_FILE) -> str:
    if not os.path.exists(config_path):
        raise RuntimeError(f"Config file not found: {config_path}")

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON in config file: {config_path}") from e

    api_key = (config.get("api_key") or "").strip()
    if not api_key:
        raise RuntimeError(f"Missing 'api_key' in config file: {config_path}")
    return api_key


def call_jimeng_api(api_key: str, payload: Dict[str, Any], timeout: int = 60) -> Dict[str, Any]:
    url = f"{BASE_URL.rstrip('/')}/v1/images/generations"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e}") from e


def download_image(image_url: str, output_path: str, timeout: int = 60) -> None:
    with urllib.request.urlopen(image_url, timeout=timeout) as resp:
        content = resp.read()
    with open(output_path, "wb") as f:
        f.write(content)


def parse_bool(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    value = value.strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    raise argparse.ArgumentTypeError("watermark must be true/false")


def main() -> int:
    parser = argparse.ArgumentParser(description="即梦(Seedream) API 调用脚本")
    parser.add_argument("--prompt", required=True, help="文生图提示词")
    parser.add_argument("--model", default="doubao-seedream-4-5-251128", help="模型名称")
    parser.add_argument("--response-format", default="url", choices=["url", "b64_json"], help="返回格式")
    parser.add_argument("--size", default="2K", help="图像尺寸，如 2K, 1024x1024")
    parser.add_argument("--seed", type=int, default=None, help="随机种子")
    parser.add_argument("--guidance-scale", type=float, default=None, help="引导强度")
    parser.add_argument("--watermark", type=parse_bool, default=None, help="是否加水印 true/false")
    parser.add_argument("--timeout", type=int, default=60, help="请求超时时间(秒)")
    parser.add_argument("--download", default="", help="当 response_format=url 时，将第一张图下载到该路径 (如果是多张图，会自动加后缀 _0, _1 等)")
    parser.add_argument("--image", nargs='+', help="图生图参考图片的 URL，支持多张。如果是本地文件，请先转换为 URL 或 Base64 (本脚本目前仅支持 URL 输入)")
    parser.add_argument("--n", type=int, default=1, choices=[1, 2, 3, 4], help="生成图片数量 (1-4)")

    args = parser.parse_args()

    try:
        api_key = load_api_key(CONFIG_FILE)
    except Exception as e:
        print(f"Config error: {e}", file=sys.stderr)
        return 2

    payload = build_payload(args)

    try:
        result = call_jimeng_api(api_key, payload, timeout=args.timeout)
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.download and args.response_format == "url":
        data = result.get("data") or []
        
        if not data:
             print("No image data found in response", file=sys.stderr)
             return 1

        # Handle multiple images download
        base_path, ext = os.path.splitext(args.download)
        
        for i, item in enumerate(data):
            image_url = item.get("url")
            if not image_url:
                continue
            
            # If generating only 1 image, use original filename
            # If generating multiple, append index _0, _1, etc.
            if len(data) == 1:
                save_path = args.download
            else:
                save_path = f"{base_path}_{i}{ext}"
                
            try:
                download_image(image_url, save_path, timeout=args.timeout)
                print(f"Downloaded image -> {save_path}")
            except Exception as e:
                print(f"Download failed for {save_path}: {e}", file=sys.stderr)
                # Don't return immediately, try to download others

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
