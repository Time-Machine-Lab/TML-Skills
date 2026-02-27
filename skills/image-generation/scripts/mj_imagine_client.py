#!/usr/bin/env python3
import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

DEFAULT_BASE_URL = "https://api.bltcy.top"
DEFAULT_MJ_VERSION = "7"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_config.json")


def load_config(config_path: str = CONFIG_FILE) -> Dict[str, Any]:
    if not os.path.exists(config_path):
        raise RuntimeError(f"Config file not found: {config_path}")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON in config file: {config_path}") from e
    if not isinstance(config, dict):
        raise RuntimeError(f"Config file must be a JSON object: {config_path}")
    return config


def load_api_key(config: Dict[str, Any]) -> str:
    api_key = str(config.get("api_key") or "").strip()
    if not api_key:
        raise RuntimeError(f"Missing 'api_key' in config file: {CONFIG_FILE}")
    return api_key


def resolve_base_url(args: argparse.Namespace, config: Dict[str, Any]) -> str:
    value = args.base_url or config.get("mj_base_url") or config.get("base_url") or DEFAULT_BASE_URL
    value = str(value).strip().rstrip("/")
    if not value:
        raise RuntimeError("Base URL is empty")
    return value


def resolve_route_prefix(args: argparse.Namespace, config: Dict[str, Any]) -> str:
    raw = args.route_prefix
    if raw is None:
        raw = config.get("mj_route_prefix", "fast")
    raw = str(raw).strip()
    if not raw:
        return ""
    return raw.strip("/")


def build_submit_url(base_url: str, route_prefix: str) -> str:
    if route_prefix:
        return f"{base_url}/{route_prefix}/mj/submit/imagine"
    return f"{base_url}/mj/submit/imagine"


def build_fetch_url(base_url: str, route_prefix: str, task_id: str) -> str:
    if route_prefix:
        return f"{base_url}/{route_prefix}/mj/task/{task_id}/fetch"
    return f"{base_url}/mj/task/{task_id}/fetch"


def encode_image_to_data_uri(image_path: str) -> str:
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image file not found: {image_path}")
    mime_type, _ = mimetypes.guess_type(image_path)
    if not mime_type:
        mime_type = "image/png"
    with open(image_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime_type};base64,{encoded}"


def build_base64_array(image_inputs: Optional[List[str]]) -> List[str]:
    if not image_inputs:
        return []
    items: List[str] = []
    for item in image_inputs:
        text = item.strip()
        if not text:
            continue
        if text.startswith("data:image/"):
            items.append(text)
            continue
        if text.startswith("http://") or text.startswith("https://"):
            # The API document focuses on base64Array. Keep URL passthrough
            # for compatibility with providers that accept remote images.
            items.append(text)
            continue
        items.append(encode_image_to_data_uri(text))
    return items


def normalize_prompt(prompt: str, default_version: str = DEFAULT_MJ_VERSION) -> str:
    text = prompt.strip()
    if not text:
        return text
    lower = f" {text.lower()} "
    if " --v " in lower or " --version " in lower:
        return text
    return f"{text} --v {default_version}"


def request_json(method: str, url: str, api_key: str, body_obj: Optional[Dict[str, Any]], timeout: int) -> Dict[str, Any]:
    body = None if body_obj is None else json.dumps(body_obj).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=body,
        method=method,
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


def submit_imagine(api_key: str, submit_url: str, prompt: str, base64_array: List[str], notify_hook: str, timeout: int) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "prompt": prompt,
        "base64Array": base64_array,
    }
    if notify_hook:
        payload["notifyHook"] = notify_hook
    return request_json("POST", submit_url, api_key, payload, timeout)


def poll_task(
    api_key: str,
    fetch_url: str,
    timeout: int,
    poll_interval: float,
    poll_timeout: int,
) -> Dict[str, Any]:
    deadline = time.time() + poll_timeout
    last: Dict[str, Any] = {}
    while time.time() < deadline:
        last = request_json("GET", fetch_url, api_key, None, timeout)
        status = str(last.get("status") or "").upper()
        progress = str(last.get("progress") or "")

        if status in {"SUCCESS", "FAILURE", "CANCEL"}:
            return last
        if progress == "100%":
            return last
        time.sleep(max(0.2, poll_interval))
    raise TimeoutError(f"Polling timed out after {poll_timeout}s")


def download_image(url: str, output_path: str, timeout: int) -> None:
    req = urllib.request.Request(url=url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        content = resp.read()
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(content)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Midjourney Imagine client (文生图 + 文图生图 via base64Array)"
    )
    parser.add_argument("--prompt", required=True, help="MJ prompt")
    parser.add_argument(
        "--image-path",
        nargs="*",
        default=[],
        help="Optional reference image paths/URLs/data-URIs for 文图生图",
    )
    parser.add_argument("--base-url", default="", help="Override API base URL")
    parser.add_argument(
        "--route-prefix",
        default=None,
        help="Route prefix before /mj, e.g. fast, mj-turbo, mj-relax; empty for direct /mj",
    )
    parser.add_argument("--notify-hook", default="", help="Optional callback URL (notifyHook)")
    parser.add_argument("--timeout", type=int, default=120, help="Single request timeout in seconds")
    parser.add_argument("--no-poll", action="store_true", help="Only submit task and exit")
    parser.add_argument("--poll-interval", type=float, default=3.0, help="Polling interval in seconds")
    parser.add_argument("--poll-timeout", type=int, default=600, help="Polling timeout in seconds")
    parser.add_argument("--download", default="", help="Download final image when task succeeds")

    args = parser.parse_args()

    try:
        config = load_config(CONFIG_FILE)
        api_key = load_api_key(config)
        base_url = resolve_base_url(args, config)
        route_prefix = resolve_route_prefix(args, config)
    except Exception as e:
        print(f"Config error: {e}", file=sys.stderr)
        return 2

    try:
        base64_array = build_base64_array(args.image_path)
    except Exception as e:
        print(f"Image error: {e}", file=sys.stderr)
        return 2

    submit_url = build_submit_url(base_url, route_prefix)
    final_prompt = normalize_prompt(args.prompt)

    print(f"Submit URL: {submit_url}", file=sys.stderr)
    print(f"Mode: {'文图生图' if base64_array else '文生图'}", file=sys.stderr)
    if final_prompt != args.prompt.strip():
        print(f"Auto append default MJ version: --v {DEFAULT_MJ_VERSION}", file=sys.stderr)

    try:
        submit_result = submit_imagine(
            api_key=api_key,
            submit_url=submit_url,
            prompt=final_prompt,
            base64_array=base64_array,
            notify_hook=args.notify_hook.strip(),
            timeout=args.timeout,
        )
    except Exception as e:
        print(f"Submit failed: {e}", file=sys.stderr)
        return 1

    print(json.dumps(submit_result, ensure_ascii=False, indent=2))

    if args.no_poll:
        return 0

    task_id = str(submit_result.get("result") or "").strip()
    if not task_id:
        print("No task id found in submit result.result", file=sys.stderr)
        return 1

    fetch_url = build_fetch_url(base_url, route_prefix, task_id)
    print(f"Polling task: {task_id}", file=sys.stderr)
    try:
        task_result = poll_task(
            api_key=api_key,
            fetch_url=fetch_url,
            timeout=args.timeout,
            poll_interval=args.poll_interval,
            poll_timeout=args.poll_timeout,
        )
    except Exception as e:
        print(f"Polling failed: {e}", file=sys.stderr)
        return 1

    print(json.dumps(task_result, ensure_ascii=False, indent=2))

    if args.download:
        image_url = str(task_result.get("imageUrl") or "").strip()
        if not image_url:
            print("Task finished but imageUrl is empty", file=sys.stderr)
            return 1
        try:
            download_image(image_url, args.download, timeout=args.timeout)
            print(f"Downloaded image -> {args.download}", file=sys.stderr)
        except Exception as e:
            print(f"Download failed: {e}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
