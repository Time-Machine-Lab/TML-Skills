#!/usr/bin/env python3
"""Check whether a dangerous command has an exact valid approval."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_payload(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "requests": []}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).astimezone(timezone.utc)


def check_approval(payload: dict[str, Any], host_id: str, command: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    for request in payload.get("requests", []):
        if request.get("host_id") != host_id:
            continue
        if request.get("command") != command:
            continue
        if request.get("status") != "approved":
            continue
        if bool(request.get("used")):
            continue

        expires_at = parse_utc(request.get("expires_at"))
        if expires_at and expires_at <= now:
            continue

        return {
            "allowed": True,
            "approval_id": request.get("id"),
            "reason": "exact approved match found",
        }

    return {
        "allowed": False,
        "approval_id": None,
        "reason": "no valid exact approval found",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Check dangerous command approval.")
    parser.add_argument("--approvals", required=True, help="Path to approvals.json")
    parser.add_argument("--host-id", required=True, help="Target host id")
    parser.add_argument("--command", required=True, help="Exact command text")
    args = parser.parse_args()

    payload = load_payload(Path(args.approvals))
    result = check_approval(payload, args.host_id, args.command)
    print(json.dumps(result, ensure_ascii=True))
    return 0 if result["allowed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
