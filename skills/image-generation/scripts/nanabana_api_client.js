#!/usr/bin/env node
const { parseArgs } = require("node:util");
const {
  mergePromptWithPositionals,
  parseRetryOptions,
  requestJson,
  resolveConfigPath,
  resolveNanoBananaRuntime,
  saveImageResults,
} = require("./lib/image_api_common");

const DEFAULT_BASE_URL = "https://api.bltcy.top";

function buildPayload(values) {
  const payload = {
    model: values.model,
    prompt: values.prompt,
    response_format: values["response-format"],
  };

  if (values["aspect-ratio"]) {
    payload.aspect_ratio = values["aspect-ratio"];
  }
  if (values["image-size"]) {
    payload.image_size = values["image-size"];
  }

  return payload;
}

async function main() {
  const scriptDir = __dirname;
  const configPath = resolveConfigPath(scriptDir);

  let parsed;
  try {
    parsed = parseArgs({
      options: {
        prompt: { type: "string" },
        "model-id": { type: "string", default: "" },
        model: { type: "string", default: "" },
        "response-format": { type: "string", default: "url" },
        "aspect-ratio": { type: "string", default: "1:1" },
        resolution: { type: "string", default: "2K" },
        "image-size": { type: "string" },
        download: { type: "string", default: "" },
        timeout: { type: "string", default: "120" },
        retry: { type: "string", default: "2" },
        "retry-delay": { type: "string", default: "800" },
        "dry-run": { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    console.error(`Argument parsing error: ${error.message}`);
    if (/unexpected argument/i.test(String(error.message || ""))) {
      console.error("PowerShell tip: use single quotes for prompts with spaces, e.g. --prompt 'A B C'.");
    }
    return 2;
  }

  const { values, positionals } = parsed;
  const promptResult = mergePromptWithPositionals(values.prompt, positionals);
  const prompt = promptResult.prompt;

  if (promptResult.merged) {
    console.error("Detected extra positional arguments. Auto-merged into --prompt.");
    console.error("PowerShell tip: use single quotes for prompts with spaces, e.g. --prompt 'A B C'.");
  }

  if (!prompt) {
    console.error("Missing required argument: --prompt");
    return 2;
  }

  if (!["url", "b64_json"].includes(values["response-format"])) {
    console.error("Invalid --response-format. Use: url or b64_json");
    return 2;
  }

  const resolution = String(values.resolution || values["image-size"] || "2K").trim().toUpperCase();
  if (!["1K", "2K", "4K"].includes(resolution)) {
    console.error("Invalid --resolution/--image-size. Use: 1K, 2K, or 4K");
    return 2;
  }

  const timeout = Number.parseInt(values.timeout, 10);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    console.error("Invalid --timeout value");
    return 2;
  }
  let retryOptions;
  try {
    retryOptions = parseRetryOptions(values);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const { retry, retryDelay } = retryOptions;

  let runtime;
  try {
    runtime = resolveNanoBananaRuntime(configPath, { ...values, resolution }, DEFAULT_BASE_URL);
  } catch (error) {
    console.error(`Config error: ${error.message}`);
    return 2;
  }

  const payload = buildPayload({
    ...values,
    prompt,
    model: values.model || runtime.modelName,
    "image-size": resolution,
  });
  const url = `${runtime.baseUrl}/v1/images/generations`;

  console.error(`Calling API: ${url}`);
  console.error(`Model: ${payload.model}`);
  console.error(`Payload: ${JSON.stringify(payload)}`);
  console.error("Generating image... please wait.");

  if (values["dry-run"]) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      endpoint: url,
      provider: "nano_banana",
      model_id: runtime.modelId,
      payload,
    }, null, 2));
    return 0;
  }

  let result;
  try {
    result = await requestJson({
      method: "POST",
      url,
      apiKey: runtime.apiKey,
      body: payload,
      timeoutSeconds: timeout,
      maxRetries: retry,
      retryDelayMs: retryDelay,
      extraHeaders: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    return 1;
  }

  console.log(JSON.stringify(result, null, 2));

  if (values.download) {
    try {
      await saveImageResults(result, values.download, timeout, retry, retryDelay);
    } catch (error) {
      console.error(`Download failed: ${error.message}`);
      return 1;
    }
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
