#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from flow_generation_runtime import add_account_arguments
from flow_platform_client import (
    DEFAULT_ACCOUNTS_FILE,
    FlowPlatformError,
    GoogleLabsClient,
    load_account_profile,
    merge_set_cookies,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="创建 Google Labs Flow 工作区，并可写回账号 profile 的 project_id。")
    add_account_arguments(parser)
    parser.add_argument("--cookie-file", type=Path, default=None, help="包含完整 Cookie header 的本地文件；优先级高于账号配置。")
    parser.add_argument("--title", default=None, help="Flow 项目标题；默认使用本地时间生成。")
    parser.add_argument("--tool-name", default="PINHOLE", help="Labs toolName，Flow 固定使用 PINHOLE。")
    parser.add_argument("--update-account", action="store_true", help="把创建出的 project_id 写回 accounts.local.json 当前 profile。")
    parser.add_argument("--update-cookie", action="store_true", help="如果响应 Set-Cookie 轮换 session-token，则合并写回 google_ai_cookie。")
    parser.add_argument("--response-file", type=Path, default=None, help="保存完整响应 JSON；不会保存 Cookie。")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        account = load_account_profile(args.accounts_file, args.account_profile)
        cookie = load_cookie(args, account)
        if not cookie:
            raise FlowPlatformError("缺少 Google Labs cookie：请在 google_ai_cookie、GOOGLE_LABS_COOKIE 或 --cookie-file 中提供")

        title = args.title or default_project_title()
        client = GoogleLabsClient(cookie)
        response, set_cookies = client.create_project(title, args.tool_name)
        project = extract_project(response)
        merged_cookie = merge_set_cookies(cookie, set_cookies) if set_cookies else cookie

        if args.update_account:
            update_account_project(
                args.accounts_file,
                args.account_profile,
                project["project_id"],
                project["project_title"],
                merged_cookie if args.update_cookie else None,
            )
        if args.response_file:
            args.response_file.parent.mkdir(parents=True, exist_ok=True)
            args.response_file.write_text(json.dumps(response, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        print("project_created=true")
        print(f"project_id={project['project_id']}")
        print(f"project_title={project['project_title']}")
        print(f"status={project['status']}")
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


def default_project_title() -> str:
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    return f"{now.month}月{now.day:02d}日 {now.hour:02d}:{now.minute:02d}"


def extract_project(response: Dict[str, Any]) -> Dict[str, Any]:
    root = (((response.get("result") or {}).get("data") or {}).get("json") or {})
    status = root.get("status")
    result = root.get("result") or {}
    project_id = result.get("projectId")
    project_info = result.get("projectInfo") or {}
    project_title = project_info.get("projectTitle")
    if status != 200 or not project_id:
        raise FlowPlatformError(f"Labs createProject 响应缺少有效 projectId，status={status}")
    return {
        "project_id": project_id,
        "project_title": project_title or "",
        "status": status,
    }


def update_account_project(
    accounts_file: Optional[str],
    profile_name: Optional[str],
    project_id: str,
    project_title: str,
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
    profile["project_id"] = project_id
    profile["project_title"] = project_title
    if cookie:
        profile["google_ai_cookie"] = cookie
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
