# Midjourney v7

Use Midjourney when the user asks for MJ/Midjourney aesthetics, highly stylized concept art, or MJ prompt parameters.

## Script

```bash
node skills/image-generation/scripts/mj_imagine_client.js
```

## Example

```bash
node skills/image-generation/scripts/mj_imagine_client.js \
  --prompt "cinematic cyberpunk city at night, rain, neon reflections --ar 16:9 --v 7" \
  --download "output/mj.png" \
  --download-mode grid
```

## Parameters

- `--prompt` required. Put MJ parameters such as `--ar`, `--v`, `--stylize`, `--chaos`, and `--seed` inside the prompt.
- `--image-path` optional, repeatable. Supports local path, URL, or data URI.
- `--model-id` optional, default comes from config provider `mj.default_id`.
- `--route-prefix` optional, default `fast`.
- `--no-poll` submits only.
- `--poll-interval`, `--poll-timeout` control task polling.
- `--download-mode` optional, `grid`, `single`, or `both`.
- `--download`, `--timeout`, `--retry`, `--retry-delay`, `--dry-run` supported.

If the prompt does not specify `--v` or `--version`, the script appends `--v 7`.
