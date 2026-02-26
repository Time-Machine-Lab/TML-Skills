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
    parser.add_argument("--model", default="doubao-seedream-3-0-t2i-250415", help="模型名称")
    parser.add_argument("--response-format", default="url", choices=["url", "b64_json"], help="返回格式")
    parser.add_argument("--size", default="1024x1024", help="图像尺寸，如 1024x1024")
    parser.add_argument("--seed", type=int, default=None, help="随机种子")
    parser.add_argument("--guidance-scale", type=float, default=None, help="引导强度")
    parser.add_argument("--watermark", type=parse_bool, default=None, help="是否加水印 true/false")
    parser.add_argument("--timeout", type=int, default=60, help="请求超时时间(秒)")
    parser.add_argument("--download", default="", help="当 response_format=url 时，将第一张图下载到该路径")

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
        first = data[0] if data else {}
        image_url = first.get("url")
        if image_url:
            try:
                download_image(image_url, args.download, timeout=args.timeout)
                print(f"Downloaded image -> {args.download}")
            except Exception as e:
                print(f"Download failed: {e}", file=sys.stderr)
                return 1
        else:
            print("No image URL found in response.data[0].url", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
