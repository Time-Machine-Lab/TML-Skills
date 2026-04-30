# GPT Image 2.0

Use GPT Image 2.0 as the default generator.

## Script

```bash
node skills/image-generation/scripts/gpt_image_2_client.js
```

## Text To Image

```bash
node skills/image-generation/scripts/gpt_image_2_client.js \
  --prompt "A photorealistic product hero shot, clean studio lighting" \
  --aspect-ratio "1:1" \
  --quality low \
  --download "output/gpt-image-2.png"
```

## Image Editing

Use `--image` for one or more local paths, remote URLs, or data URIs. Local and remote images are uploaded through `/v1/images/edits`.

```bash
node skills/image-generation/scripts/gpt_image_2_client.js \
  --image "input/reference.png" \
  --prompt "Keep the product unchanged, replace the background with a clean white studio set" \
  --aspect-ratio "1:1" \
  --quality high \
  --download "output/edited.png"
```

## Parameters

- `--prompt` required.
- `--image` optional, repeatable. Presence switches to image-edit mode.
- `--aspect-ratio` optional, default `1:1`.
- `--quality` optional, `low` or `high`, default `low`.
- `--response-format` optional, `url` or `b64_json`, default `url`.
- `--model-id` optional, default comes from config provider `gpt_image_2.default_id`.
- `--model` optional, overrides the provider model name.
- `--download` optional.
- `--timeout`, `--retry`, `--retry-delay` optional reliability controls.
- `--dry-run` validates config and payload without calling the API.

Supported aspect ratios:

`4:3`, `3:4`, `16:9`, `9:16`, `2:3`, `3:2`, `1:1`, `4:5`, `5:4`, `21:9`, `9:21`

The script maps ratios to the provider sizes used by mm-agent.
