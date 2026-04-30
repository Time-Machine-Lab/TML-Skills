# Jimeng Seedream 5.0

Use Jimeng when the user asks for Seedream/即梦, Chinese prompt fluency, character consistency, storyboards, or multiple candidates.

## Script

```bash
node skills/image-generation/scripts/jimeng_api_client.js
```

## Example

```bash
node skills/image-generation/scripts/jimeng_api_client.js \
  --prompt "一张中文电商海报，主体是一瓶高端护肤精华，干净浅色背景" \
  --size "2K" \
  --n 1 \
  --download "output/jimeng.png"
```

## Parameters

- `--prompt` required.
- `--image` optional, repeatable. Supports local path, URL, or data URI.
- `--n` optional, `1` to `4`, default `1`.
- `--size` optional, default `2K`.
- `--model-id` optional, default comes from config provider `jimeng.default_id`.
- `--model` optional, overrides the provider model name.
- `--response-format` optional, `url` or `b64_json`.
- `--seed`, `--guidance-scale`, `--watermark` optional provider controls.
- `--download`, `--timeout`, `--retry`, `--retry-delay`, `--dry-run` supported.
