#!/usr/bin/env python3
"""Shared runtime setup for Flow platform generation scripts."""

from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

from captcha_service import CaptchaProvider, CaptchaSolution, build_captcha_provider
from flow_platform_client import (
    FlowPlatformError,
    GoogleFlowClient,
    first_value,
    load_account_profile,
)


@dataclass
class GoogleFlowRuntime:
    account: Dict[str, Any]
    client: GoogleFlowClient
    captcha_provider: Optional[CaptchaProvider]
    project_id: Optional[str]


def add_account_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--accounts-file", default=None, help="账号文件路径，默认读取 skill/secrets/accounts.local.json。")
    parser.add_argument("--account-profile", default=None, help="账号 profile 名称，例如 google-flow-default。")
    parser.add_argument("--project-id", default=os.environ.get("GOOGLE_FLOW_PROJECT_ID"))


def add_captcha_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--captcha-config", default=None, help="验证码配置路径，默认读取 skill/secrets/captcha.local.json。")
    parser.add_argument("--captcha-provider", default=None, help="验证码 provider，例如 capsolver；默认读配置或 FLOW_CAPTCHA_PROVIDER。")
    parser.add_argument(
        "--recaptcha-token",
        default=os.environ.get("GOOGLE_RECAPTCHA_TOKEN"),
        help="临时调试用的一次性 token；正常生成应由 captcha_service 动态获取。",
    )
    parser.add_argument("--user-agent", default=None, help="临时调试用；正常生成优先使用 captcha_service 返回的 userAgent。")


def build_google_flow_runtime(args: argparse.Namespace, include_captcha: bool = True) -> GoogleFlowRuntime:
    account = load_account_profile(args.accounts_file, args.account_profile)
    project_id = first_value(args.project_id, account.get("project_id"))
    token = first_value(os.environ.get("GOOGLE_AI_TOKEN"), account.get("google_ai_token"), account.get("token"))
    if not token:
        raise FlowPlatformError("缺少 Google AI token：请设置 GOOGLE_AI_TOKEN，或在 secrets/accounts.local.json 里配置 google_ai_token")

    captcha_provider = None
    if include_captcha:
        captcha_provider = build_captcha_provider(
            config_file=args.captcha_config,
            provider_name=args.captcha_provider,
            token_override=args.recaptcha_token,
            user_agent_override=args.user_agent,
        )
    return GoogleFlowRuntime(
        account=account,
        client=GoogleFlowClient(token, project_id=project_id),
        captcha_provider=captcha_provider,
        project_id=project_id,
    )


def captcha_user_agent(args: argparse.Namespace, solution: CaptchaSolution) -> Optional[str]:
    return first_value(args.user_agent, solution.user_agent)
