#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from flow_platform_client import (
    GOOGLE_RECAPTCHA_VIDEO_ACTION,
    GOOGLE_VEO_MODEL_KEYS,
    CaptchaSolveError,
    FlowPlatformError,
    GoogleFlowClient,
    create_captcha_solver,
    first_value,
    guess_mime_type,
    is_recaptcha_retry_error,
    load_account_profile,
    as_bool,
    normalize_veo_model_key_for_account,
    print_json,
    read_image_as_base64,
    save_url,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="通过 Google VEO 提交/轮询视频任务。")
    parser.add_argument("--accounts-file", default=None, help="账号文件路径，默认读取 skill/secrets/accounts.local.json。")
    parser.add_argument("--account-profile", default=None, help="账号 profile 名称，例如 google-flow-default。")
    parser.add_argument("--mode", choices=["text", "image", "first_last_frames", "reference_image"], default="text")
    parser.add_argument("--prompt", default=None)
    parser.add_argument("--model", default="veo3.1-fast", help="用于查 Google model-key 的产品模型。")
    parser.add_argument("--model-key", default=None, help="直接指定 Google VEO model key。")
    parser.add_argument("--aspect-ratio", default="16:9")
    parser.add_argument("--image", action="append", default=[], help="图片路径、URL 或 base64，可重复传。")
    parser.add_argument("--operation", action="append", default=[], help="轮询已有 Google VEO operation name，可重复传。")
    parser.add_argument("--poll", action="store_true")
    parser.add_argument("--poll-interval", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=1800)
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

        if args.operation:
            result = client.poll_veo_operations(args.operation, args.poll_interval, args.timeout) if args.poll else client.check_veo_operations(args.operation)
            maybe_download_google_veo(result, args.output_dir)
            print_json(result)
            return 0

        if not args.prompt:
            raise FlowPlatformError("提交 Google VEO 视频时必须传 --prompt")

        model_key = args.model_key or GOOGLE_VEO_MODEL_KEYS.get((args.model, args.mode, args.aspect_ratio))
        if not model_key:
            raise FlowPlatformError(f"没有匹配的 Google VEO model key: model={args.model}, mode={args.mode}, aspect={args.aspect_ratio}")
        model_key = normalize_veo_model_key_for_account(model_key, as_bool(account.get("is_fast")))

        media_ids = []
        for image_path in args.image:
            upload = client.veo_upload_image(
                read_image_as_base64(image_path),
                mime_type=guess_mime_type(image_path),
                aspect_ratio=args.aspect_ratio,
            )
            media_id = (((upload.get("mediaGenerationId") or {}).get("mediaGenerationId")))
            if media_id:
                media_ids.append(media_id)

        start_media_id = media_ids[0] if args.mode in {"image", "first_last_frames"} and media_ids else None
        end_media_id = media_ids[1] if args.mode == "first_last_frames" and len(media_ids) > 1 else None
        reference_media_ids = media_ids if args.mode == "reference_image" else None

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
                captcha_solution = captcha_solver.solve(GOOGLE_RECAPTCHA_VIDEO_ACTION)
                recaptcha_token = captcha_solution["token"]
                user_agent = first_value(args.user_agent, captcha_solution.get("user_agent"))
            try:
                result = client.generate_veo_video(
                    prompt=args.prompt,
                    mode=args.mode,
                    model_key=model_key,
                    aspect_ratio=args.aspect_ratio,
                    recaptcha_token=recaptcha_token,
                    start_media_id=start_media_id,
                    end_media_id=end_media_id,
                    reference_media_ids=reference_media_ids,
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
            raise FlowPlatformError("Google VEO video generation returned no result")

        operations = [
            ((item.get("operation") or {}).get("name"))
            for item in (result.get("operations") or [])
            if ((item.get("operation") or {}).get("name"))
        ]
        if args.poll and operations:
            result = client.poll_veo_operations(operations, args.poll_interval, args.timeout)
        maybe_download_google_veo(result, args.output_dir)
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


def maybe_download_google_veo(result: dict, output_dir: Path | None) -> None:
    if not output_dir:
        return
    for idx, item in enumerate(result.get("operations") or []):
        video = ((((item.get("operation") or {}).get("metadata") or {}).get("video")) or {})
        if video.get("fifeUrl"):
            item["local_path"] = str(save_url(video["fifeUrl"], output_dir, f"google-veo-video-{idx}.mp4"))


if __name__ == "__main__":
    raise SystemExit(main())
