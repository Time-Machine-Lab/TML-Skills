#!/usr/bin/env node
const { parseArgs } = require("node:util");
const {
  downloadFile,
  loadApiKey,
  loadConfig,
  mergePromptWithPositionals,
  parseRetryOptions,
  requestJson,
  resolveBaseUrl,
  resolveConfigPath,
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
        model: { type: "string", default: "nano-banana-2-4k" },
        "response-format": { type: "string", default: "url" },
        "aspect-ratio": { type: "string", default: "1:1" },
        "image-size": { type: "string", default: "1K" },
        download: { type: "string", default: "" },
        timeout: { type: "string", default: "120" },
        retry: { type: "string", default: "2" },
        "retry-delay": { type: "string", default: "800" },
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

  if (!["1K", "2K", "4K"].includes(values["image-size"])) {
    console.error("Invalid --image-size. Use: 1K, 2K, or 4K");
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

  let apiKey;
  let baseUrl;
  try {
    const config = loadConfig(configPath);
    apiKey = loadApiKey(config, configPath);
    baseUrl = resolveBaseUrl(config, DEFAULT_BASE_URL);
  } catch (error) {
    console.error(`Config error: ${error.message}`);
    return 2;
  }

  const payload = buildPayload({
    ...values,
    prompt,
  });
  const url = `${baseUrl}/v1/images/generations`;

  console.error(`Calling API: ${url}`);
  console.error(`Payload: ${JSON.stringify(payload)}`);
  console.error("Generating image... please wait.");

  let result;
  try {
    result = await requestJson({
      method: "POST",
      url,
      apiKey,
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

  if (values.download && values["response-format"] === "url") {
    const data = result.data;
    const imageUrl = Array.isArray(data) && data.length > 0 ? data[0].url : "";
    if (!imageUrl) {
      console.error("No image URL found in response['data'][0]['url']");
      return 1;
    }
    try {
      await downloadFile(imageUrl, values.download, timeout, retry, retryDelay);
      console.error(`Downloaded image -> ${values.download}`);
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
