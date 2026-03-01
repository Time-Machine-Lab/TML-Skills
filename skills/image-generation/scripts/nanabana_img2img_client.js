#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const {
  downloadFile,
  loadApiKey,
  loadConfig,
  normalizeArgvForMultiValueOptions,
  requestJson,
  resolveBaseUrl,
  resolveConfigPath,
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

  const { values } = parseArgs({
    args: normalizedArgv,
    options: {
      "image-path": { type: "string", multiple: true },
      prompt: { type: "string" },
      model: { type: "string", default: "nano-banana-2-4k" },
      "aspect-ratio": { type: "string", default: "1:1" },
      "image-size": { type: "string", default: "1K" },
      download: { type: "string", default: "" },
      timeout: { type: "string", default: "120" },
    },
    strict: true,
    allowPositionals: false,
  });

  const imagePaths = getImagePaths(values);
  if (imagePaths.length === 0) {
    console.error("Missing required argument: --image-path");
    return 2;
  }
  if (!values.prompt) {
    console.error("Missing required argument: --prompt");
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

  const form = new FormData();
  form.append("model", values.model);
  form.append("prompt", values.prompt);
  form.append("response_format", "url");
  if (values["aspect-ratio"]) {
    form.append("aspect_ratio", values["aspect-ratio"]);
  }
  if (values["image-size"]) {
    form.append("image_size", values["image-size"]);
  }

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

  const url = `${baseUrl}/v1/images/edits`;
  console.error(`Calling API: ${url}`);
  console.error(`Prompt: ${values.prompt}`);
  console.error(`Images: ${imagePaths.join(", ")}`);

  let result;
  try {
    result = await requestJson({
      method: "POST",
      url,
      apiKey,
      body: form,
      timeoutSeconds: timeout,
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
    const data = result.data;
    const imageUrl = Array.isArray(data) && data.length > 0 ? data[0].url : "";
    if (!imageUrl) {
      console.error("No image URL found in response['data'][0]['url']");
      return 1;
    }
    try {
      await downloadFile(imageUrl, values.download, timeout);
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
