#!/usr/bin/env python3
import argparse
import json
import os
import sys
import uuid
import mimetypes
import urllib.request
import urllib.error
from typing import Any, Dict, Optional, List

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


class MultiPartForm:
    def __init__(self):
        self.boundary = uuid.uuid4().hex
        self.content_type = f'multipart/form-data; boundary={self.boundary}'
        self.form_fields = []
        self.files = []

    def add_field(self, name, value):
        self.form_fields.append((name, str(value)))

    def add_file(self, fieldname, filename, fileHandle, mimetype=None):
        body = fileHandle.read()
        if mimetype is None:
            mimetype = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        self.files.append((fieldname, filename, mimetype, body))

    def __bytes__(self):
        buffer = bytearray()
        boundary = b'--' + self.boundary.encode('utf-8')
        
        # Add fields
        for name, value in self.form_fields:
            buffer.extend(boundary)
            buffer.extend(b'\r\n')
            buffer.extend(f'Content-Disposition: form-data; name="{name}"'.encode('utf-8'))
            buffer.extend(b'\r\n\r\n')
            buffer.extend(value.encode('utf-8'))
            buffer.extend(b'\r\n')

        # Add files
        for fieldname, filename, mimetype, body in self.files:
            buffer.extend(boundary)
            buffer.extend(b'\r\n')
            # Simple approach: name="{fieldname}"; filename="{filename}"
            header = f'Content-Disposition: form-data; name="{fieldname}"; filename="{filename}"'
            buffer.extend(header.encode('utf-8'))
            buffer.extend(b'\r\n')
            buffer.extend(f'Content-Type: {mimetype}'.encode('utf-8'))
            buffer.extend(b'\r\n\r\n')
            buffer.extend(body)
            buffer.extend(b'\r\n')

        buffer.extend(boundary + b'--\r\n')
        return bytes(buffer)


def call_img2img_api(api_key: str, image_paths: List[str], prompt: str, model: str, aspect_ratio: str = None, image_size: str = None, timeout: int = 120) -> Dict[str, Any]:
    url = f"{BASE_URL.rstrip('/')}/v1/images/edits"
    
    form = MultiPartForm()
    form.add_field('model', model)
    form.add_field('prompt', prompt)
    form.add_field('response_format', 'url')
    
    if aspect_ratio:
        form.add_field('aspect_ratio', aspect_ratio)
    if image_size:
        form.add_field('image_size', image_size)

    # Add files
    # Open all file handles to close them later
    file_handles = []
    try:
        for path in image_paths:
            if not os.path.exists(path):
                raise FileNotFoundError(f"Image file not found: {path}")
            
            f = open(path, 'rb')
            file_handles.append(f)
            filename = os.path.basename(path)
            # The API expects the field name to be 'image' for multiple files as well
            form.add_file('image', filename, f)

        data = bytes(form)
    finally:
        for f in file_handles:
            f.close()
    
    req = urllib.request.Request(url, data=data)
    req.add_header('Authorization', f'Bearer {api_key}')
    req.add_header('Content-Type', form.content_type)
    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

    print(f"Calling API: {url}")
    print(f"Prompt: {prompt}")
    print(f"Images: {image_paths}")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            print(f"DEBUG: Response body: {raw[:500]}")
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
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    with open(output_path, "wb") as f:
        f.write(content)


def main() -> int:
    parser = argparse.ArgumentParser(description="Nano-banana Image-to-Image Client")
    # Change to nargs='+' to accept multiple image paths
    parser.add_argument("--image-path", required=True, nargs='+', help="Path to input image(s). Can provide multiple paths.")
    parser.add_argument("--prompt", required=True, help="Image prompt")
    parser.add_argument("--model", default="nano-banana-2-4k", help="Model name")
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

    try:
        result = call_img2img_api(
            api_key, 
            args.image_path,  # Now a list
            args.prompt, 
            args.model, 
            aspect_ratio=args.aspect_ratio, 
            image_size=args.image_size,
            timeout=args.timeout
        )
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.download:
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
