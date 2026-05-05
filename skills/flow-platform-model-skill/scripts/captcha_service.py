#!/usr/bin/env python3
"""Captcha service abstraction for Flow platform generation.

Generation scripts should depend on get/feedback behavior, not on a concrete
captcha provider. Provider credentials live in a separate captcha config file
or environment variables; one-time captcha tokens should not be stored in the
account profile.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Optional, TypeVar


DEFAULT_CAPTCHA_FILE = Path(__file__).resolve().parents[1] / "secrets" / "captcha.local.json"
GOOGLE_RECAPTCHA_WEBSITE_URL = "https://labs.google/"
GOOGLE_RECAPTCHA_WEBSITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV"
GOOGLE_RECAPTCHA_IMAGE_ACTION = "IMAGE_GENERATION"
GOOGLE_RECAPTCHA_VIDEO_ACTION = "VIDEO_GENERATION"
RECAPTCHA_RETRY_REASONS = {
    "PUBLIC_ERROR_SOMETHING_WENT_WRONG",
    "PUBLIC_ERROR_UNUSUAL_ACTIVITY",
}

T = TypeVar("T")


class CaptchaError(RuntimeError):
    pass


@dataclass
class CaptchaSolution:
    token: str
    user_agent: Optional[str] = None
    task_id: Optional[str] = None
    provider: str = "manual"
    page_action: Optional[str] = None


class CaptchaProvider:
    name = "base"

    def solve(self, page_action: str) -> CaptchaSolution:
        raise NotImplementedError

    def feedback(self, solution: Optional[CaptchaSolution], solved: bool) -> bool:
        return False


class ManualCaptchaProvider(CaptchaProvider):
    name = "manual"

    def __init__(self, token: str, user_agent: Optional[str] = None):
        self.token = token
        self.user_agent = user_agent

    def solve(self, page_action: str) -> CaptchaSolution:
        return CaptchaSolution(
            token=self.token,
            user_agent=self.user_agent,
            provider=self.name,
            page_action=page_action,
        )


class CapsolverCaptchaProvider(CaptchaProvider):
    name = "capsolver"

    def __init__(
        self,
        client_key: str,
        base_url: str = "https://api.capsolver.com",
        poll_interval_ms: int = 4000,
        max_poll_times: int = 6,
        feedback_enabled: bool = True,
        task_type: str = "ReCaptchaV3TaskProxyLess",
        website_url: str = GOOGLE_RECAPTCHA_WEBSITE_URL,
        website_key: str = GOOGLE_RECAPTCHA_WEBSITE_KEY,
    ):
        self.client_key = client_key
        self.base_url = base_url.rstrip("/")
        self.poll_interval_ms = poll_interval_ms
        self.max_poll_times = max_poll_times
        self.feedback_enabled = feedback_enabled
        self.task_type = task_type
        self.website_url = website_url
        self.website_key = website_key

    def solve(self, page_action: str) -> CaptchaSolution:
        task = self._task_payload(page_action)
        created = self._post("/createTask", {"clientKey": self.client_key, "task": task})
        task_id = created.get("taskId")
        if not task_id:
            raise CaptchaError(f"创建 captcha 任务失败: {created}")

        for _ in range(self.max_poll_times):
            time.sleep(self.poll_interval_ms / 1000)
            result = self._post("/getTaskResult", {"clientKey": self.client_key, "taskId": task_id})
            if result.get("status") != "ready":
                continue
            solution = result.get("solution") or {}
            token = solution.get("gRecaptchaResponse")
            if not token:
                raise CaptchaError(f"captcha 任务已 ready 但没有 gRecaptchaResponse: {result}")
            return CaptchaSolution(
                token=token,
                user_agent=solution.get("userAgent"),
                task_id=task_id,
                provider=self.name,
                page_action=page_action,
            )
        raise CaptchaError(f"captcha 任务轮询超时: taskId={task_id}")

    def feedback(self, solution: Optional[CaptchaSolution], solved: bool) -> bool:
        if not self.feedback_enabled or not solution or not solution.task_id:
            return False
        payload = {
            "clientKey": self.client_key,
            "solved": solved,
            "task": self._task_payload(solution.page_action or GOOGLE_RECAPTCHA_IMAGE_ACTION),
            "result": {
                "errorId": 0,
                "taskId": solution.task_id,
                "status": "ready",
            },
        }
        try:
            result = self._post("/feedbackTask", payload)
            return result.get("errorId") == 0
        except CaptchaError:
            return False

    def _task_payload(self, page_action: str) -> Dict[str, Any]:
        return {
            "type": self.task_type,
            "websiteURL": self.website_url,
            "websiteKey": self.website_key,
            "pageAction": page_action,
        }

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        result = _json_post(
            self.base_url + path,
            {"User-Agent": "FlowPlatformSkill-CaptchaClient/1.0", "Content-Type": "application/json"},
            payload,
        )
        if result.get("errorId") not in (None, 0):
            raise CaptchaError(f"captcha provider error: {result}")
        return result


def load_captcha_config(config_file: Optional[str]) -> Dict[str, Any]:
    path = Path(config_file).expanduser() if config_file else DEFAULT_CAPTCHA_FILE
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise CaptchaError(f"验证码配置 JSON 格式错误: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise CaptchaError(f"验证码配置必须是对象: {path}")
    return data


def build_captcha_provider(
    config_file: Optional[str] = None,
    provider_name: Optional[str] = None,
    token_override: Optional[str] = None,
    user_agent_override: Optional[str] = None,
) -> CaptchaProvider:
    if token_override:
        return ManualCaptchaProvider(token_override, user_agent_override)

    config = load_captcha_config(config_file)
    provider = (provider_name or os.environ.get("FLOW_CAPTCHA_PROVIDER") or config.get("provider") or "capsolver").lower()
    if provider == "capsolver":
        client_key = first_value(os.environ.get("CAPSOLVER_CLIENT_KEY"), config.get("client_key"), config.get("key"))
        if not client_key:
            raise CaptchaError("缺少 Capsolver client_key：请设置 CAPSOLVER_CLIENT_KEY，或在 secrets/captcha.local.json 中配置")
        return CapsolverCaptchaProvider(
            client_key=client_key,
            base_url=config.get("base_url") or "https://api.capsolver.com",
            poll_interval_ms=int(config.get("poll_interval_ms") or 4000),
            max_poll_times=int(config.get("max_poll_times") or 6),
            feedback_enabled=as_bool(config.get("feedback_enabled"), True),
            task_type=config.get("task_type") or "ReCaptchaV3TaskProxyLess",
            website_url=config.get("website_url") or GOOGLE_RECAPTCHA_WEBSITE_URL,
            website_key=config.get("website_key") or GOOGLE_RECAPTCHA_WEBSITE_KEY,
        )
    raise CaptchaError(f"暂不支持的 captcha provider: {provider}")


def run_with_captcha(
    provider: CaptchaProvider,
    page_action: str,
    call: Callable[[CaptchaSolution], T],
    is_retryable_error: Callable[[Exception], bool],
    max_retry_times: int = 3,
) -> T:
    attempts = max_retry_times + 1
    for attempt in range(attempts):
        solution = provider.solve(page_action)
        try:
            result = call(solution)
            provider.feedback(solution, True)
            return result
        except Exception as exc:
            retryable = is_retryable_error(exc)
            if retryable:
                provider.feedback(solution, False)
            if retryable and attempt < attempts - 1 and provider.name != "manual":
                continue
            raise
    raise CaptchaError("captcha retry exhausted")


def is_recaptcha_retry_error(exc: Exception) -> bool:
    reason = str(exc)
    status = getattr(exc, "status", None)
    return reason.endswith("403") or reason in RECAPTCHA_RETRY_REASONS or status == 403


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


def _json_post(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    for key, value in headers.items():
        request.add_header(key, value)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
            if response.status != 200:
                raise CaptchaError(f"HTTP {response.status} from {url}: {raw}")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise CaptchaError(f"HTTP {exc.code} from {url}: {raw}") from exc
    except urllib.error.URLError as exc:
        raise CaptchaError(f"request failed for {url}: {exc.reason}") from exc
