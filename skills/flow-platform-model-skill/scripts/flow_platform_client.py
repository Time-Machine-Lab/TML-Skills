#!/usr/bin/env python3
"""Google Flow / aisandbox auxiliary probe client.

This module powers the Flow platform generation scripts. It intentionally uses
only the Python standard library so it can run in small environments without
dependency setup.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


GOOGLE_AI_BASE_URL = os.environ.get("GOOGLE_AI_BASE_URL", "https://aisandbox-pa.googleapis.com")
GOOGLE_LABS_BASE_URL = os.environ.get("GOOGLE_LABS_BASE_URL", "https://labs.google")
DEFAULT_LABS_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)
DEFAULT_ACCOUNTS_FILE = Path(__file__).resolve().parents[1] / "secrets" / "accounts.local.json"


class FlowPlatformError(RuntimeError):
    def __init__(self, message: str, status: Optional[int] = None, body: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.body = body
        self.reason = _extract_google_error_reason(body or "") or message

    def classification(self) -> Dict[str, Any]:
        return classify_flow_error(self.reason, self.status, self.body)


@dataclass(frozen=True)
class FlowErrorClassification:
    reason: str
    category: str
    profile_action: str
    retryable: bool
    retry_scope: str
    recovery_action: str
    provider_health_failure: bool

    def as_dict(self) -> Dict[str, Any]:
        return {
            "reason": self.reason,
            "category": self.category,
            "profile_action": self.profile_action,
            "retryable": self.retryable,
            "retry_scope": self.retry_scope,
            "recovery_action": self.recovery_action,
            "provider_health_failure": self.provider_health_failure,
        }


CONTENT_POLICY_REASONS = {
    "video contains minor",
    "PUBLIC_ERROR_MINOR",
    "PUBLIC_ERROR_UNSAFE_GENERATION",
    "PUBLIC_ERROR_SEXUAL",
    "PUBLIC_ERROR_PROMINENT_PEOPLE_FILTER_FAILED",
    "PUBLIC_ERROR_VIOLENCE_FILTER",
    "PUBLIC_ERROR_DANGER_FILTER",
    "PUBLIC_ERROR_MINOR_UPLOAD",
    "PUBLIC_ERROR_SEXUAL_UPLOAD",
    "PUBLIC_ERROR_PROMINENT_PEOPLE_UPLOAD",
    "PUBLIC_ERROR_CONTAIN_OTHER_IMAGE",
    "PUBLIC_ERROR_UPLOAD_IMAGE_CONTAIN_PEOPLE_IMAGE",
    "PUBLIC_ERROR_CONTENT_POLICY",
    "PUBLIC_ERROR_CONTENT_POLICY_TEENAGER",
    "PUBLIC_ERROR_CONTENT_POLICY_OTHER",
    "PUBLIC_ERROR_CONTENT_POLICY_SEXUAL",
    "PUBLIC_ERROR_CONTENT_POLICY_VIOLENCE",
    "PUBLIC_ERROR_CONTENT_POLICY_SELF_HARM",
    "PUBLIC_ERROR_OPENAI_POLICY_VIOLATION",
    "PUBLIC_ERROR_AUDIO_FILTERED",
    "PUBLIC_ERROR_IP_INPUT_IMAGE",
}

RECAPTCHA_RETRY_REASONS = {
    "PUBLIC_ERROR_SOMETHING_WENT_WRONG",
    "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
}


def classify_flow_error(reason: Optional[str], status: Optional[int] = None, body: Optional[str] = None) -> Dict[str, Any]:
    resolved = reason or _extract_google_error_reason(body or "") or ""
    normalized = resolved.strip()
    lowered = normalized.lower()

    if (
        "账号文件" in normalized
        or "缺少 google ai token" in lowered
        or "project_id is required" in lowered
        or "缺少 google labs cookie" in lowered
    ):
        return FlowErrorClassification(
            reason=normalized or "LOCAL_ACCOUNT_CONFIG_ERROR",
            category="local_account_config",
            profile_action="fix_local_profile",
            retryable=False,
            retry_scope="fix_local_profile",
            recovery_action="检查 accounts.local.json 的 profile、google_ai_token、google_ai_cookie 和 project_id",
            provider_health_failure=False,
        ).as_dict()

    if (
        "缺少 --prompt" in normalized
        or "暂不支持" in normalized
        or "不能混用" in normalized
        or "必须" in normalized
        or "batch file" in lowered
        or "batch requests" in lowered
        or "invalid_request" in lowered
    ):
        return FlowErrorClassification(
            reason=normalized or "LOCAL_REQUEST_ERROR",
            category="invalid_request",
            profile_action="none",
            retryable=False,
            retry_scope="fix_parameters",
            recovery_action="修正本地生成参数、batch 文件、prompt、比例或模型组合",
            provider_health_failure=False,
        ).as_dict()

    if status == 401 or normalized == "TOKEN_EXPIRED":
        return FlowErrorClassification(
            reason=normalized or "TOKEN_EXPIRED",
            category="auth_token_expired",
            profile_action="refresh_access_token",
            retryable=False,
            retry_scope="refresh_labs_session",
            recovery_action="用 Labs cookie 调 check_labs_session.py 刷新 google_ai_token；刷新失败再切换 profile",
            provider_health_failure=True,
        ).as_dict()

    if normalized == "COOKIE_EXPIRED":
        return FlowErrorClassification(
            reason=normalized,
            category="labs_cookie_expired",
            profile_action="refresh_cookie_or_relogin",
            retryable=False,
            retry_scope="relogin_or_replace_cookie",
            recovery_action="重新登录 Labs 获取 google_ai_cookie，或切换 profile",
            provider_health_failure=True,
        ).as_dict()

    if normalized == "PUBLIC_ERROR_USER_REQUESTS_THROTTLED" or status == 429 or "resource_exhausted" in lowered or "quota" in lowered or "throttle" in lowered or "rate limit" in lowered:
        return FlowErrorClassification(
            reason=normalized or "RATE_LIMITED",
            category="account_rate_limited",
            profile_action="cooldown_or_rotate",
            retryable=True,
            retry_scope="different_account_or_after_cooldown",
            recovery_action="当前 profile 暂停使用；优先切换其他 profile，或按本地策略冷却后重试",
            provider_health_failure=False,
        ).as_dict()

    if status == 403 or normalized.endswith("403") or normalized in RECAPTCHA_RETRY_REASONS:
        return FlowErrorClassification(
            reason=normalized or "HTTP_403",
            category="recaptcha_or_risk_gate",
            profile_action="retry_with_new_captcha",
            retryable=True,
            retry_scope="new_recaptcha_token",
            recovery_action="反馈本次验证码失败，重新获取 recaptcha token 后重试；持续失败再切换 profile 或网络环境",
            provider_health_failure=True,
        ).as_dict()

    if normalized in CONTENT_POLICY_REASONS:
        return FlowErrorClassification(
            reason="video contains minor" if normalized == "PUBLIC_ERROR_MINOR" else normalized,
            category="content_policy",
            profile_action="none",
            retryable=False,
            retry_scope="change_prompt_or_input_media",
            recovery_action="修改 prompt 或输入图片/视频素材；不要惩罚 profile",
            provider_health_failure=False,
        ).as_dict()

    if status == 400 or "invalid_argument" in lowered or "bad request" in lowered:
        return FlowErrorClassification(
            reason=normalized or "INVALID_ARGUMENT",
            category="invalid_request",
            profile_action="none",
            retryable=False,
            retry_scope="fix_parameters",
            recovery_action="检查模型 key、比例、batch 是否混模型、参考图 mediaId 类型和必填字段",
            provider_health_failure=False,
        ).as_dict()

    if status and status >= 500 or normalized in {"PUBLIC_ERROR_HIGH_TRAFFIC", "PUBLIC_ERROR_VIDEO_GENERATION_TIMED_OUT"}:
        return FlowErrorClassification(
            reason=normalized or f"HTTP_{status}",
            category="provider_transient",
            profile_action="none",
            retryable=True,
            retry_scope="same_request_later",
            recovery_action="平台繁忙或任务超时；保留请求，稍后重试",
            provider_health_failure=True,
        ).as_dict()

    return FlowErrorClassification(
        reason=normalized or "UNKNOWN",
        category="unknown",
        profile_action="inspect",
        retryable=False,
        retry_scope="manual_inspection",
        recovery_action="保存完整响应，人工确认是否应加入错误分类表",
        provider_health_failure=True,
    ).as_dict()


def print_error_classification(exc: FlowPlatformError) -> None:
    print("error_classification=" + json.dumps(exc.classification(), ensure_ascii=False), file=sys.stderr)


def load_account_profile(accounts_file: Optional[str], profile_name: Optional[str]) -> Dict[str, Any]:
    path = Path(accounts_file).expanduser() if accounts_file else DEFAULT_ACCOUNTS_FILE
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise FlowPlatformError(f"账号文件 JSON 格式错误: {path}: {exc}") from exc

    profiles = data.get("profiles") or {}
    selected = profile_name or data.get("default_profile")
    if not selected:
        return {}
    if selected not in profiles:
        raise FlowPlatformError(f"账号文件中找不到 profile: {selected}")
    profile = profiles[selected]
    if not isinstance(profile, dict):
        raise FlowPlatformError(f"账号 profile 必须是对象: {selected}")
    return profile


def first_value(*values: Optional[str]) -> Optional[str]:
    for value in values:
        if value:
            return value
    return None


def as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _drop_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _drop_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_drop_none(v) for v in value if v is not None]
    return value


def _json_request(method: str, url: str, headers: Dict[str, str], payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data, _headers = _json_request_with_headers(method, url, headers, payload)
    return data


def _json_request_with_headers(method: str, url: str, headers: Dict[str, str], payload: Optional[Dict[str, Any]] = None) -> tuple[Dict[str, Any], Any]:
    body = None
    if payload is not None:
        body = json.dumps(_drop_none(payload), ensure_ascii=False).encode("utf-8")

    request = urllib.request.Request(url, data=body, method=method)
    for key, value in headers.items():
        if value is not None:
            request.add_header(key, value)

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
            if response.status != 200:
                raise FlowPlatformError(f"HTTP {response.status} from {url}", response.status, raw)
            return (json.loads(raw) if raw else {}), response.headers
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        reason = _extract_google_error_reason(raw) or raw or exc.reason
        if exc.code == 401:
            reason = "TOKEN_EXPIRED"
        raise FlowPlatformError(str(reason), exc.code, raw) from exc
    except urllib.error.URLError as exc:
        raise FlowPlatformError(f"request failed for {url}: {exc.reason}") from exc


def _extract_google_error_reason(raw: str) -> Optional[str]:
    try:
        root = json.loads(raw)
        details = root.get("error", {}).get("details") or []
        if details and details[0].get("reason"):
            return details[0]["reason"]
        return root.get("error", {}).get("message")
    except Exception:
        return None


def read_image_as_base64(path_or_base64: str) -> str:
    if path_or_base64.startswith("data:"):
        return path_or_base64.split(",", 1)[1]
    path = _existing_path(path_or_base64)
    if path:
        return base64.b64encode(path.read_bytes()).decode("ascii")
    return path_or_base64


def _existing_path(value: str) -> Optional[Path]:
    try:
        path = Path(value).expanduser()
        return path if path.exists() and path.is_file() else None
    except OSError:
        return None


def guess_mime_type(path: str, default: str = "image/jpeg") -> str:
    mime_type, _ = mimetypes.guess_type(path)
    return mime_type or default


def save_url(url: str, output_dir: Path, filename: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / filename
    with urllib.request.urlopen(url, timeout=300) as response:
        path.write_bytes(response.read())
    return path


def save_base64_image(data: str, output_dir: Path, filename: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / filename
    path.write_bytes(base64.b64decode(data))
    return path


def random_seed() -> int:
    return random.randint(0, 999999)


def session_id() -> str:
    return ";" + str(int(time.time() * 1000))


def flow_referer(project_id: Optional[str] = None) -> str:
    if project_id:
        return f"{GOOGLE_LABS_BASE_URL}/fx/tools/flow/project/{project_id}"
    return f"{GOOGLE_LABS_BASE_URL}/fx/tools/flow"


def parse_cookie_header(cookie_header: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for part in cookie_header.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        if key:
            result[key] = value.strip()
    return result


def merge_set_cookies(cookie_header: str, set_cookies: list[str]) -> str:
    current = parse_cookie_header(cookie_header)
    for raw in set_cookies:
        parsed = SimpleCookie()
        parsed.load(raw)
        for key, morsel in parsed.items():
            current[key] = morsel.value
    return "; ".join(f"{key}={value}" for key, value in current.items())


def image_aspect_ratio(value: str) -> str:
    return {
        "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE",
        "4:3": "IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE",
        "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT",
        "3:4": "IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR",
        "1:1": "IMAGE_ASPECT_RATIO_SQUARE",
    }.get(value, "IMAGE_ASPECT_RATIO_LANDSCAPE")


def image_aspect_dimensions(value: str) -> Optional[Dict[str, int]]:
    return {
        "16:9": {"width": 1376, "height": 768},
        "4:3": {"width": 1200, "height": 896},
        "1:1": {"width": 1024, "height": 1024},
        "3:4": {"width": 896, "height": 1200},
        "9:16": {"width": 768, "height": 1376},
    }.get(value)


def video_aspect_ratio(value: str) -> str:
    return {
        "16:9": "VIDEO_ASPECT_RATIO_LANDSCAPE",
        "9:16": "VIDEO_ASPECT_RATIO_PORTRAIT",
    }.get(value, "VIDEO_ASPECT_RATIO_LANDSCAPE")


def google_flow_image_model(product_model: str) -> str:
    return {
        "Nano-Banana": "GEM_PIX",
        "Nano-Banana-Pro": "GEM_PIX_2",
        "Nano-Banana-2": "NARWHAL",
        "imagen4": "IMAGEN_3_5",
        "imagen3-5": "IMAGEN_3_5",
    }.get(product_model, "IMAGEN_3_5")


GOOGLE_VEO_MODEL_KEYS = {
    ("veo3.1-fast", "text", "16:9"): "veo_3_1_t2v_fast_ultra_relaxed",
    ("veo3.1-fast", "text", "9:16"): "veo_3_1_t2v_fast_portrait_ultra_relaxed",
    ("veo3.1-fast", "image", "16:9"): "veo_3_1_i2v_s_fast_ultra_relaxed",
    ("veo3.1-fast", "image", "9:16"): "veo_3_1_i2v_s_fast_portrait_ultra_relaxed",
    ("veo3.1-fast", "first_last_frames", "16:9"): "veo_3_1_i2v_s_fast_fl_ultra_relaxed",
    ("veo3.1-fast", "first_last_frames", "9:16"): "veo_3_1_i2v_s_fast_portrait_fl_ultra_relaxed",
    ("veo3.1-fast", "reference_image", "16:9"): "veo_3_1_r2v_fast_landscape_ultra_relaxed",
    ("veo3.1-fast", "reference_image", "9:16"): "veo_3_1_r2v_fast_portrait_ultra_relaxed",
    ("veo3.1-pro", "text", "16:9"): "veo_3_1_t2v",
    ("veo3.1-pro", "text", "9:16"): "veo_3_1_t2v_portrait",
    ("veo3.1-pro", "image", "16:9"): "veo_3_1_i2v_s",
    ("veo3.1-pro", "image", "9:16"): "veo_3_1_i2v_s_portrait",
    ("veo3.1-pro", "first_last_frames", "16:9"): "veo_3_1_i2v_s_fl",
    ("veo3.1-pro", "first_last_frames", "9:16"): "veo_3_1_i2v_s_portrait_fl",
    ("veo3.1-quality", "text", "16:9"): "veo_3_1_t2v",
    ("veo3.1-quality", "text", "9:16"): "veo_3_1_t2v_portrait",
    ("veo3.1-quality", "image", "16:9"): "veo_3_1_i2v_s",
    ("veo3.1-quality", "image", "9:16"): "veo_3_1_i2v_s_portrait",
    ("veo3.1-quality", "first_last_frames", "16:9"): "veo_3_1_i2v_s_fl",
    ("veo3.1-quality", "first_last_frames", "9:16"): "veo_3_1_i2v_s_portrait_fl",
}

VEO_FAST_ACCOUNT_MODEL_KEY_OVERRIDES = {
    "veo_3_1_i2v_s_fast_fl_ultra_relaxed": "veo_3_1_i2v_s_fast_ultra_fl",
    "veo_3_1_i2v_s_fast_portrait_fl_ultra_relaxed": "veo_3_1_i2v_s_fast_portrait_ultra_fl",
}


def normalize_veo_model_key_for_account(model_key: str, is_fast_account: bool) -> str:
    if not is_fast_account or "fast" not in model_key:
        return model_key
    if model_key in VEO_FAST_ACCOUNT_MODEL_KEY_OVERRIDES:
        return VEO_FAST_ACCOUNT_MODEL_KEY_OVERRIDES[model_key]
    return model_key.split("_relaxed", 1)[0] if "_relaxed" in model_key else model_key


class GoogleFlowClient:
    def __init__(self, token: str, project_id: Optional[str] = None, base_url: str = GOOGLE_AI_BASE_URL):
        self.token = token
        self.project_id = project_id
        self.base_url = base_url.rstrip("/")

    def _headers(self, user_agent: Optional[str] = None) -> Dict[str, str]:
        return {
            "User-Agent": user_agent or "FlowPlatformSkill-GoogleFlowClient/1.0",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": self.token,
        }

    def flow_upload_image(self, image_base64: str, mime_type: str = "image/jpeg", project_id: Optional[str] = None) -> Dict[str, Any]:
        project_id = project_id or self.project_id
        payload = {
            "clientContext": {"projectId": project_id, "tool": "PINHOLE"},
            "imageBytes": image_base64,
            "isUserUploaded": True,
            "isHidden": False,
            "mimeType": mime_type,
            "fileName": _flow_file_name(mime_type),
        }
        return _json_request("POST", f"{self.base_url}/v1/flow/uploadImage", self._headers(), payload)

    def generate_images(
        self,
        prompt: str,
        model: str,
        aspect_ratio: str,
        recaptcha_token: str,
        image_media_names: Optional[List[str]] = None,
        project_id: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        project_id = project_id or self.project_id
        if not project_id:
            raise FlowPlatformError("project_id is required for Google Flow image generation")
        result = self.generate_images_batch(
            requests=[
                {
                    "prompt": prompt,
                    "model": model,
                    "aspect_ratio": aspect_ratio,
                    "image_media_names": image_media_names or [],
                }
            ],
            recaptcha_token=recaptcha_token,
            project_id=project_id,
            user_agent=user_agent,
        )
        return result

    def generate_images_batch(
        self,
        requests: List[Dict[str, Any]],
        recaptcha_token: str,
        project_id: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        project_id = project_id or self.project_id
        if not project_id:
            raise FlowPlatformError("project_id is required for Google Flow image generation")
        if not requests:
            raise FlowPlatformError("at least one image request is required")

        model_names = {google_flow_image_model(item.get("model") or "Nano-Banana-2") for item in requests}
        if len(model_names) > 1:
            raise FlowPlatformError("Google Flow batchGenerateImages 不支持在同一个 batch 中混用不同 imageModelName；请按模型拆分请求")

        client_context = {
            "sessionId": session_id(),
            "projectId": project_id,
            "recaptchaContext": {
                "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
                "token": recaptcha_token,
            },
            "tool": "PINHOLE",
        }
        request_items = [self._flow_image_request_item(client_context, item) for item in requests]
        payload = {
            "clientContext": client_context,
            "mediaGenerationContext": {"batchId": str(uuid.uuid4())},
            "requests": request_items,
            "useNewMedia": True,
        }
        return _json_request(
            "POST",
            f"{self.base_url}/v1/projects/{project_id}/flowMedia:batchGenerateImages",
            self._headers(user_agent),
            payload,
        )

    def _flow_image_request_item(self, client_context: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
        prompt = item.get("prompt")
        if not prompt:
            raise FlowPlatformError("image prompt is required")
        google_model = google_flow_image_model(item.get("model") or "Nano-Banana-2")
        request_item = {
            "clientContext": client_context,
            "seed": item.get("seed") or random_seed(),
            "imageModelName": google_model,
            "imageAspectRatio": image_aspect_ratio(item.get("aspect_ratio") or "1:1"),
            "prompt": prompt,
            "imageInputs": [
                {"name": name, "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE"}
                for name in (item.get("image_media_names") or [])
            ],
        }
        if google_model == "NARWHAL":
            request_item["structuredPrompt"] = {"parts": [{"text": prompt}]}
            request_item["prompt"] = None
        return request_item

    def veo_upload_image(self, image_base64: str, mime_type: str = "image/jpeg", aspect_ratio: str = "16:9") -> Dict[str, Any]:
        payload = {
            "imageInput": {
                "aspectRatio": image_aspect_ratio(aspect_ratio),
                "isUserUploaded": True,
                "mimeType": mime_type,
                "rawImageBytes": image_base64,
            },
            "clientContext": {"sessionId": session_id(), "tool": "ASSET_MANAGER"},
        }
        return _json_request("POST", f"{self.base_url}/v1:uploadUserImage", self._headers(), payload)

    def generate_veo_video(
        self,
        prompt: str,
        mode: str,
        model_key: str,
        aspect_ratio: str,
        recaptcha_token: str,
        duration_seconds: Optional[int] = None,
        start_media_id: Optional[str] = None,
        end_media_id: Optional[str] = None,
        reference_media_ids: Optional[List[str]] = None,
        start_crop_coordinates: Optional[Dict[str, float]] = None,
        end_crop_coordinates: Optional[Dict[str, float]] = None,
        project_id: Optional[str] = None,
        user_agent: Optional[str] = None,
        use_v2_model_config: bool = True,
        audio_failure_preference: str = "BLOCK_SILENCED_VIDEOS",
    ) -> Dict[str, Any]:
        result = self.generate_veo_videos_batch(
            requests=[
                {
                    "prompt": prompt,
                    "model_key": model_key,
                    "aspect_ratio": aspect_ratio,
                    "duration_seconds": duration_seconds,
                    "start_media_id": start_media_id,
                    "end_media_id": end_media_id,
                    "reference_media_ids": reference_media_ids or [],
                    "start_crop_coordinates": start_crop_coordinates,
                    "end_crop_coordinates": end_crop_coordinates,
                }
            ],
            mode=mode,
            recaptcha_token=recaptcha_token,
            project_id=project_id,
            user_agent=user_agent,
            use_v2_model_config=use_v2_model_config,
            audio_failure_preference=audio_failure_preference,
        )
        return result

    def build_veo_videos_batch_payload(
        self,
        requests: List[Dict[str, Any]],
        mode: str,
        recaptcha_token: str,
        project_id: Optional[str] = None,
        use_v2_model_config: bool = True,
        audio_failure_preference: str = "BLOCK_SILENCED_VIDEOS",
    ) -> Dict[str, Any]:
        project_id = project_id or self.project_id
        if not project_id:
            raise FlowPlatformError("project_id is required for Google VEO generation")
        if not requests:
            raise FlowPlatformError("at least one video request is required")
        if len(requests) > 4:
            raise FlowPlatformError("Google VEO batch requests 最大建议 4 条；超过后请拆分")

        client_context = {
            "sessionId": session_id(),
            "projectId": project_id,
            "recaptchaContext": {
                "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
                "token": recaptcha_token,
            },
            "tool": "PINHOLE",
            "userPaygateTier": "PAYGATE_TIER_TWO",
        }
        payload = {
            "mediaGenerationContext": {
                "batchId": str(uuid.uuid4()),
                "audioFailurePreference": audio_failure_preference,
            },
            "clientContext": client_context,
            "requests": [self._veo_request_item(item, mode) for item in requests],
            "useV2ModelConfig": use_v2_model_config,
        }
        return payload

    def generate_veo_videos_batch(
        self,
        requests: List[Dict[str, Any]],
        mode: str,
        recaptcha_token: str,
        project_id: Optional[str] = None,
        user_agent: Optional[str] = None,
        use_v2_model_config: bool = True,
        audio_failure_preference: str = "BLOCK_SILENCED_VIDEOS",
    ) -> Dict[str, Any]:
        endpoint = {
            "text": "batchAsyncGenerateVideoText",
            "image": "batchAsyncGenerateVideoStartImage",
            "first_last_frames": "batchAsyncGenerateVideoStartAndEndImage",
            "reference_image": "batchAsyncGenerateVideoReferenceImages",
        }[mode]
        payload = self.build_veo_videos_batch_payload(
            requests=requests,
            mode=mode,
            recaptcha_token=recaptcha_token,
            project_id=project_id,
            use_v2_model_config=use_v2_model_config,
            audio_failure_preference=audio_failure_preference,
        )
        return _json_request("POST", f"{self.base_url}/v1/video:{endpoint}", self._headers(user_agent), payload)

    def _veo_request_item(self, item: Dict[str, Any], mode: str) -> Dict[str, Any]:
        prompt = item.get("prompt")
        if not prompt:
            raise FlowPlatformError("video prompt is required")
        ai_request = {
            "aspectRatio": video_aspect_ratio(item.get("aspect_ratio") or "16:9"),
            "seed": item.get("seed") or random_seed(),
            "textInput": {
                "prompt": prompt,
                "structuredPrompt": {"parts": [{"text": prompt}]},
            },
            "videoModelKey": item.get("model_key"),
            "metadata": item.get("metadata") or {},
            "startImage": _media_image(item.get("start_media_id"), item.get("start_crop_coordinates")),
            "endImage": _media_image(item.get("end_media_id"), item.get("end_crop_coordinates")),
            "referenceImages": [
                {"imageUsageType": "IMAGE_USAGE_TYPE_ASSET", "mediaId": media_id}
                for media_id in (item.get("reference_media_ids") or [])
            ] or None,
        }
        if mode in {"image", "first_last_frames"} and not ai_request["startImage"]:
            raise FlowPlatformError(f"{mode} 模式必须提供 start mediaId 或起始图片")
        if mode == "first_last_frames" and not ai_request["endImage"]:
            raise FlowPlatformError("first_last_frames 模式必须提供 end mediaId 或结束图片")
        if mode == "reference_image" and not ai_request["referenceImages"]:
            raise FlowPlatformError("reference_image 模式必须提供 reference mediaId 或参考图")
        return _drop_none(ai_request)

    def check_veo_operations(self, operation_names: Iterable[str]) -> Dict[str, Any]:
        payload = {
            "operations": [{"operation": {"name": name}} for name in operation_names],
        }
        return _json_request(
            "POST",
            f"{self.base_url}/v1/video:batchCheckAsyncVideoGenerationStatus",
            self._headers(),
            payload,
        )

    def poll_veo_operations(self, operation_names: Iterable[str], interval: int = 10, timeout: int = 1800) -> Dict[str, Any]:
        names = list(operation_names)
        deadline = time.time() + timeout
        while True:
            result = self.check_veo_operations(names)
            operations = result.get("operations") or []
            statuses = {item.get("status") for item in operations}
            has_error = any((item.get("operation") or {}).get("error") for item in operations)
            if has_error or statuses.intersection({"MEDIA_GENERATION_STATUS_SUCCESSFUL", "MEDIA_GENERATION_STATUS_FAILED"}):
                return result
            if time.time() >= deadline:
                raise FlowPlatformError(f"timed out polling Google VEO operations {names}")
            time.sleep(interval)


class GoogleLabsClient:
    def __init__(self, cookie: str, base_url: str = GOOGLE_LABS_BASE_URL):
        self.cookie = cookie
        self.base_url = base_url.rstrip("/")

    def _headers(self, user_agent: Optional[str] = None, referer: Optional[str] = None) -> Dict[str, str]:
        return {
            "User-Agent": user_agent or DEFAULT_LABS_USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cookie": self.cookie,
            "Origin": self.base_url,
            "Referer": referer or f"{self.base_url}/fx/tools/flow",
        }

    def create_project(
        self,
        project_title: str,
        tool_name: str = "PINHOLE",
        user_agent: Optional[str] = None,
    ) -> tuple[Dict[str, Any], list[str]]:
        payload = {"json": {"projectTitle": project_title, "toolName": tool_name}}
        data, headers = _json_request_with_headers(
            "POST",
            f"{self.base_url}/fx/api/trpc/project.createProject",
            self._headers(user_agent=user_agent),
            payload,
        )
        return data, headers.get_all("Set-Cookie") or []


def _flow_file_name(mime_type: str) -> str:
    if "png" in mime_type:
        return "upload.png"
    if "webp" in mime_type:
        return "upload.webp"
    return "upload.jpeg"


def _media_image(media_id: Optional[str], crop_coordinates: Optional[Dict[str, float]] = None) -> Optional[Dict[str, Any]]:
    if not media_id:
        return None
    image = {"mediaId": media_id}
    if crop_coordinates:
        image["cropCoordinates"] = crop_coordinates
    return image


def print_json(data: Dict[str, Any]) -> None:
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
