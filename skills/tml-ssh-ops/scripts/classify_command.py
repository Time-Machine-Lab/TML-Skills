#!/usr/bin/env python3
"""Classify a shell command as safe, sensitive, or dangerous."""

from __future__ import annotations

import argparse
import json
import re


DANGEROUS_PATTERNS: list[tuple[str, str]] = [
    (r"(^|\s)rm(\s|$)", "matched rm"),
    (r"(^|\s)rmdir(\s|$)", "matched rmdir"),
    (r"find\s+.+-delete(\s|$)", "matched find -delete"),
    (r"(^|\s)truncate(\s|$)", "matched truncate"),
    (r"(^|\s)dd(\s|$)", "matched dd"),
    (r"(^|\s)mkfs(\s|$)", "matched mkfs"),
    (r"(^|\s)shutdown(\s|$)", "matched shutdown"),
    (r"(^|\s)reboot(\s|$)", "matched reboot"),
    (r"(^|\s)userdel(\s|$)", "matched userdel"),
    (r"(^|\s)groupdel(\s|$)", "matched groupdel"),
    (r"(^|\s)iptables(\s|$)", "matched iptables"),
    (r"ufw\s+reset(\s|$)", "matched ufw reset"),
    (r"docker\s+system\s+prune(\s|$)", "matched docker system prune"),
    (r"docker\s+rm\s+-f(\s|$)", "matched docker rm -f"),
    (r"kubectl\s+delete(\s|$)", "matched kubectl delete"),
    (r"drop\s+database(\s|$)", "matched drop database"),
]

SENSITIVE_PATTERNS: list[tuple[str, str]] = [
    (r"systemctl\s+restart(\s|$)", "matched systemctl restart"),
    (r"systemctl\s+stop(\s|$)", "matched systemctl stop"),
    (r"docker\s+restart(\s|$)", "matched docker restart"),
    (r"(^|\s)git\s+pull(\s|$)", "matched git pull"),
    (r"(^|\s)chmod(\s|$)", "matched chmod"),
    (r"(^|\s)chown(\s|$)", "matched chown"),
    (r"(^|\s)mv(\s|$)", "matched mv"),
    (r"(^|\s)cp(\s|$)", "matched cp"),
    (r"sed\s+-i(\s|$)", "matched sed -i"),
]

SAFE_PATTERNS: list[tuple[str, str]] = [
    (r"(^|\s)ls(\s|$)", "matched ls"),
    (r"(^|\s)pwd(\s|$)", "matched pwd"),
    (r"(^|\s)whoami(\s|$)", "matched whoami"),
    (r"(^|\s)cat(\s|$)", "matched cat"),
    (r"(^|\s)head(\s|$)", "matched head"),
    (r"(^|\s)tail(\s|$)", "matched tail"),
    (r"(^|\s)ps(\s|$)", "matched ps"),
    (r"df\s+-h(\s|$)", "matched df -h"),
    (r"free\s+-m(\s|$)", "matched free -m"),
    (r"docker\s+ps(\s|$)", "matched docker ps"),
    (r"systemctl\s+status(\s|$)", "matched systemctl status"),
]

WRAPPER_PATTERNS: list[tuple[str, str]] = [
    (r"bash\s+-lc", "matched bash -lc wrapper"),
    (r"sh\s+-c", "matched sh -c wrapper"),
    (r"python\s+-c", "matched python -c wrapper"),
    (r"powershell(\.exe)?\s+-command", "matched powershell -Command wrapper"),
]


def classify(command: str) -> dict[str, str]:
    lowered = command.lower().strip()

    for pattern, reason in DANGEROUS_PATTERNS:
        if re.search(pattern, lowered):
            return {"risk": "dangerous", "reason": reason}

    for wrapper_pattern, wrapper_reason in WRAPPER_PATTERNS:
        if re.search(wrapper_pattern, lowered):
            for pattern, reason in DANGEROUS_PATTERNS:
                if re.search(pattern, lowered):
                    return {"risk": "dangerous", "reason": f"{wrapper_reason}; {reason}"}

    for pattern, reason in SENSITIVE_PATTERNS:
        if re.search(pattern, lowered):
            return {"risk": "sensitive", "reason": reason}

    for pattern, reason in SAFE_PATTERNS:
        if re.search(pattern, lowered):
            return {"risk": "safe", "reason": reason}

    return {"risk": "sensitive", "reason": "defaulted to sensitive"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Classify a shell command by risk.")
    parser.add_argument("--command", required=True, help="Command to classify")
    args = parser.parse_args()
    print(json.dumps(classify(args.command), ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
