#!/usr/bin/env node
const path = require("node:path");
const { parseArgs } = require("node:util");
const {
  downloadFile,
  encodeImageToDataUri,
  isDataUri,
  isRemoteUrl,
  loadApiKey,
  loadConfig,
  mergePromptWithPositionals,
  normalizeArgvForMultiValueOptions,
  parseBooleanString,
  parseRetryOptions,
  requestJson,
  resolveBaseUrl,
  resolveConfigPath,
} = require("./lib/image_api_common");

const DEFAULT_BASE_URL = "https://api.bltcy.top";

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
  if (values.watermark !== undefined) {
    payload.watermark = values.watermark;
  }

  if (images.length > 0) {
    payload.image = images;
  }

  return payload;
}

function buildDownloadPath(basePath, index, total) {
  if (total === 1) {
    return basePath;
  }
  const ext = path.extname(basePath);
  const stem = ext ? basePath.slice(0, -ext.length) : basePath;
  return `${stem}_${index}${ext}`;
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
        model: { type: "string", default: "doubao-seedream-4-5-251128" },
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
      n,
      seed,
      "guidance-scale": guidanceScale,
      watermark,
    },
    processedImages,
  );

  const url = `${baseUrl}/v1/images/generations`;
  console.error(`Calling API: ${url}`);
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
    });
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    return 1;
  }

  console.log(JSON.stringify(result, null, 2));

  if (values.download && values["response-format"] === "url") {
    const data = Array.isArray(result.data) ? result.data : [];
    if (data.length === 0) {
      console.error("No image data found in response");
      return 1;
    }

    for (let i = 0; i < data.length; i += 1) {
      const imageUrl = data[i] && data[i].url;
      if (!imageUrl) {
        continue;
      }
      const savePath = buildDownloadPath(values.download, i, data.length);
      try {
        await downloadFile(imageUrl, savePath, timeout, retry, retryDelay);
        console.error(`Downloaded image -> ${savePath}`);
      } catch (error) {
        console.error(`Download failed for ${savePath}: ${error.message}`);
      }
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
