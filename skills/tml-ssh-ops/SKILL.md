---
name: tml-ssh-ops
description: Manage SSH operations with local JSON storage, host and service credentials, command risk classification, approval-gated dangerous commands, and audit logging. Use when Codex needs to add or update SSH hosts, store per-host service credentials such as MySQL or Redis accounts, classify a remote command before execution, verify whether a dangerous command has exact approval, or organize a lightweight SSH workflow inside OpenClaw without building a full MCP service.
---

# TML SSH Ops

## Overview

Use this skill to run a lightweight team SSH workflow backed by local JSON files instead of a database. Keep the workflow simple: store host and service credentials in `hosts.json`, require exact one-time approval for dangerous commands, and append every action to `audit.jsonl`.

## Core Rules

- Keep the real safety boundary in scripts, not in free-form reasoning alone.
- Treat `hosts.json` as the source of truth for SSH hosts and per-host service credentials.
- Support multiple services per host. Keep SSH credentials under `ssh` and service credentials under `services[]`.
- Do not return stored passwords in normal summaries unless the user explicitly asks to inspect them.
- Require host fingerprint verification before running remote commands. Do not auto-trust a changed fingerprint.
- Treat dangerous commands as blocked unless there is an exact approved record for the same `host_id` and exact command text.
- Mark approved dangerous commands as used after one successful execution.
- Append every approval and execution event to `audit.jsonl`.
- Ignore concurrency concerns for this skill version. Do not add file locking unless the user later asks for it.

## Workflow

1. Identify the target host.
Use an existing host entry when possible. If the host does not exist yet, add it to `hosts.json` with SSH information and any known service credentials.

2. Inspect the intended action.
Classify the command with `scripts/classify_command.py` before presenting or running it.

3. Decide the execution path.
- `safe`: allow execution after confirming the resolved host.
- `sensitive`: warn clearly and confirm the intent.
- `dangerous`: require an approval record that matches the exact command and host.

4. Check approval for dangerous work.
Use `scripts/check_approval.py` against `approvals.json`. Only proceed when the result is valid, unused, and unexpired.

5. Record the action.
Append a JSON line to `audit.jsonl` for command execution, approval creation, approval grant, approval rejection, or approval consumption.

6. Execute through the policy-aware SSH wrapper.
Use `scripts/ssh_exec.py` so fingerprint verification, command classification, approval checks, and audit logging all happen in one place.

## Storage Layout

Use the example files in `assets/` as the starting structure:

- `assets/hosts.example.json`
- `assets/approvals.example.json`
- `assets/audit.example.jsonl`

Read [references/storage-layout.md](./references/storage-layout.md) when creating or extending the JSON files.

Use `scripts/manage_hosts.py` to create, update, or remove hosts and per-host services:

```powershell
python .\scripts\manage_hosts.py `
  --hosts .\hosts.json `
  upsert-host `
  --host-id prod-api-1 `
  --name "Production API 1" `
  --address 10.0.0.10 `
  --port 22 `
  --fingerprint "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAEXAMPLE" `
  --username root `
  --auth-type password `
  --password "example-root-password" `
  --tag prod `
  --tag api
```

```powershell
python .\scripts\manage_hosts.py `
  --hosts .\hosts.json `
  upsert-service `
  --host-id prod-api-1 `
  --service-id mysql-main `
  --service-type mysql `
  --name "Main MySQL" `
  --address 127.0.0.1 `
  --port 3306 `
  --username root `
  --password "example-mysql-password"
```

## Command Safety

Use `scripts/classify_command.py` to classify a command before execution:

```powershell
python .\scripts\classify_command.py --command "df -h"
python .\scripts\classify_command.py --command "systemctl restart nginx"
python .\scripts\classify_command.py --command "rm -rf /tmp/test-dir"
```

Read [references/risk-policy.md](./references/risk-policy.md) when the command looks ambiguous or the team wants to tune categories.

## Approval Checks

Use `scripts/check_approval.py` to verify exact-match approval for dangerous commands:

```powershell
python .\scripts\check_approval.py `
  --approvals .\approvals.json `
  --host-id prod-api-1 `
  --command "rm -rf /tmp/test-dir"
```

Treat approval as valid only when all of the following are true:

- `status` is `approved`
- `used` is `false`
- `expires_at` is in the future or `null`
- `host_id` matches exactly
- `command` matches exactly

## SSH Execution

Use `scripts/ssh_exec.py` for the real execution path:

```powershell
python .\scripts\ssh_exec.py `
  --hosts .\hosts.json `
  --approvals .\approvals.json `
  --audit .\audit.jsonl `
  --host-id prod-api-1 `
  --command "df -h" `
  --actor alice
```

Sensitive commands require `--confirm-sensitive`:

```powershell
python .\scripts\ssh_exec.py `
  --hosts .\hosts.json `
  --approvals .\approvals.json `
  --audit .\audit.jsonl `
  --host-id prod-api-1 `
  --command "systemctl restart nginx" `
  --actor alice `
  --confirm-sensitive
```

## Expected JSON Shape

Keep SSH credentials and service credentials separate inside each host entry.

- `ssh`: SSH username and authentication details for the machine itself
- `services[]`: per-host service credentials such as MySQL, Redis, PostgreSQL, or internal apps

Example service layout:

```json
{
  "id": "mysql-main",
  "type": "mysql",
  "name": "Main MySQL",
  "connection": {
    "host": "127.0.0.1",
    "port": 3306,
    "database": null
  },
  "auth": {
    "username": "root",
    "password": "example-password"
  },
  "extra": {}
}
```

## Output Expectations

- For host updates, show the host id, host, port, SSH username, tags, and available services.
- For service credential updates, show the host id plus the saved service id, type, and connection target.
- For command checks, show the risk level and the matching rule or pattern.
- For dangerous commands without approval, explain that the command is blocked pending approval.
- For dangerous commands with approval, show which approval id matched and remind that it is one-time use.
