#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from captcha_service import (
    GOOGLE_RECAPTCHA_VIDEO_ACTION,
    CaptchaError,
    is_recaptcha_retry_error,
    run_with_captcha,
)
from flow_generation_runtime import add_account_arguments, add_captcha_arguments, build_google_flow_runtime, captcha_user_agent
from flow_platform_client import (
    GOOGLE_VEO_MODEL_KEYS,
    FlowPlatformError,
    guess_mime_type,
    as_bool,
    normalize_veo_model_key_for_account,
    print_json,
    read_image_as_base64,
    save_url,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="通过 Google VEO 提交/轮询视频任务。")
    add_account_arguments(parser)
    add_captcha_arguments(parser)
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
    parser.add_argument("--output-dir", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        runtime = build_google_flow_runtime(args, include_captcha=not bool(args.operation))
        client = runtime.client

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
        model_key = normalize_veo_model_key_for_account(model_key, as_bool(runtime.account.get("is_fast")))

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

        if runtime.captcha_provider is None:
            raise FlowPlatformError("提交 Google VEO 视频时必须启用 captcha provider")
        result = run_with_captcha(
            runtime.captcha_provider,
            GOOGLE_RECAPTCHA_VIDEO_ACTION,
            lambda captcha: client.generate_veo_video(
                prompt=args.prompt,
                mode=args.mode,
                model_key=model_key,
                aspect_ratio=args.aspect_ratio,
                recaptcha_token=captcha.token,
                start_media_id=start_media_id,
                end_media_id=end_media_id,
                reference_media_ids=reference_media_ids,
                project_id=runtime.project_id,
                user_agent=captcha_user_agent(args, captcha),
            ),
            is_retryable_error=is_recaptcha_retry_error,
        )

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
    except CaptchaError as exc:
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
