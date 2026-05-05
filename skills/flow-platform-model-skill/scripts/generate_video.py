#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
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
    classify_flow_error,
    guess_mime_type,
    as_bool,
    normalize_veo_model_key_for_account,
    print_error_classification,
    print_json,
    read_image_as_base64,
    save_url,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="通过 Google VEO 提交/轮询视频任务。")
    add_account_arguments(parser)
    add_captcha_arguments(parser)
    parser.add_argument("--mode", choices=["text", "image", "first_last_frames"], default="text")
    parser.add_argument("--prompt", default=None, help="视频提示词。视频入口只提交单个任务；多个视频请由外层循环多次调用。")
    parser.add_argument("--model", choices=["veo3.1-quality"], default="veo3.1-quality", help="产品模型；公开视频入口固定使用 Veo 3.1 Quality。")
    parser.add_argument("--model-key", default=None, help="直接指定 Google VEO model key。")
    parser.add_argument("--aspect-ratio", choices=["16:9", "9:16"], default="16:9")
    parser.add_argument("--image", action="append", default=[], help="图片路径、URL 或 base64。image 模式传 1 张；first_last_frames 模式按首帧、尾帧顺序传 2 张。")
    parser.add_argument("--start-media-id", default=None, help="跳过上传，直接使用已有 VEO mediaGenerationId 作为 startImage.mediaId。")
    parser.add_argument("--end-media-id", default=None, help="跳过上传，直接使用已有 VEO mediaGenerationId 作为 endImage.mediaId。")
    parser.add_argument("--operation", action="append", default=[], help="轮询已有 Google VEO operation name，可重复传。")
    parser.add_argument("--poll", action="store_true")
    parser.add_argument("--poll-interval", type=int, default=10)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--response-file", type=Path, default=None, help="保存完整响应 JSON；配合 --dry-run 时保存请求 payload。")
    parser.add_argument("--dry-run", action="store_true", help="只构造请求 payload，不提交 Google VEO。")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        runtime = build_google_flow_runtime(args, include_captcha=not bool(args.operation) and not args.dry_run)
        client = runtime.client

        if args.operation:
            result = client.poll_veo_operations(args.operation, args.poll_interval, args.timeout) if args.poll else client.check_veo_operations(args.operation)
            annotate_operation_errors(result)
            maybe_download_google_veo(result, args.output_dir)
            if args.response_file:
                args.response_file.parent.mkdir(parents=True, exist_ok=True)
                args.response_file.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print_json(result)
            return 0

        video_request = build_single_video_request(args, client, runtime)

        if runtime.captcha_provider is None and not args.dry_run:
            raise FlowPlatformError("提交 Google VEO 视频时必须启用 captcha provider")
        if args.dry_run:
            result = client.build_veo_videos_batch_payload(
                requests=[video_request],
                mode=args.mode,
                recaptcha_token=args.recaptcha_token or "<recaptcha-token>",
                project_id=runtime.project_id,
            )
        else:
            result = run_with_captcha(
                runtime.captcha_provider,
                GOOGLE_RECAPTCHA_VIDEO_ACTION,
                lambda captcha: client.generate_veo_video(
                    prompt=video_request["prompt"],
                    mode=args.mode,
                    model_key=video_request["model_key"],
                    aspect_ratio=video_request["aspect_ratio"],
                    recaptcha_token=captcha.token,
                    start_media_id=video_request.get("start_media_id"),
                    end_media_id=video_request.get("end_media_id"),
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
        annotate_operation_errors(result)
        maybe_download_google_veo(result, args.output_dir)
        if args.response_file:
            args.response_file.parent.mkdir(parents=True, exist_ok=True)
            args.response_file.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print_json(result)
        return 0
    except FlowPlatformError as exc:
        print(f"error: {exc}", file=sys.stderr)
        print_error_classification(exc)
        if exc.body:
            print(exc.body, file=sys.stderr)
        return 1
    except CaptchaError as exc:
        print(f"captcha error: {exc}", file=sys.stderr)
        return 1


def build_single_video_request(args: argparse.Namespace, client, runtime) -> dict:
    if not args.prompt:
        raise FlowPlatformError("提交 Google VEO 视频时必须传 --prompt")
    model_key = resolve_video_model_key(
        args.model,
        args.mode,
        args.aspect_ratio,
        args.model_key,
        as_bool(runtime.account.get("is_fast")),
    )
    media_ids = upload_video_images(client, args.image, args.aspect_ratio)
    start_media_id = args.start_media_id or (media_ids[0] if args.mode in {"image", "first_last_frames"} and media_ids else None)
    end_media_id = args.end_media_id or (media_ids[1] if args.mode == "first_last_frames" and len(media_ids) > 1 else None)
    if args.mode == "image" and not start_media_id:
        raise FlowPlatformError("image 模式必须提供 --image 或 --start-media-id")
    if args.mode == "first_last_frames" and (not start_media_id or not end_media_id):
        raise FlowPlatformError("first_last_frames 模式必须提供首帧和尾帧：两张 --image，或 --start-media-id + --end-media-id")
    return {
        "prompt": args.prompt,
        "model_key": model_key,
        "aspect_ratio": args.aspect_ratio,
        "start_media_id": start_media_id,
        "end_media_id": end_media_id,
    }


def resolve_video_model_key(model: str, mode: str, aspect_ratio: str, model_key: str | None, is_fast_account: bool) -> str:
    resolved = model_key or GOOGLE_VEO_MODEL_KEYS.get((model, mode, aspect_ratio))
    if not resolved:
        raise FlowPlatformError(f"没有匹配的 Google VEO model key: model={model}, mode={mode}, aspect={aspect_ratio}")
    return normalize_veo_model_key_for_account(resolved, is_fast_account)


def upload_video_images(client, image_paths: list[str], aspect_ratio: str) -> list[str]:
    return [upload_single_video_image(client, image_path, aspect_ratio) for image_path in image_paths]


def upload_single_video_image(client, image_path: str, aspect_ratio: str) -> str:
    upload = client.veo_upload_image(
        read_image_as_base64(image_path),
        mime_type=guess_mime_type(image_path),
        aspect_ratio=aspect_ratio,
    )
    media_id = (((upload.get("mediaGenerationId") or {}).get("mediaGenerationId")))
    if not media_id:
        raise FlowPlatformError(f"上传 VEO 图片失败，响应缺少 mediaGenerationId: {image_path}")
    return media_id


def maybe_download_google_veo(result: dict, output_dir: Path | None) -> None:
    if not output_dir:
        return
    for idx, item in enumerate(result.get("operations") or []):
        video = ((((item.get("operation") or {}).get("metadata") or {}).get("video")) or {})
        if video.get("fifeUrl"):
            item["local_path"] = str(save_url(video["fifeUrl"], output_dir, f"google-veo-video-{idx}.mp4"))


def annotate_operation_errors(result: dict) -> None:
    for item in result.get("operations") or []:
        error = ((item.get("operation") or {}).get("error") or {})
        message = error.get("message")
        if message:
            item["error_classification"] = classify_flow_error(message, error.get("code"))


if __name__ == "__main__":
    raise SystemExit(main())
