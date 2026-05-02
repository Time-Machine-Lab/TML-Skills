#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys

from captcha_service import (
    GOOGLE_RECAPTCHA_IMAGE_ACTION,
    GOOGLE_RECAPTCHA_VIDEO_ACTION,
    CaptchaError,
    build_captcha_provider,
)
from flow_generation_runtime import add_captcha_arguments


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="验证 Flow 平台验证码 provider 是否可用。")
    add_captcha_arguments(parser)
    parser.add_argument("--action", choices=["image", "video"], default="image", help="验证码 pageAction 类型。")
    parser.add_argument("--feedback", choices=["true", "false", "none"], default="true", help="是否调用 provider feedback。")
    parser.add_argument("--show-full-token", action="store_true", help="只用于本地临时排查；不要把完整 token 粘贴到聊天或文档。")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    page_action = GOOGLE_RECAPTCHA_VIDEO_ACTION if args.action == "video" else GOOGLE_RECAPTCHA_IMAGE_ACTION
    try:
        provider = build_captcha_provider(
            config_file=args.captcha_config,
            provider_name=args.captcha_provider,
            token_override=args.recaptcha_token,
            user_agent_override=args.user_agent,
        )
        solution = provider.solve(page_action)
        feedback_ok = None
        if args.feedback != "none":
            feedback_ok = provider.feedback(solution, args.feedback == "true")

        token = solution.token or ""
        print(f"provider={solution.provider}")
        print(f"page_action={page_action}")
        print(f"token_length={len(token)}")
        print(f"token={token if args.show_full_token else mask_token(token)}")
        print(f"user_agent_present={bool(solution.user_agent)}")
        print(f"task_id_present={bool(solution.task_id)}")
        if feedback_ok is not None:
            print(f"feedback_ok={feedback_ok}")
        return 0
    except CaptchaError as exc:
        print(f"captcha error: {exc}", file=sys.stderr)
        return 1


def mask_token(token: str) -> str:
    if len(token) <= 36:
        return "<too-short>"
    return f"{token[:18]}...{token[-12:]}"


if __name__ == "__main__":
    raise SystemExit(main())

