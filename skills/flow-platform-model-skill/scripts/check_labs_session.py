#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any, Dict, Optional

from flow_generation_runtime import add_account_arguments
from flow_platform_client import DEFAULT_ACCOUNTS_FILE, FlowPlatformError, load_account_profile


LABS_SESSION_URL = "https://labs.google/fx/api/auth/session"
DEFAULT_LABS_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查 Google Labs session，并提取 aisandbox access token。")
    add_account_arguments(parser)
    parser.add_argument("--cookie-file", type=Path, default=None, help="包含完整 Cookie header 的本地文件；优先级高于账号配置。")
    parser.add_argument("--update-account", action="store_true", help="把 access token/expires 写回 accounts.local.json 当前 profile。")
    parser.add_argument("--update-cookie", action="store_true", help="如果响应 Set-Cookie 轮换 session-token，则合并写回 google_ai_cookie。")
    parser.add_argument("--show-token", action="store_true", help="仅限本机临时排查；默认不打印完整 access token。")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        account = load_account_profile(args.accounts_file, args.account_profile)
        cookie = load_cookie(args, account)
        if not cookie:
            raise FlowPlatformError("缺少 Google Labs cookie：请在 google_ai_cookie、GOOGLE_LABS_COOKIE 或 --cookie-file 中提供")

        session, set_cookies = fetch_labs_session(cookie, account.get("project_id"))
        access_token = session.get("access_token")
        expires = session.get("expires")
        user = session.get("user") or {}
        if not access_token or not expires:
            raise FlowPlatformError("Labs session 响应缺少 access_token 或 expires")

        merged_cookie = merge_set_cookies(cookie, set_cookies) if set_cookies else cookie
        if args.update_account:
            update_account_file(
                args.accounts_file,
                args.account_profile,
                access_token,
                expires,
                user,
                merged_cookie if args.update_cookie else None,
            )

        expires_dt = parse_google_time(expires)
        seconds_left = int((expires_dt - datetime.now(timezone.utc)).total_seconds())
        print("session_ok=true")
        print(f"user_email={user.get('email') or ''}")
        print(f"expires={expires}")
        print(f"seconds_left={seconds_left}")
        print(f"access_token_present={bool(access_token)}")
        print(f"access_token={access_token if args.show_token else mask_token(access_token)}")
        print(f"set_cookie_present={bool(set_cookies)}")
        print(f"account_updated={bool(args.update_account)}")
        print(f"cookie_updated={bool(args.update_account and args.update_cookie and set_cookies)}")
        return 0
    except FlowPlatformError as exc:
        print(f"error: {exc}", file=sys.stderr)
        if exc.body:
            print(exc.body, file=sys.stderr)
        return 1


def load_cookie(args: argparse.Namespace, account: Dict[str, Any]) -> Optional[str]:
    if args.cookie_file:
        return args.cookie_file.read_text(encoding="utf-8").strip()
    return os.environ.get("GOOGLE_LABS_COOKIE") or account.get("google_ai_cookie") or account.get("cookie")


def fetch_labs_session(cookie: str, project_id: Optional[str]) -> tuple[Dict[str, Any], list[str]]:
    request = urllib.request.Request(LABS_SESSION_URL, method="GET")
    for key, value in {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cookie": cookie,
        "User-Agent": DEFAULT_LABS_USER_AGENT,
        "Referer": flow_referer(project_id),
    }.items():
        if value:
            request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            if response.status != 200:
                raise FlowPlatformError(f"HTTP {response.status} from {LABS_SESSION_URL}", response.status, raw)
            return json.loads(raw) if raw else {}, response.headers.get_all("Set-Cookie") or []
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise FlowPlatformError(f"HTTP {exc.code} from {LABS_SESSION_URL}", exc.code, raw) from exc
    except urllib.error.URLError as exc:
        raise FlowPlatformError(f"request failed for {LABS_SESSION_URL}: {exc.reason}") from exc


def flow_referer(project_id: Optional[str]) -> str:
    if project_id:
        return f"https://labs.google/fx/tools/flow/project/{project_id}"
    return "https://labs.google/fx/tools/flow"


def merge_set_cookies(cookie_header: str, set_cookies: list[str]) -> str:
    current = parse_cookie_header(cookie_header)
    for raw in set_cookies:
        parsed = SimpleCookie()
        parsed.load(raw)
        for key, morsel in parsed.items():
            current[key] = morsel.value
    return "; ".join(f"{key}={value}" for key, value in current.items())


def parse_cookie_header(cookie_header: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for part in cookie_header.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        if key:
            result[key] = value.strip()
    return result


def update_account_file(
    accounts_file: Optional[str],
    profile_name: Optional[str],
    access_token: str,
    expires: str,
    user: Dict[str, Any],
    cookie: Optional[str],
) -> None:
    path = Path(accounts_file).expanduser() if accounts_file else DEFAULT_ACCOUNTS_FILE
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"profiles": {}}
    profiles = data.setdefault("profiles", {})
    selected = profile_name or data.get("default_profile")
    if not selected:
        raise FlowPlatformError("更新账号文件时必须指定 --account-profile 或 default_profile")
    data["default_profile"] = selected
    profile = profiles.setdefault(selected, {})
    profile["google_ai_token"] = "Bearer " + access_token
    profile["token_expires"] = expires
    if user:
        profile["user"] = {
            "name": user.get("name"),
            "email": user.get("email"),
            "image": user.get("image"),
        }
    if cookie:
        profile["google_ai_cookie"] = cookie
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_google_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def mask_token(token: str) -> str:
    if len(token) <= 24:
        return "<too-short>"
    return token[:12] + "..." + token[-8:]


if __name__ == "__main__":
    raise SystemExit(main())

