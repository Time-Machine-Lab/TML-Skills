#!/usr/bin/env node
const { parseArgs } = require("node:util");
const {
  encodeImageToDataUri,
  isDataUri,
  isRemoteUrl,
  mergePromptWithPositionals,
  normalizeArgvForMultiValueOptions,
  parseBooleanString,
  parseRetryOptions,
  requestJson,
  resolveConfigPath,
  resolveProviderRuntime,
  saveImageResults,
} = require("./lib/image_api_common");

const DEFAULT_BASE_URL = "https://api.bltcy.top";
const DEFAULT_PROVIDER = "jimeng";

function getImages(values) {
  const raw = values.image;
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function buildPayload(values, images) {
  const payload = {
    model: values.model,
    prompt: values.prompt,
    response_format: values["response-format"],
    size: values.size,
    n: values.n,
  };

  if (values.seed !== undefined) {
    payload.seed = values.seed;
  }
  if (values["guidance-scale"] !== undefined) {
    payload.guidance_scale = values["guidance-scale"];
  }
  if (values.watermark !== undefined && values.watermark !== null) {
    payload.watermark = values.watermark;
  }

  if (images.length > 0) {
    payload.image = images;
  }

  return payload;
}

async function main() {
  const scriptDir = __dirname;
  const configPath = resolveConfigPath(scriptDir);
  const normalizedArgv = normalizeArgvForMultiValueOptions(process.argv.slice(2), ["--image"]);

  let parsed;
  try {
    parsed = parseArgs({
      args: normalizedArgv,
      options: {
        prompt: { type: "string" },
        "model-id": { type: "string", default: "" },
        model: { type: "string", default: "" },
        "response-format": { type: "string", default: "url" },
        size: { type: "string", default: "2K" },
        seed: { type: "string" },
        "guidance-scale": { type: "string" },
        watermark: { type: "string" },
        timeout: { type: "string", default: "60" },
        retry: { type: "string", default: "2" },
        "retry-delay": { type: "string", default: "800" },
        download: { type: "string", default: "" },
        image: { type: "string", multiple: true },
        n: { type: "string", default: "1" },
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

  const n = Number.parseInt(values.n, 10);
  if (![1, 2, 3, 4].includes(n)) {
    console.error("Invalid --n. Use: 1, 2, 3, or 4");
    return 2;
  }

  let watermark;
  try {
    watermark = parseBooleanString(values.watermark);
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  let seed;
  if (values.seed !== undefined) {
    seed = Number.parseInt(values.seed, 10);
    if (!Number.isFinite(seed)) {
      console.error("Invalid --seed value");
      return 2;
    }
  }

  let guidanceScale;
  if (values["guidance-scale"] !== undefined) {
    guidanceScale = Number.parseFloat(values["guidance-scale"]);
    if (!Number.isFinite(guidanceScale)) {
      console.error("Invalid --guidance-scale value");
      return 2;
    }
  }

  let runtime;
  try {
    runtime = resolveProviderRuntime(configPath, DEFAULT_PROVIDER, values["model-id"], DEFAULT_BASE_URL);
  } catch (error) {
    console.error(`Config error: ${error.message}`);
    return 2;
  }

  const rawImages = getImages(values);
  const processedImages = [];
  try {
    for (const item of rawImages) {
      if (isRemoteUrl(item) || isDataUri(item)) {
        processedImages.push(item);
      } else {
        console.error(`Encoding local image: ${item}`);
        processedImages.push(encodeImageToDataUri(item));
      }
    }
  } catch (error) {
    console.error(`Error encoding image: ${error.message}`);
    return 2;
  }

  const payload = buildPayload(
    {
      ...values,
      prompt,
      model: values.model || runtime.modelName,
      n,
      seed,
      "guidance-scale": guidanceScale,
      watermark,
    },
    processedImages,
  );

  const url = `${runtime.baseUrl}/v1/images/generations`;
  console.error(`Calling API: ${url}`);
  console.error(`Model: ${payload.model}`);
  console.error("Generating image... please wait.");

  if (values["dry-run"]) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      endpoint: url,
      provider: DEFAULT_PROVIDER,
      model_id: runtime.modelId,
      payload,
      image_count: processedImages.length,
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
