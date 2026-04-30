#!/usr/bin/env python3
"""Google Flow / aisandbox auxiliary probe client.

This module is only for validating research assumptions. It intentionally uses
only the Python standard library so it can be copied into small test
environments without dependency setup.
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
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


GOOGLE_AI_BASE_URL = os.environ.get("GOOGLE_AI_BASE_URL", "https://aisandbox-pa.googleapis.com")
DEFAULT_ACCOUNTS_FILE = Path(__file__).resolve().parents[1] / "secrets" / "accounts.local.json"
GOOGLE_RECAPTCHA_WEBSITE_URL = "https://labs.google/"
GOOGLE_RECAPTCHA_WEBSITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV"
GOOGLE_RECAPTCHA_WEBSITE_TITLE = "Flow - ModelMaster"
GOOGLE_RECAPTCHA_IMAGE_ACTION = "IMAGE_GENERATION"
GOOGLE_RECAPTCHA_VIDEO_ACTION = "VIDEO_GENERATION"
RECAPTCHA_RETRY_REASONS = {
    "PUBLIC_ERROR_SOMETHING_WENT_WRONG",
    "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
}


class FlowPlatformError(RuntimeError):
    def __init__(self, message: str, status: Optional[int] = None, body: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.body = body


class CaptchaSolveError(RuntimeError):
    pass


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
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        reason = _extract_google_error_reason(raw) or raw or exc.reason
        if exc.code == 401:
            reason = "TOKEN_EXPIRED"
        raise FlowPlatformError(str(reason), exc.code, raw) from exc
    except urllib.error.URLError as exc:
        raise FlowPlatformError(f"request failed for {url}: {exc.reason}") from exc


def is_recaptcha_retry_error(exc: FlowPlatformError) -> bool:
    reason = str(exc)
    return reason.endswith("403") or reason in RECAPTCHA_RETRY_REASONS or exc.status == 403


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


def create_captcha_solver(account: Dict[str, Any]) -> Optional["CaptchaSolver"]:
    config = account.get("captcha") or {}
    if not config:
        return None
    provider = (config.get("provider") or "none").lower()
    if provider in {"", "none", "manual"}:
        return None
    if provider != "capsolver":
        raise CaptchaSolveError(f"暂不支持的 captcha provider: {provider}")
    client_key = first_value(os.environ.get("CAPSOLVER_CLIENT_KEY"), config.get("client_key"), config.get("key"))
    if not client_key:
        raise CaptchaSolveError("缺少 Capsolver client_key：请设置 CAPSOLVER_CLIENT_KEY，或在账号 captcha.client_key 中配置")
    return CaptchaSolver(
        provider=provider,
        client_key=client_key,
        base_url=config.get("base_url") or "https://api.capsolver.com",
        poll_interval_ms=int(config.get("poll_interval_ms") or 4000),
        max_poll_times=int(config.get("max_poll_times") or 6),
        feedback_enabled=as_bool(config.get("feedback_enabled"), True),
        task_type=config.get("task_type") or "ReCaptchaV3TaskProxyLess",
        website_url=config.get("website_url") or GOOGLE_RECAPTCHA_WEBSITE_URL,
        website_key=config.get("website_key") or GOOGLE_RECAPTCHA_WEBSITE_KEY,
        website_title=config.get("website_title"),
    )


class CaptchaSolver:
    def __init__(
        self,
        provider: str,
        client_key: str,
        base_url: str,
        poll_interval_ms: int,
        max_poll_times: int,
        feedback_enabled: bool,
        task_type: str,
        website_url: str,
        website_key: str,
        website_title: str,
    ):
        self.provider = provider
        self.client_key = client_key
        self.base_url = base_url.rstrip("/")
        self.poll_interval_ms = poll_interval_ms
        self.max_poll_times = max_poll_times
        self.feedback_enabled = feedback_enabled
        self.task_type = task_type
        self.website_url = website_url
        self.website_key = website_key
        self.website_title = website_title

    def solve(self, page_action: str) -> Dict[str, Any]:
        task = self._task_payload(page_action)
        created = self._post("/createTask", {"clientKey": self.client_key, "task": task})
        task_id = created.get("taskId")
        if not task_id:
            raise CaptchaSolveError(f"创建 recaptcha 任务失败: {created}")

        for _ in range(self.max_poll_times):
            time.sleep(self.poll_interval_ms / 1000)
            result = self._post("/getTaskResult", {"clientKey": self.client_key, "taskId": task_id})
            if result.get("status") != "ready":
                continue
            solution = result.get("solution") or {}
            token = solution.get("gRecaptchaResponse")
            if not token:
                raise CaptchaSolveError(f"recaptcha 任务已 ready 但没有 gRecaptchaResponse: {result}")
            return {
                "provider": self.provider,
                "task_id": task_id,
                "token": token,
                "user_agent": solution.get("userAgent"),
                "page_action": page_action,
            }
        raise CaptchaSolveError(f"recaptcha 任务轮询超时: taskId={task_id}")

    def feedback(self, solution: Optional[Dict[str, Any]], solved: bool) -> bool:
        if not self.feedback_enabled or not solution or not solution.get("task_id"):
            return False
        payload = {
            "clientKey": self.client_key,
            "solved": solved,
            "task": self._task_payload(solution.get("page_action") or GOOGLE_RECAPTCHA_IMAGE_ACTION),
            "result": {
                "errorId": 0,
                "taskId": solution["task_id"],
                "status": "ready",
            },
        }
        try:
            result = self._post("/feedbackTask", payload)
            return result.get("errorId") == 0
        except CaptchaSolveError:
            return False

    def _task_payload(self, page_action: str) -> Dict[str, Any]:
        task = {
            "type": self.task_type,
            "websiteURL": self.website_url,
            "websiteKey": self.website_key,
            "pageAction": page_action,
        }
        if self.website_title:
            task["websiteTitle"] = self.website_title
        return task

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        result = _json_request(
            "POST",
            self.base_url + path,
            {"User-Agent": "ModelMaster-CapsolverClient/1.0", "Content-Type": "application/json"},
            payload,
        )
        if result.get("errorId") not in (None, 0):
            raise CaptchaSolveError(f"captcha provider error: {result}")
        return result


def image_aspect_ratio(value: str) -> str:
    return {
        "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE",
        "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT",
        "1:1": "IMAGE_ASPECT_RATIO_SQUARE",
    }.get(value, "IMAGE_ASPECT_RATIO_LANDSCAPE")


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
            "User-Agent": user_agent or "ModelMaster-GoogleAIClient/1.0",
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
        client_context = {
            "sessionId": session_id(),
            "projectId": project_id,
            "recaptchaContext": {
                "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
                "token": recaptcha_token,
            },
            "tool": "PINHOLE",
        }
        google_model = google_flow_image_model(model)
        request_item = {
            "clientContext": client_context,
            "seed": random_seed(),
            "imageModelName": google_model,
            "imageAspectRatio": image_aspect_ratio(aspect_ratio),
            "prompt": prompt,
            "imageInputs": [{"name": name, "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE"} for name in (image_media_names or [])],
        }
        if google_model == "NARWHAL":
            request_item["structuredPrompt"] = {"parts": [{"text": prompt}]}
            request_item["prompt"] = None
        payload = {"clientContext": client_context, "requests": [request_item], "useNewMedia": True}
        return _json_request(
            "POST",
            f"{self.base_url}/v1/projects/{project_id}/flowMedia:batchGenerateImages",
            self._headers(user_agent),
            payload,
        )

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
        start_media_id: Optional[str] = None,
        end_media_id: Optional[str] = None,
        reference_media_ids: Optional[List[str]] = None,
        project_id: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        endpoint = {
            "text": "batchAsyncGenerateVideoText",
            "image": "batchAsyncGenerateVideoStartImage",
            "first_last_frames": "batchAsyncGenerateVideoStartAndEndImage",
            "reference_image": "batchAsyncGenerateVideoReferenceImages",
        }[mode]
        client_context = {
            "sessionId": session_id(),
            "projectId": project_id or self.project_id,
            "recaptchaContext": {
                "applicationType": "RECAPTCHA_APPLICATION_TYPE_WEB",
                "token": recaptcha_token,
            },
            "tool": "PINHOLE",
            "userPaygateTier": "PAYGATE_TIER_TWO",
        }
        ai_request = {
            "aspectRatio": video_aspect_ratio(aspect_ratio),
            "seed": random_seed(),
            "textInput": {"prompt": prompt},
            "videoModelKey": model_key,
            "metadata": {"sceneId": str(uuid.uuid4())},
            "startImage": {"mediaId": start_media_id} if start_media_id else None,
            "endImage": {"mediaId": end_media_id} if end_media_id else None,
            "referenceImages": [
                {"imageUsageType": "IMAGE_USAGE_TYPE_ASSET", "mediaId": media_id}
                for media_id in (reference_media_ids or [])
            ] or None,
        }
        payload = {"clientContext": client_context, "requests": [ai_request]}
        return _json_request("POST", f"{self.base_url}/v1/video:{endpoint}", self._headers(user_agent), payload)

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


def _flow_file_name(mime_type: str) -> str:
    if "png" in mime_type:
        return "upload.png"
    if "webp" in mime_type:
        return "upload.webp"
    return "upload.jpeg"


def print_json(data: Dict[str, Any]) -> None:
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
