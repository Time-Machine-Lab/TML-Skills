#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const {
  mergePromptWithPositionals,
  normalizeArgvForMultiValueOptions,
  parseRetryOptions,
  requestJson,
  resolveConfigPath,
  resolveNanoBananaRuntime,
  saveImageResults,
} = require("./lib/image_api_common");

const DEFAULT_BASE_URL = "https://api.bltcy.top";

function getImagePaths(values) {
  const raw = values["image-path"];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

async function main() {
  const scriptDir = __dirname;
  const configPath = resolveConfigPath(scriptDir);
  const normalizedArgv = normalizeArgvForMultiValueOptions(process.argv.slice(2), ["--image-path"]);

  let parsed;
  try {
    parsed = parseArgs({
      args: normalizedArgv,
      options: {
        "image-path": { type: "string", multiple: true },
        prompt: { type: "string" },
        "model-id": { type: "string", default: "" },
        model: { type: "string", default: "" },
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

  const imagePaths = getImagePaths(values);
  if (imagePaths.length === 0) {
    console.error("Missing required argument: --image-path");
    return 2;
  }
  if (!prompt) {
    console.error("Missing required argument: --prompt");
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

  const form = new FormData();
  form.append("model", values.model || runtime.modelName);
  form.append("prompt", prompt);
  form.append("response_format", "url");
  if (values["aspect-ratio"]) {
    form.append("aspect_ratio", values["aspect-ratio"]);
  }
  form.append("image_size", resolution);

  try {
    for (const imagePath of imagePaths) {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      const content = fs.readFileSync(imagePath);
      const blob = new Blob([content]);
      form.append("image", blob, path.basename(imagePath));
    }
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    return 1;
  }

  const url = `${runtime.baseUrl}/v1/images/edits`;
  console.error(`Calling API: ${url}`);
  console.error(`Model: ${values.model || runtime.modelName}`);
  console.error(`Prompt: ${prompt}`);
  console.error(`Images: ${imagePaths.join(", ")}`);
  console.error("Generating image... please wait.");

  if (values["dry-run"]) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      endpoint: url,
      provider: "nano_banana",
      model_id: runtime.modelId,
      model: values.model || runtime.modelName,
      prompt,
      aspect_ratio: values["aspect-ratio"],
      image_size: resolution,
      image_count: imagePaths.length,
    }, null, 2));
    return 0;
  }

  let result;
  try {
    result = await requestJson({
      method: "POST",
      url,
      apiKey: runtime.apiKey,
      body: form,
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
