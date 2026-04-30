#!/usr/bin/env node
const { parseArgs } = require("node:util");
const {
  inputToUploadPart,
  mergePromptWithPositionals,
  normalizeArgvForMultiValueOptions,
  parseRetryOptions,
  requestJson,
  resolveConfigPath,
  resolveProviderRuntime,
  saveImageResults,
} = require("./lib/image_api_common");

const DEFAULT_BASE_URL = "https://api.bltcy.top";
const DEFAULT_PROVIDER = "gpt_image_2";
const DEFAULT_RESPONSE_FORMAT = "url";
const DEFAULT_ASPECT_RATIO = "1:1";
const DEFAULT_QUALITY = "low";
const FIXED_COUNT = 1;

const SIZE_BY_ASPECT_RATIO = new Map([
  ["4:3", "1448x1088"],
  ["3:4", "1088x1448"],
  ["16:9", "1672x944"],
  ["9:16", "944x1672"],
  ["2:3", "1024x1536"],
  ["3:2", "1536x1024"],
  ["1:1", "1256x1256"],
  ["4:5", "1120x1400"],
  ["5:4", "1400x1120"],
  ["21:9", "1920x824"],
  ["9:21", "824x1920"],
]);

function getImages(values) {
  const raw = values.image;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function normalizeAspectRatio(raw) {
  const value = String(raw || DEFAULT_ASPECT_RATIO).trim().replace("：", ":");
  if (!SIZE_BY_ASPECT_RATIO.has(value)) {
    throw new Error(`Invalid --aspect-ratio. Use: ${Array.from(SIZE_BY_ASPECT_RATIO.keys()).join(", ")}`);
  }
  return value;
}

function normalizeQuality(raw) {
  const value = String(raw || DEFAULT_QUALITY).trim().toLowerCase();
  if (value === "standard") return "low";
  if (!["low", "high"].includes(value)) {
    throw new Error("Invalid --quality. Use: low or high");
  }
  return value;
}

function buildGenerationPayload({ modelName, prompt, aspectRatio, quality, responseFormat }) {
  return {
    model: modelName,
    prompt,
    size: SIZE_BY_ASPECT_RATIO.get(aspectRatio),
    quality,
    n: FIXED_COUNT,
    response_format: responseFormat,
  };
}

async function buildEditForm({ modelName, prompt, aspectRatio, quality, responseFormat, images, timeout }) {
  const form = new FormData();
  form.append("model", modelName);
  form.append("prompt", prompt);
  form.append("size", SIZE_BY_ASPECT_RATIO.get(aspectRatio));
  form.append("quality", quality);
  form.append("n", String(FIXED_COUNT));
  form.append("response_format", responseFormat);

  for (let i = 0; i < images.length; i += 1) {
    const part = await inputToUploadPart(images[i], i + 1, timeout);
    const blob = new Blob([part.bytes], { type: part.mimeType });
    form.append("image", blob, part.fileName);
  }
  return form;
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
        image: { type: "string", multiple: true },
        "model-id": { type: "string", default: "" },
        model: { type: "string", default: "" },
        "aspect-ratio": { type: "string", default: DEFAULT_ASPECT_RATIO },
        quality: { type: "string", default: DEFAULT_QUALITY },
        "response-format": { type: "string", default: DEFAULT_RESPONSE_FORMAT },
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
    return 2;
  }

  const { values, positionals } = parsed;
  const promptResult = mergePromptWithPositionals(values.prompt, positionals);
  const prompt = promptResult.prompt;
  if (promptResult.merged) {
    console.error("Detected extra positional arguments. Auto-merged into --prompt.");
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

  let aspectRatio;
  let quality;
  let runtime;
  try {
    aspectRatio = normalizeAspectRatio(values["aspect-ratio"]);
    quality = normalizeQuality(values.quality);
    runtime = resolveProviderRuntime(configPath, DEFAULT_PROVIDER, values["model-id"], DEFAULT_BASE_URL);
  } catch (error) {
    console.error(`Config error: ${error.message}`);
    return 2;
  }

  const modelName = String(values.model || runtime.modelName).trim();
  if (!modelName) {
    console.error("Resolved model name is empty");
    return 2;
  }

  const images = getImages(values);
  const endpoint = images.length > 0 ? `${runtime.baseUrl}/v1/images/edits` : `${runtime.baseUrl}/v1/images/generations`;
  const payloadPreview = buildGenerationPayload({
    modelName,
    prompt,
    aspectRatio,
    quality,
    responseFormat: values["response-format"],
  });

  console.error(`Calling API: ${endpoint}`);
  console.error(`Mode: ${images.length > 0 ? "image-edit" : "text-to-image"}`);
  console.error(`Model: ${modelName}`);

  if (values["dry-run"]) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      endpoint,
      provider: DEFAULT_PROVIDER,
      model_id: runtime.modelId,
      payload: payloadPreview,
      image_count: images.length,
    }, null, 2));
    return 0;
  }

  let result;
  try {
    if (images.length > 0) {
      const form = await buildEditForm({
        modelName,
        prompt,
        aspectRatio,
        quality,
        responseFormat: values["response-format"],
        images,
        timeout,
      });
      result = await requestJson({
        method: "POST",
        url: endpoint,
        apiKey: runtime.apiKey,
        body: form,
        timeoutSeconds: timeout,
        maxRetries: retryOptions.retry,
        retryDelayMs: retryOptions.retryDelay,
      });
    } else {
      result = await requestJson({
        method: "POST",
        url: endpoint,
        apiKey: runtime.apiKey,
        body: payloadPreview,
        timeoutSeconds: timeout,
        maxRetries: retryOptions.retry,
        retryDelayMs: retryOptions.retryDelay,
      });
    }
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    return 1;
  }

  console.log(JSON.stringify(result, null, 2));

  if (values.download) {
    try {
      await saveImageResults(result, values.download, timeout, retryOptions.retry, retryOptions.retryDelay);
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
