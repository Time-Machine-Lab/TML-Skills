# Nano Banana 2

Use Nano Banana for commercial product images, high-resolution packshots, multi-image composition, and retouching.

## Text To Image

```bash
node skills/image-generation/scripts/nanabana_api_client.js \
  --prompt "A premium skincare bottle packshot, glossy label, soft daylight, white background" \
  --resolution 2K \
  --aspect-ratio "1:1" \
  --download "output/nano-banana.png"
```

## Image To Image

```bash
node skills/image-generation/scripts/nanabana_img2img_client.js \
  --image-path "input/product.png" \
  --prompt "Keep the product identity, create a premium campaign poster background" \
  --resolution 2K \
  --download "output/nano-banana-edit.png"
```

## Parameters

- `--prompt` required.
- `--resolution` optional, `1K`, `2K`, or `4K`; default `2K`.
- `--image-size` is kept as a compatibility alias for `--resolution`.
- `--aspect-ratio` optional, default `1:1`.
- `--model-id` optional. If omitted, scripts select `nano-banana-1k`, `nano-banana-2k`, or `nano-banana-4k` from resolution.
- `--model` optional, overrides the provider model name.
- `--download`, `--timeout`, `--retry`, `--retry-delay`, `--dry-run` supported.
