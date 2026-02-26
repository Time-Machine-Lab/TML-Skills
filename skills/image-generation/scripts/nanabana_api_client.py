#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

# Based on user input
BASE_URL = "https://api.bltcy.top"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_config.json")


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


def build_payload(args: argparse.Namespace) -> Dict[str, Any]:
    # Map arguments to API parameters
    payload: Dict[str, Any] = {
        "model": args.model,
        "prompt": args.prompt,
        "response_format": args.response_format,
    }

    # Handle aspect_ratio
    if args.aspect_ratio:
        payload["aspect_ratio"] = args.aspect_ratio
    
    # Handle image_size
    # If user passed --size like "1024x1024", we might want to map it, 
    # but the API specifically asks for 1K, 2K, 4K.
    # We'll use the --image-size argument directly.
    if args.image_size:
        payload["image_size"] = args.image_size

    return payload


def call_nanabana_api(api_key: str, payload: Dict[str, Any], timeout: int = 120) -> Dict[str, Any]:
    url = f"{BASE_URL.rstrip('/')}/v1/images/generations"
    body = json.dumps(payload).encode("utf-8")
    
    # Debug print
    print(f"Calling API: {url}")
    print(f"Payload: {json.dumps(payload, ensure_ascii=False)}")

    req = urllib.request.Request(
        url=url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            print(f"DEBUG: Response body: {raw[:500]}") # Debug print
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e}") from e


def download_image(image_url: str, output_path: str, timeout: int = 60) -> None:
    print(f"Downloading from: {image_url}")
    req = urllib.request.Request(
        image_url, 
        headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content = resp.read()
    with open(output_path, "wb") as f:
        f.write(content)


def main() -> int:
    parser = argparse.ArgumentParser(description="Nano-banana API Client")
    parser.add_argument("--prompt", required=True, help="Image prompt")
    parser.add_argument("--model", default="nano-banana-2-4k", help="Model name")
    parser.add_argument("--response-format", default="url", choices=["url", "b64_json"], help="Response format")
    parser.add_argument("--aspect-ratio", default="1:1", help="Aspect ratio (e.g., 1:1, 16:9)")
    parser.add_argument("--image-size", default="1K", choices=["1K", "2K", "4K"], help="Image size")
    parser.add_argument("--download", default="", help="Path to save the downloaded image")
    parser.add_argument("--timeout", type=int, default=120, help="Timeout in seconds")

    args = parser.parse_args()

    try:
        api_key = load_api_key(CONFIG_FILE)
    except Exception as e:
        print(f"Config error: {e}", file=sys.stderr)
        return 2

    payload = build_payload(args)

    try:
        result = call_nanabana_api(api_key, payload, timeout=args.timeout)
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.download and args.response_format == "url":
        # Check structure of response
        # Typically { "data": [ { "url": "..." } ] }
        data = result.get("data")
        if isinstance(data, list) and len(data) > 0:
            image_url = data[0].get("url")
            if image_url:
                try:
                    download_image(image_url, args.download, timeout=args.timeout)
                    print(f"Downloaded image -> {args.download}")
                except Exception as e:
                    print(f"Download failed: {e}", file=sys.stderr)
                    return 1
            else:
                print("No image URL found in response['data'][0]['url']", file=sys.stderr)
                return 1
        else:
            print("Invalid response format: 'data' list missing or empty", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
