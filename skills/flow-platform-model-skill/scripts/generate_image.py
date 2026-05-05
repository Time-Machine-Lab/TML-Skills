#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
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
    google_flow_image_model,
    guess_mime_type,
    image_aspect_dimensions,
    print_error_classification,
    print_json,
    read_image_as_base64,
    save_base64_image,
    save_url,
)


MAX_IMAGE_BATCH_SIZE = 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="通过 Google Flow 生成图片。")
    add_account_arguments(parser)
    add_captcha_arguments(parser)
    parser.add_argument("--prompt", action="append", default=[], help="生成提示词；可重复传以在同一模型下批量生成。")
    parser.add_argument("--model", default="Nano-Banana-2")
    parser.add_argument("--aspect-ratio", action="append", default=None, help="比例：16:9、4:3、1:1、3:4、9:16；可重复传，数量为 1 或等于 prompt 数。")
    parser.add_argument("--count", type=int, default=1, help="同一个 prompt 生成多张；不能和多个 --prompt 混用。")
    parser.add_argument("--image", action="append", default=[], help="参考图路径、URL 或 base64，可重复传。")
    parser.add_argument("--batch-file", type=Path, default=None, help="JSON 批量文件，支持每条请求独立 prompt/aspect_ratio/images。")
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--response-file", type=Path, default=None, help="保存完整响应 JSON；用于调试 batch/workflow。")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        runtime = build_google_flow_runtime(args)
        client = runtime.client

        if runtime.captcha_provider is None:
            raise FlowPlatformError("提交 Google Flow 图片时必须启用 captcha provider")
        image_requests = build_image_requests(args)
        validate_image_batch(image_requests)
        for image_request in image_requests:
            image_request["image_media_names"] = upload_reference_images(
                client,
                image_request.pop("images", []),
                runtime.project_id,
            )
        result = run_with_captcha(
            runtime.captcha_provider,
            GOOGLE_RECAPTCHA_IMAGE_ACTION,
            lambda captcha: client.generate_images_batch(
                requests=image_requests,
                recaptcha_token=captcha.token,
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


def upload_reference_images(client, image_paths: list[str], project_id) -> list[str]:
    media_names = []
    for image_path in image_paths:
        image_b64 = read_image_as_base64(image_path)
        mime_type = guess_mime_type(image_path)
        upload = client.flow_upload_image(image_b64, mime_type=mime_type, project_id=project_id)
        media_name = ((upload.get("media") or {}).get("name"))
        if media_name:
            media_names.append(media_name)
    return media_names


def build_image_requests(args: argparse.Namespace) -> list[dict]:
    if args.batch_file:
        return build_image_requests_from_file(args.batch_file, args.model, args.image)

    prompts = args.prompt or []
    if not prompts:
        raise FlowPlatformError("缺少 --prompt；或使用 --batch-file")
    if args.count < 1:
        raise FlowPlatformError("--count 必须大于等于 1")
    if args.count > MAX_IMAGE_BATCH_SIZE:
        raise FlowPlatformError(f"--count 最大支持 {MAX_IMAGE_BATCH_SIZE}；Flow UI 当前也是 x1-x4")
    if len(prompts) > 1 and args.count != 1:
        raise FlowPlatformError("多个 --prompt 已经表示批量请求，不能同时使用 --count > 1")

    ratios = args.aspect_ratio or ["1:1"]
    if len(ratios) not in {1, len(prompts)}:
        raise FlowPlatformError("--aspect-ratio 的数量必须是 1，或与 --prompt 数量一致")

    if len(prompts) == 1 and args.count > 1:
        prompts = prompts * args.count
        ratios = ratios * args.count if len(ratios) == 1 else ratios
    elif len(ratios) == 1:
        ratios = ratios * len(prompts)

    requests = []
    for prompt, ratio in zip(prompts, ratios):
        if not image_aspect_dimensions(ratio):
            raise FlowPlatformError(f"暂不支持的图片比例: {ratio}")
        requests.append(
            {
                "prompt": prompt,
                "model": args.model,
                "aspect_ratio": ratio,
                "images": args.image,
            }
        )
    return requests


def build_image_requests_from_file(batch_file: Path, default_model: str, default_images: list[str]) -> list[dict]:
    try:
        data = json.loads(batch_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise FlowPlatformError(f"batch file JSON 格式错误: {batch_file}: {exc}") from exc

    items = data.get("requests") if isinstance(data, dict) else data
    if not isinstance(items, list) or not items:
        raise FlowPlatformError("batch file 必须是数组，或包含非空 requests 数组")

    requests = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            raise FlowPlatformError(f"batch requests[{idx}] 必须是对象")
        prompt = item.get("prompt")
        if not prompt:
            raise FlowPlatformError(f"batch requests[{idx}] 缺少 prompt")
        aspect_ratio = item.get("aspect_ratio") or item.get("aspectRatio") or "1:1"
        if not image_aspect_dimensions(aspect_ratio):
            raise FlowPlatformError(f"batch requests[{idx}] 暂不支持的图片比例: {aspect_ratio}")
        images = item.get("images")
        if images is None:
            images = default_images
        elif isinstance(images, str):
            images = [images]
        elif not isinstance(images, list):
            raise FlowPlatformError(f"batch requests[{idx}].images 必须是字符串或数组")
        requests.append(
            {
                "prompt": prompt,
                "model": item.get("model") or default_model,
                "aspect_ratio": aspect_ratio,
                "seed": item.get("seed"),
                "images": images,
            }
        )
    return requests


def validate_image_batch(requests: list[dict]) -> None:
    if not requests:
        raise FlowPlatformError("至少需要一条图片生成请求")
    if len(requests) > MAX_IMAGE_BATCH_SIZE:
        raise FlowPlatformError(f"单次 batch 最大支持 {MAX_IMAGE_BATCH_SIZE} 条请求；超过后请拆分多次调用")

    model_names = {google_flow_image_model(item.get("model") or "Nano-Banana-2") for item in requests}
    if len(model_names) > 1:
        raise FlowPlatformError("同一个 batch 不能混用不同图片模型；请按 model 拆分请求")


if __name__ == "__main__":
    raise SystemExit(main())
