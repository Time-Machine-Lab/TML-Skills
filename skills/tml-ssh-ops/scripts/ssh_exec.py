#!/usr/bin/env python3
"""Execute SSH commands with fingerprint verification, risk checks, approval gating, and audit logging."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import classify_command
import check_approval


def load_paramiko():
    try:
        import paramiko  # type: ignore
    except ImportError as exc:  # pragma: no cover - environment-specific
        raise SystemExit(
            "paramiko is required. Install it with: python -m pip install paramiko"
        ) from exc
    return paramiko


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, empty_key: str) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, empty_key: []}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def append_audit(path: Path, payload: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def find_host(payload: dict[str, Any], host_id: str) -> dict[str, Any]:
    for host in payload.get("hosts", []):
        if host.get("id") == host_id:
            return host
    raise SystemExit(f"Host '{host_id}' was not found.")


def build_fingerprint(server_key) -> str:
    encoded = base64.b64encode(server_key.asbytes()).decode("ascii")
    return f"{server_key.get_name()} {encoded}"


def add_verified_host_key(paramiko, ssh, host: dict[str, Any]) -> None:
    fingerprint = str(host.get("fingerprint") or "").strip()
    try:
        key_type, key_data = fingerprint.split(None, 1)
        key = paramiko.PKey.from_type_string(key_type, base64.b64decode(key_data))
    except Exception as exc:
        raise SystemExit(f"Invalid stored fingerprint for '{host['id']}': {exc}") from exc

    hostname = host["host"]
    port = int(host.get("port", 22))
    ssh.get_host_keys().add(hostname, key_type, key)
    if port != 22:
        ssh.get_host_keys().add(f"[{hostname}]:{port}", key_type, key)


def verify_fingerprint(paramiko, host: dict[str, Any], timeout: int):
    transport = paramiko.Transport((host["host"], int(host.get("port", 22))))
    try:
        transport.banner_timeout = timeout
        transport.start_client(timeout=timeout)
        remote_key = transport.get_remote_server_key()
        actual = build_fingerprint(remote_key)
    finally:
        transport.close()

    expected = str(host.get("fingerprint") or "").strip()
    if not expected:
        raise SystemExit(f"Host '{host['id']}' is missing a fingerprint.")
    if actual != expected:
        raise SystemExit(
            f"Fingerprint mismatch for '{host['id']}'. Expected '{expected}' but got '{actual}'."
        )
    return actual


def get_ssh_credentials(host: dict[str, Any], password_override: str | None) -> tuple[str, dict[str, Any]]:
    ssh = host.get("ssh") or {}
    username = ssh.get("username")
    if not username:
        raise SystemExit(f"Host '{host['id']}' is missing ssh.username.")
    auth_type = ssh.get("auth_type", "password")
    if auth_type == "password":
        password = password_override or ssh.get("password")
        if not password:
            raise SystemExit(f"Host '{host['id']}' is missing an SSH password.")
        return str(username), {"password": str(password)}
    if auth_type == "key":
        key_path = ssh.get("key_path")
        if not key_path:
            raise SystemExit(f"Host '{host['id']}' is missing ssh.key_path.")
        return str(username), {
            "key_path": str(key_path),
            "passphrase": ssh.get("passphrase"),
        }
    raise SystemExit(f"Unsupported ssh.auth_type '{auth_type}' on host '{host['id']}'.")


def load_private_key(paramiko, key_path: str, passphrase: str | None):
    key_loaders = [
        paramiko.Ed25519Key,
        paramiko.RSAKey,
        paramiko.ECDSAKey,
    ]
    last_error: Exception | None = None
    for loader in key_loaders:
        try:
            return loader.from_private_key_file(key_path, password=passphrase)
        except Exception as exc:  # pragma: no cover - key format varies
            last_error = exc
    raise SystemExit(f"Unable to load private key '{key_path}': {last_error}")


def exec_remote_command(paramiko, host: dict[str, Any], command: str, timeout: int, password_override: str | None):
    ssh = paramiko.SSHClient()
    add_verified_host_key(paramiko, ssh, host)
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())

    username, auth = get_ssh_credentials(host, password_override)
    connect_kwargs: dict[str, Any] = {
        "hostname": host["host"],
        "port": int(host.get("port", 22)),
        "username": username,
        "timeout": timeout,
        "look_for_keys": False,
        "allow_agent": False,
    }
    if "password" in auth:
        connect_kwargs["password"] = auth["password"]
    else:
        connect_kwargs["pkey"] = load_private_key(paramiko, auth["key_path"], auth.get("passphrase"))

    ssh.connect(**connect_kwargs)
    try:
        stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
        exit_code = stdout.channel.recv_exit_status()
        output = stdout.read().decode("utf-8", errors="replace")
        error = stderr.read().decode("utf-8", errors="replace")
        return exit_code, output, error
    finally:
        ssh.close()


def find_matching_approval(payload: dict[str, Any], host_id: str, command: str) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    for request in payload.get("requests", []):
        if request.get("host_id") != host_id:
            continue
        if request.get("command") != command:
            continue
        if request.get("status") != "approved":
            continue
        if bool(request.get("used")):
            continue
        expires_at = check_approval.parse_utc(request.get("expires_at"))
        if expires_at and expires_at <= now:
            continue
        return request
    return None


def mark_approval_used(path: Path, host_id: str, command: str) -> str | None:
    payload = load_json(path, "requests")
    approval = find_matching_approval(payload, host_id, command)
    if not approval:
        return None
    approval["used"] = True
    approval["used_at"] = utc_now()
    save_json(path, payload)
    return str(approval.get("id"))


def build_audit_event(args: argparse.Namespace, host_id: str, command: str, risk: str, result: str, approval_id: str | None, details: str) -> dict[str, Any]:
    return {
        "time": utc_now(),
        "user": args.actor,
        "action": "run_command",
        "host_id": host_id,
        "command": command,
        "risk": risk,
        "approval_id": approval_id,
        "result": result,
        "details": details,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Execute SSH commands with policy checks.")
    parser.add_argument("--hosts", required=True, help="Path to hosts.json")
    parser.add_argument("--approvals", required=True, help="Path to approvals.json")
    parser.add_argument("--audit", required=True, help="Path to audit.jsonl")
    parser.add_argument("--host-id", required=True, help="Host id from hosts.json")
    parser.add_argument("--command", required=True, help="Remote command to execute")
    parser.add_argument("--actor", default="unknown", help="Actor name for audit logging")
    parser.add_argument("--timeout", type=int, default=10, help="SSH timeout in seconds")
    parser.add_argument("--confirm-sensitive", action="store_true", help="Allow sensitive commands to run")
    parser.add_argument("--password-env", help="Optional env var that overrides the stored SSH password")
    args = parser.parse_args()

    command_info = classify_command.classify(args.command)
    risk = command_info["risk"]
    approval_id: str | None = None

    hosts_payload = load_json(Path(args.hosts), "hosts")
    host = find_host(hosts_payload, args.host_id)

    password_override = None
    if args.password_env:
        password_override = os.environ.get(args.password_env)

    if risk == "sensitive" and not args.confirm_sensitive:
        append_audit(
            Path(args.audit),
            build_audit_event(args, args.host_id, args.command, risk, "blocked", None, "Sensitive command requires --confirm-sensitive"),
        )
        raise SystemExit("Sensitive command requires --confirm-sensitive.")

    if risk == "dangerous":
        approvals_payload = load_json(Path(args.approvals), "requests")
        approval_result = check_approval.check_approval(approvals_payload, args.host_id, args.command)
        if not approval_result["allowed"]:
            append_audit(
                Path(args.audit),
                build_audit_event(args, args.host_id, args.command, risk, "blocked", None, approval_result["reason"]),
            )
            raise SystemExit("Dangerous command is blocked pending exact approval.")
        approval_id = approval_result["approval_id"]

    paramiko = load_paramiko()
    fingerprint = verify_fingerprint(paramiko, host, args.timeout)

    try:
        exit_code, output, error = exec_remote_command(
            paramiko,
            host,
            args.command,
            args.timeout,
            password_override,
        )
    except Exception as exc:
        append_audit(
            Path(args.audit),
            build_audit_event(args, args.host_id, args.command, risk, "error", approval_id, f"{type(exc).__name__}: {exc}"),
        )
        raise

    if risk == "dangerous" and exit_code == 0:
        approval_id = mark_approval_used(Path(args.approvals), args.host_id, args.command) or approval_id

    append_audit(
        Path(args.audit),
        build_audit_event(
            args,
            args.host_id,
            args.command,
            risk,
            "success" if exit_code == 0 else "failed",
            approval_id,
            f"fingerprint verified; exit_code={exit_code}",
        ),
    )

    meta = {
        "host_id": args.host_id,
        "risk": risk,
        "reason": command_info["reason"],
        "approval_id": approval_id,
        "fingerprint": fingerprint,
        "exit_code": exit_code,
    }
    print(json.dumps(meta, ensure_ascii=True))
    if output:
        sys.stdout.write(output)
    if error:
        sys.stderr.write(error)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
