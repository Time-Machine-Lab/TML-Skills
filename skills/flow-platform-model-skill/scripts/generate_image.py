#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from flow_platform_client import (
    GOOGLE_RECAPTCHA_IMAGE_ACTION,
    CaptchaSolveError,
    FlowPlatformError,
    GoogleFlowClient,
    create_captcha_solver,
    first_value,
    guess_mime_type,
    is_recaptcha_retry_error,
    load_account_profile,
    print_json,
    read_image_as_base64,
    save_base64_image,
    save_url,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="通过 Google Flow 生成图片。")
    parser.add_argument("--accounts-file", default=None, help="账号文件路径，默认读取 skill/secrets/accounts.local.json。")
    parser.add_argument("--account-profile", default=None, help="账号 profile 名称，例如 google-flow-default。")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--model", default="Nano-Banana-2")
    parser.add_argument("--aspect-ratio", default="1:1")
    parser.add_argument("--image", action="append", default=[], help="参考图路径、URL 或 base64，可重复传。")
    parser.add_argument("--project-id", default=os.environ.get("GOOGLE_FLOW_PROJECT_ID"))
    parser.add_argument("--recaptcha-token", default=os.environ.get("GOOGLE_RECAPTCHA_TOKEN"))
    parser.add_argument("--user-agent", default=None)
    parser.add_argument("--output-dir", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        account = load_account_profile(args.accounts_file, args.account_profile)
        args.project_id = first_value(args.project_id, account.get("project_id"))
        args.recaptcha_token = first_value(args.recaptcha_token, account.get("recaptcha_token"))
        args.user_agent = first_value(args.user_agent, account.get("user_agent"))

        token = first_value(os.environ.get("GOOGLE_AI_TOKEN"), account.get("google_ai_token"), account.get("token"))
        if not token:
            raise FlowPlatformError("缺少 Google AI token：请设置 GOOGLE_AI_TOKEN，或在 secrets/accounts.local.json 里配置 google_ai_token")

        client = GoogleFlowClient(token, project_id=args.project_id)
        media_names = []
        for image_path in args.image:
            image_b64 = read_image_as_base64(image_path)
            mime_type = guess_mime_type(image_path)
            upload = client.flow_upload_image(image_b64, mime_type=mime_type, project_id=args.project_id)
            media_name = ((upload.get("media") or {}).get("name"))
            if media_name:
                media_names.append(media_name)

        captcha_solver = None
        if not args.recaptcha_token:
            captcha_solver = create_captcha_solver(account)
            if not captcha_solver:
                raise FlowPlatformError("缺少 recaptcha token：请设置 GOOGLE_RECAPTCHA_TOKEN、--recaptcha-token，或在账号 captcha 中配置 provider")

        result = None
        max_attempts = 4 if captcha_solver else 1
        for attempt in range(max_attempts):
            captcha_solution = None
            recaptcha_token = args.recaptcha_token
            user_agent = args.user_agent
            if captcha_solver:
                captcha_solution = captcha_solver.solve(GOOGLE_RECAPTCHA_IMAGE_ACTION)
                recaptcha_token = captcha_solution["token"]
                user_agent = first_value(args.user_agent, captcha_solution.get("user_agent"))
            try:
                result = client.generate_images(
                    prompt=args.prompt,
                    model=args.model,
                    aspect_ratio=args.aspect_ratio,
                    recaptcha_token=recaptcha_token,
                    image_media_names=media_names,
                    project_id=args.project_id,
                    user_agent=user_agent,
                )
                if captcha_solver:
                    captcha_solver.feedback(captcha_solution, True)
                break
            except FlowPlatformError as exc:
                should_retry = captcha_solver and is_recaptcha_retry_error(exc) and attempt < max_attempts - 1
                if captcha_solver and is_recaptcha_retry_error(exc):
                    captcha_solver.feedback(captcha_solution, False)
                if should_retry:
                    continue
                raise

        if result is None:
            raise FlowPlatformError("Google Flow image generation returned no result")

        if args.output_dir:
            for idx, item in enumerate(result.get("media") or []):
                generated = (((item.get("image") or {}).get("generatedImage")) or {})
                if generated.get("fifeUrl"):
                    item["local_path"] = str(save_url(generated["fifeUrl"], args.output_dir, f"google-flow-image-{idx}.jpg"))
                elif generated.get("encodedImage"):
                    item["local_path"] = str(save_base64_image(generated["encodedImage"], args.output_dir, f"google-flow-image-{idx}.jpg"))
        print_json(result)
        return 0
    except FlowPlatformError as exc:
        print(f"error: {exc}", file=sys.stderr)
        if exc.body:
            print(exc.body, file=sys.stderr)
        return 1
    except CaptchaSolveError as exc:
        print(f"captcha error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
