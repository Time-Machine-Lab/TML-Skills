---
name: visual-discord-briefing
description: Generate deterministic visual cards and Discord-ready companion payloads (embed + clickable buttons) from structured content.
---

# Visual Discord Briefing Skill

This skill routes requests into one of five deterministic templates:

- `daily_brief`
- `hot_list`
- `weekly_digest`
- `cover_card`
- `profile_card`

## Routing Rules

- “日报 / 今日简报 / 今日速览” -> `daily_brief`
- “热搜 / 榜单 / 排行 / trending” -> `hot_list`
- “周报 / 月报 / digest / roundup” -> `weekly_digest`
- “封面 / 头图 / banner / thumbnail” -> `cover_card`
- “资料卡 / 介绍卡 / profile / 名片” -> `profile_card`

If multiple routes match, prefer the user’s requested output artifact over the data source.

## Shared Envelope

All requests should compile into a thin shared envelope:

```json
{
  "template_type": "daily_brief",
  "goal": "summarize_today_news",
  "tone": "editorial",
  "source_mode": "manual",
  "output": {
    "formats": ["png"],
    "scale": 2
  },
  "meta": {
    "lang": "zh-CN"
  },
  "payload": {}
}
```

Rules:

- `template_type` must be one of the five supported templates
- meaningful content belongs in `payload`
- `output.formats` supports `svg`, `png`, `jpg`, `jpeg`, `webp`
- if the user asks for “图片” without naming a format, prefer `png`
- if the user asks for source plus image, prefer `["svg", "png"]`

## Payload Ownership

Do not force a giant shared schema across templates.

- top-level fields are only for routing and output control
- each template owns its own payload shape
- template-specific required fields are validated in code, not guessed at render time

## Providers

Current provider support:

- `local_json`: load payload fields from a local JSON file and merge explicit `payload` fields on top

Example:

```json
{
  "template_type": "cover_card",
  "source_mode": "local",
  "provider": {
    "type": "local_json",
    "path": "references/examples/cover_card.provider.payload.json"
  },
  "payload": {},
  "output": {
    "formats": ["svg", "png"]
  }
}
```

## IM Clickable Companion

When you need IM-clickable links, add:

```json
{
  "companion": {
    "mode": "im_clickable"
  }
}
```

Behavior:

- renders normal visual outputs (`svg`, `png`, etc.)
- additionally writes `<output>.im.md` with clickable Markdown links
- if `companion.links` is provided, those links are used
- for `hot_list`, links can be inferred from `payload.items[].url`

For Discord webhook delivery, use:

```json
{
  "companion": {
    "mode": "discord_webhook",
    "links": [
      { "label": "Main", "url": "https://example.com/main" }
    ]
  }
}
```

Discord behavior:

- writes `<output>.discord.json`
- includes `embeds` and URL `buttons` (`components`)
- if `links` are omitted and template is `hot_list`, links are inferred from `payload.items[].url`
