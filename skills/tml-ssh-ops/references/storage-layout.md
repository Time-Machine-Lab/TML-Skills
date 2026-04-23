# Storage Layout

Use three files for the lightweight workflow:

- `hosts.json`
- `approvals.json`
- `audit.jsonl`

## hosts.json

Store SSH host entries and service credentials.

Top-level shape:

```json
{
  "version": 1,
  "hosts": []
}
```

Each host should include:

- `id`
- `name`
- `host`
- `port`
- `fingerprint`
- `tags`
- `notes`
- `ssh`
- `services`
- `updated_at`

Keep SSH credentials under `ssh`:

```json
{
  "username": "root",
  "auth_type": "password",
  "password": "example-password"
}
```

Keep service credentials under `services[]`. Each service should include:

- `id`
- `type`
- `name`
- `connection`
- `auth`
- `extra`

## approvals.json

Store exact-match approval records for dangerous commands.

Top-level shape:

```json
{
  "version": 1,
  "requests": []
}
```

Each approval record should include:

- `id`
- `host_id`
- `command`
- `risk_level`
- `reason`
- `status`
- `requested_by`
- `approved_by`
- `used`
- `created_at`
- `approved_at`
- `expires_at`

Use `status` values such as:

- `pending`
- `approved`
- `rejected`
- `expired`

## audit.jsonl

Append one JSON object per line. Recommended fields:

- `time`
- `user`
- `action`
- `host_id`
- `command`
- `risk`
- `approval_id`
- `result`
- `details`

Use append-only writes for the audit file.
