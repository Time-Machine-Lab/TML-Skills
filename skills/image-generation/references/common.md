# Image Generation Common Reference

## Runtime

- Use Node.js 18+; Node 22 is preferred.
- Default config file: `skills/image-generation/scripts/api_config.json`.
- Default config links to `/Users/mac/Code/mm-agent/agent-module/src/main/resources/model-config/image-gen.json`.
- Override config with `IMAGE_API_CONFIG=/abs/path/to/api_config.json`.
- Override the linked mm-agent model config with `MM_AGENT_IMAGE_GEN_CONFIG=/abs/path/to/image-gen.json`.

## Config Shape

The scripts understand mm-agent's grouped provider config:

- `gpt_image_2.default_id`, `gpt_image_2.models[]`
- `jimeng.default_id`, `jimeng.models[]`
- `nano_banana.default_id`, `nano_banana.models[]`
- `mj.default_id`, `mj.models[]`

Each model entry should provide `base_url`, `api_key`, and either `model_name` or provider-specific fields.

Do not print API keys. Redact them in logs and reports.

## Reliability Flags

All scripts support:

- `--timeout` request timeout in seconds.
- `--retry` retry count, non-negative integer.
- `--retry-delay` base retry delay in milliseconds.
- `--dry-run` validate config, resolved model, endpoint, and payload without calling the API.

Retries apply to network failures, timeouts, 429, and transient 5xx responses.

## Output

- Scripts print full JSON to stdout.
- Progress and diagnostics go to stderr.
- `--download` saves returned `url` or `b64_json` images to disk.
- Multi-image responses are saved as `name_0.ext`, `name_1.ext`, etc.

## Shell Quoting

Quote prompts. In PowerShell, prefer single quotes:

```powershell
--prompt 'A clean product poster with Chinese text'
```
