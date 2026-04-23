#!/usr/bin/env python3
"""Manage hosts.json entries for SSH hosts and per-host services."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_hosts(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "hosts": []}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save_hosts(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def find_host(payload: dict[str, Any], host_id: str) -> dict[str, Any] | None:
    for host in payload.get("hosts", []):
        if host.get("id") == host_id:
            return host
    return None


def find_service(host: dict[str, Any], service_id: str) -> dict[str, Any] | None:
    for service in host.get("services", []):
        if service.get("id") == service_id:
            return service
    return None


def cmd_upsert_host(args: argparse.Namespace) -> int:
    payload = load_hosts(Path(args.hosts))
    host = find_host(payload, args.host_id)
    ssh_auth: dict[str, Any] = {
        "username": args.username,
        "auth_type": args.auth_type,
    }
    if args.auth_type == "password":
        ssh_auth["password"] = args.password
    elif args.key_path:
        ssh_auth["key_path"] = args.key_path
        if args.passphrase:
            ssh_auth["passphrase"] = args.passphrase

    if host:
        host["name"] = args.name or host.get("name")
        host["host"] = args.address or host.get("host")
        host["port"] = args.port or host.get("port", 22)
        host["fingerprint"] = args.fingerprint or host.get("fingerprint")
        host["tags"] = args.tags or host.get("tags", [])
        host["notes"] = args.notes if args.notes is not None else host.get("notes", "")
        host["ssh"] = ssh_auth
        host["services"] = host.get("services", [])
        host["updated_at"] = utc_now()
    else:
        host = {
            "id": args.host_id,
            "name": args.name or args.host_id,
            "host": args.address,
            "port": args.port or 22,
            "fingerprint": args.fingerprint,
            "tags": args.tags or [],
            "notes": args.notes or "",
            "ssh": ssh_auth,
            "services": [],
            "updated_at": utc_now(),
        }
        payload["hosts"].append(host)

    save_hosts(Path(args.hosts), payload)
    print(json.dumps(host, ensure_ascii=True, indent=2))
    return 0


def cmd_delete_host(args: argparse.Namespace) -> int:
    payload = load_hosts(Path(args.hosts))
    before = len(payload.get("hosts", []))
    payload["hosts"] = [host for host in payload.get("hosts", []) if host.get("id") != args.host_id]
    if len(payload["hosts"]) == before:
        raise SystemExit(f"Host '{args.host_id}' was not found.")
    save_hosts(Path(args.hosts), payload)
    print(json.dumps({"deleted": True, "host_id": args.host_id}, ensure_ascii=True))
    return 0


def cmd_upsert_service(args: argparse.Namespace) -> int:
    payload = load_hosts(Path(args.hosts))
    host = find_host(payload, args.host_id)
    if not host:
        raise SystemExit(f"Host '{args.host_id}' was not found.")

    host.setdefault("services", [])
    service = find_service(host, args.service_id)
    service_payload = {
        "id": args.service_id,
        "type": args.service_type,
        "name": args.name or args.service_id,
        "connection": {
            "host": args.address or "127.0.0.1",
            "port": args.port,
            "database": args.database,
        },
        "auth": {
            "username": args.username,
            "password": args.password,
        },
        "extra": parse_extra(args.extra),
    }

    if service:
        service.update(service_payload)
    else:
        host["services"].append(service_payload)

    host["updated_at"] = utc_now()
    save_hosts(Path(args.hosts), payload)
    print(json.dumps(service_payload, ensure_ascii=True, indent=2))
    return 0


def cmd_delete_service(args: argparse.Namespace) -> int:
    payload = load_hosts(Path(args.hosts))
    host = find_host(payload, args.host_id)
    if not host:
        raise SystemExit(f"Host '{args.host_id}' was not found.")
    before = len(host.get("services", []))
    host["services"] = [service for service in host.get("services", []) if service.get("id") != args.service_id]
    if len(host["services"]) == before:
        raise SystemExit(f"Service '{args.service_id}' was not found on host '{args.host_id}'.")
    host["updated_at"] = utc_now()
    save_hosts(Path(args.hosts), payload)
    print(json.dumps({"deleted": True, "host_id": args.host_id, "service_id": args.service_id}, ensure_ascii=True))
    return 0


def parse_extra(raw_pairs: list[str] | None) -> dict[str, str]:
    payload: dict[str, str] = {}
    for item in raw_pairs or []:
        if "=" not in item:
            raise SystemExit(f"Invalid --extra value '{item}'. Expected key=value.")
        key, value = item.split("=", 1)
        payload[key] = value
    return payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage SSH hosts and per-host services.")
    parser.add_argument("--hosts", required=True, help="Path to hosts.json")
    subparsers = parser.add_subparsers(dest="command_name", required=True)

    host_upsert = subparsers.add_parser("upsert-host", help="Create or update a host")
    host_upsert.add_argument("--host-id", required=True)
    host_upsert.add_argument("--name")
    host_upsert.add_argument("--address", required=True)
    host_upsert.add_argument("--port", type=int, default=22)
    host_upsert.add_argument("--fingerprint", required=True)
    host_upsert.add_argument("--username", required=True)
    host_upsert.add_argument("--auth-type", choices=["password", "key"], default="password")
    host_upsert.add_argument("--password")
    host_upsert.add_argument("--key-path")
    host_upsert.add_argument("--passphrase")
    host_upsert.add_argument("--tag", dest="tags", action="append")
    host_upsert.add_argument("--notes")
    host_upsert.set_defaults(func=cmd_upsert_host)

    host_delete = subparsers.add_parser("delete-host", help="Delete a host")
    host_delete.add_argument("--host-id", required=True)
    host_delete.set_defaults(func=cmd_delete_host)

    service_upsert = subparsers.add_parser("upsert-service", help="Create or update a service on a host")
    service_upsert.add_argument("--host-id", required=True)
    service_upsert.add_argument("--service-id", required=True)
    service_upsert.add_argument("--service-type", required=True)
    service_upsert.add_argument("--name")
    service_upsert.add_argument("--address")
    service_upsert.add_argument("--port", type=int, required=True)
    service_upsert.add_argument("--database")
    service_upsert.add_argument("--username")
    service_upsert.add_argument("--password")
    service_upsert.add_argument("--extra", action="append")
    service_upsert.set_defaults(func=cmd_upsert_service)

    service_delete = subparsers.add_parser("delete-service", help="Delete a service from a host")
    service_delete.add_argument("--host-id", required=True)
    service_delete.add_argument("--service-id", required=True)
    service_delete.set_defaults(func=cmd_delete_service)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
