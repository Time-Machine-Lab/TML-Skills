---
name: image-generation
description: Generate or edit images through the TML image gateway. Use when Codex needs text-to-image or image-to-image generation for posters, covers, product images, UI mockups, wallpapers, illustrations, or reference-image edits. Defaults to GPT Image 2.0 via the mm-agent image-gen model configuration, with Jimeng, Nano Banana, and Midjourney available as secondary model-specific fallbacks.
---

# Image Generation

Use this Skill to generate or edit raster images through the shared TML image gateway.

## Default Model

Default to GPT Image 2.0 unless the user explicitly asks for Jimeng, Nano Banana, Midjourney, MJ style output, or a model-specific behavior.

Primary script:

```bash
node skills/image-generation/scripts/gpt_image_2_client.js --prompt "..."
```

The script reads `scripts/api_config.json`, which links to mm-agent's current image model config. Override only when needed:

```bash
IMAGE_API_CONFIG=/abs/path/to/api_config.json node skills/image-generation/scripts/gpt_image_2_client.js --prompt "..."
MM_AGENT_IMAGE_GEN_CONFIG=/abs/path/to/image-gen.json node skills/image-generation/scripts/gpt_image_2_client.js --prompt "..."
```

## Workflow

1. Read `references/common.md`.
2. Use GPT Image 2.0 by default. Read `references/gpt-image-2.md`.
3. Load another reference only when selecting that model:
   - `references/jimeng.md`
   - `references/nano-banana.md`
   - `references/midjourney.md`
4. Prefer `--dry-run` before an unfamiliar parameter combination.
5. Use `--download /abs/path/output.png` when the user needs a file artifact.

## Model Selection

- GPT Image 2.0: default; strong text rendering, realistic UI screenshots, photo-realism, general editing.
- Jimeng Seedream 5.0: use for Chinese prompt fluency, controlled character/storyboard outputs, or batch candidates.
- Nano Banana 2: use for commercial product images, high-resolution packshots, multi-image composition, and retouching.
- Midjourney v7: use for highly stylized concept art or MJ-specific prompt parameters.

## Safety And Secrets

Do not print API keys. If showing config, redact keys. Do not paste generated URLs containing private tokens into public docs.
