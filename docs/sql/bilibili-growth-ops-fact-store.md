# Bilibili Growth Ops SQLite Contract

## Purpose

This document defines the first-release SQLite fact store for `bilibili-growth-ops`.

The database is the source of truth for structured facts.
Task control remains file-based.

## Database File

Default path:

```text
<runtime-root>/db/bilibili-growth-ops.sqlite
```

## Tables

### `meta`

Used for schema versioning and runtime metadata.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `key` | `TEXT` | `PRIMARY KEY` | metadata key |
| `value` | `TEXT` | `NOT NULL` | metadata value |
| `updated_at` | `TEXT` | `NOT NULL` | ISO timestamp |

### `accounts`

One row represents the managed Bilibili account in the first release.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | internal account id |
| `platform` | `TEXT` | `NOT NULL` | fixed as `bilibili` |
| `bilibili_mid` | `TEXT` | `UNIQUE` | Bilibili user id |
| `display_name` | `TEXT` |  | account display name |
| `status` | `TEXT` | `NOT NULL` | `active`, `expired`, `disabled` |
| `profile_json` | `TEXT` | `NOT NULL` | normalized account profile JSON |
| `created_at` | `TEXT` | `NOT NULL` | ISO timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | ISO timestamp |

Indexes:

- unique index on `bilibili_mid`

### `products`

Stores product facts and pointers to the file-based product workspace.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | internal product id |
| `slug` | `TEXT` | `UNIQUE NOT NULL` | stable workspace slug |
| `title` | `TEXT` | `NOT NULL` | product title |
| `status` | `TEXT` | `NOT NULL` | `draft`, `active`, `archived` |
| `summary` | `TEXT` |  | short product summary |
| `resource_path` | `TEXT` | `NOT NULL` | absolute product workspace path |
| `metadata_json` | `TEXT` | `NOT NULL` | extensible structured facts |
| `created_at` | `TEXT` | `NOT NULL` | ISO timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | ISO timestamp |

Indexes:

- unique index on `slug`

### `bilibili_users`

Stores observed Bilibili users.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `mid` | `TEXT` | `PRIMARY KEY` | Bilibili user id |
| `uname` | `TEXT` |  | nickname |
| `face_url` | `TEXT` |  | avatar URL |
| `sign_text` | `TEXT` |  | profile sign |
| `level` | `INTEGER` |  | user level |
| `vip_status` | `INTEGER` |  | VIP status |
| `profile_json` | `TEXT` | `NOT NULL` | normalized user profile JSON |
| `observed_at` | `TEXT` | `NOT NULL` | first observed time |
| `updated_at` | `TEXT` | `NOT NULL` | latest upsert time |

Indexes:

- index on `uname`

### `bilibili_videos`

Stores observed Bilibili videos.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `bvid` | `TEXT` | `PRIMARY KEY` | Bilibili video id |
| `aid` | `INTEGER` | `UNIQUE` | AV id when available |
| `title` | `TEXT` |  | video title |
| `owner_mid` | `TEXT` |  | uploader mid |
| `owner_name` | `TEXT` |  | uploader nickname |
| `description` | `TEXT` |  | normalized description |
| `publish_ts` | `INTEGER` |  | unix timestamp |
| `duration_sec` | `INTEGER` |  | duration in seconds |
| `stat_json` | `TEXT` | `NOT NULL` | normalized stats JSON |
| `raw_json` | `TEXT` | `NOT NULL` | raw source JSON |
| `observed_at` | `TEXT` | `NOT NULL` | first observed time |
| `updated_at` | `TEXT` | `NOT NULL` | latest upsert time |

Indexes:

- unique index on `aid`
- index on `owner_mid`

### `bilibili_comments`

Stores observed comments and replies.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `comment_key` | `TEXT` | `PRIMARY KEY` | internal composite key |
| `oid` | `TEXT` | `NOT NULL` | Bilibili comment object id |
| `rpid` | `TEXT` | `NOT NULL` | reply/comment id |
| `root_rpid` | `TEXT` |  | root comment id |
| `parent_rpid` | `TEXT` |  | parent comment id |
| `bvid` | `TEXT` |  | related video bvid |
| `author_mid` | `TEXT` |  | comment author mid |
| `author_name` | `TEXT` |  | comment author nickname |
| `content` | `TEXT` |  | comment body |
| `like_count` | `INTEGER` |  | like count |
| `reply_count` | `INTEGER` |  | nested reply count |
| `ctime` | `INTEGER` |  | create timestamp |
| `raw_json` | `TEXT` | `NOT NULL` | raw source JSON |
| `observed_at` | `TEXT` | `NOT NULL` | first observed time |
| `updated_at` | `TEXT` | `NOT NULL` | latest upsert time |

Indexes:

- unique index on `oid, rpid`
- index on `bvid`
- index on `author_mid`
- index on `root_rpid`

### `operation_records`

Stores heavyweight outbound actions for review, deduplication, and recovery.

This table is not a catch-all event log.
Read-only actions such as fetching notifications, reading comments, or reading DM history SHOULD NOT be inserted here.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | `TEXT` | `PRIMARY KEY` | internal operation id |
| `account_id` | `TEXT` | `NOT NULL` | acting account id |
| `operation_type` | `TEXT` | `NOT NULL` | e.g. `video_comment`, `comment_reply`, `direct_message` |
| `channel_type` | `TEXT` | `NOT NULL` | e.g. `comment`, `reply`, `dm` |
| `target_type` | `TEXT` | `NOT NULL` | e.g. `video`, `comment`, `user` |
| `target_id` | `TEXT` |  | primary target id |
| `target_user_mid` | `TEXT` |  | related user target |
| `target_video_bvid` | `TEXT` |  | related video target |
| `target_comment_rpid` | `TEXT` |  | related comment target |
| `content` | `TEXT` |  | outbound content |
| `reason` | `TEXT` | `NOT NULL` in behavior | rationale note; keeping it concise and preferably within 100 characters is recommended |
| `dedupe_key` | `TEXT` |  | stable dedupe fingerprint |
| `risk_level` | `TEXT` | `NOT NULL` | `low`, `medium`, `high` |
| `status` | `TEXT` | `NOT NULL` | `sent`, `skipped`, `failed`, `draft` |
| `external_id` | `TEXT` |  | upstream action id if known |
| `metadata_json` | `TEXT` | `NOT NULL` | extensible metadata JSON |
| `operation_at` | `TEXT` | `NOT NULL` | ISO timestamp of the action decision |
| `created_at` | `TEXT` | `NOT NULL` | ISO timestamp |

Indexes:

- index on `account_id, operation_type, created_at`
- index on `target_user_mid, operation_type`
- index on `target_video_bvid, operation_type`
- index on `target_comment_rpid, operation_type`
- index on `dedupe_key`

## Storage Rules

- `Account`, `Product`, `BilibiliUser`, `BilibiliVideo`, `BilibiliComment`, and `OperationRecord` MUST live in SQLite.
- Session cookie material MUST NOT live in SQLite in the first release.
- Task control files MUST NOT be represented as heavy database objects.
- `operation_records` MUST be queryable by account, target, and action type.
- `operation_records` SHOULD only store heavyweight outbound actions such as `video_comment`, `comment_reply`, and `direct_message`.
- Each `operation_records.reason` value MUST explain the action basis or purpose; keeping it concise and preferably within 100 characters is recommended.

## Deduplication Rules

- Before a real outbound action, the system SHOULD query `operation_records`.
- A dedupe query MAY use:
  - `dedupe_key`
  - `account_id + operation_type + target_*`
  - an optional time window
- The first release SHOULD treat SQLite facts as the primary dedupe source, not logs.
