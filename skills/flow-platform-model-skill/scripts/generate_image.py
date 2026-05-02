#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from captcha_service import (
    GOOGLE_RECAPTCHA_IMAGE_ACTION,
    CaptchaError,
    is_recaptcha_retry_error,
    run_with_captcha,
)
from flow_generation_runtime import add_account_arguments, add_captcha_arguments, build_google_flow_runtime, captcha_user_agent
from flow_platform_client import (
    FlowPlatformError,
    guess_mime_type,
    print_json,
    read_image_as_base64,
    save_base64_image,
    save_url,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="通过 Google Flow 生成图片。")
    add_account_arguments(parser)
    add_captcha_arguments(parser)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--model", default="Nano-Banana-2")
    parser.add_argument("--aspect-ratio", default="1:1")
    parser.add_argument("--image", action="append", default=[], help="参考图路径、URL 或 base64，可重复传。")
    parser.add_argument("--output-dir", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        runtime = build_google_flow_runtime(args)
        client = runtime.client
        media_names = []
        for image_path in args.image:
            image_b64 = read_image_as_base64(image_path)
            mime_type = guess_mime_type(image_path)
            upload = client.flow_upload_image(image_b64, mime_type=mime_type, project_id=runtime.project_id)
            media_name = ((upload.get("media") or {}).get("name"))
            if media_name:
                media_names.append(media_name)

        if runtime.captcha_provider is None:
            raise FlowPlatformError("提交 Google Flow 图片时必须启用 captcha provider")
        result = run_with_captcha(
            runtime.captcha_provider,
            GOOGLE_RECAPTCHA_IMAGE_ACTION,
            lambda captcha: client.generate_images(
                prompt=args.prompt,
                model=args.model,
                aspect_ratio=args.aspect_ratio,
                recaptcha_token=captcha.token,
                image_media_names=media_names,
                project_id=runtime.project_id,
                user_agent=captcha_user_agent(args, captcha),
            ),
            is_retryable_error=is_recaptcha_retry_error,
        )

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
    except CaptchaError as exc:
        print(f"captcha error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
