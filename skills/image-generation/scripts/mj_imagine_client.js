#!/usr/bin/env node
const path = require("node:path");
const { parseArgs } = require("node:util");
const {
  downloadFile,
  encodeImageToDataUri,
  isDataUri,
  isRemoteUrl,
  mergePromptWithPositionals,
  normalizeArgvForMultiValueOptions,
  parseRetryOptions,
  requestJson,
  resolveConfigPath,
  resolveProviderRuntime,
} = require("./lib/image_api_common");

const DEFAULT_BASE_URL = "https://api.bltcy.top";
const DEFAULT_MJ_VERSION = "7";

function resolveBaseUrl(values, config) {
  const raw = values["base-url"] || config.baseUrl || config.base_url || DEFAULT_BASE_URL;
  const finalValue = String(raw || "").trim().replace(/\/+$/, "");
  if (!finalValue) {
    throw new Error("Base URL is empty");
  }
  return finalValue;
}

function resolveRoutePrefix(values, config) {
  const raw = values["route-prefix"] !== undefined ? values["route-prefix"] : config.route_prefix || "fast";
  const text = String(raw || "").trim();
  return text ? text.replace(/^\/+|\/+$/g, "") : "";
}

function buildSubmitUrl(baseUrl, routePrefix) {
  return routePrefix ? `${baseUrl}/${routePrefix}/mj/submit/imagine` : `${baseUrl}/mj/submit/imagine`;
}

function buildFetchUrl(baseUrl, routePrefix, taskId) {
  return routePrefix ? `${baseUrl}/${routePrefix}/mj/task/${taskId}/fetch` : `${baseUrl}/mj/task/${taskId}/fetch`;
}

function normalizePrompt(prompt) {
  const text = String(prompt || "").trim();
  if (!text) {
    return text;
  }
  const lower = ` ${text.toLowerCase()} `;
  if (lower.includes(" --v ") || lower.includes(" --version ")) {
    return text;
  }
  return `${text} --v ${DEFAULT_MJ_VERSION}`;
}

function getImageInputs(values) {
  const raw = values["image-path"];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function buildBase64Array(inputs) {
  const list = [];
  for (const item of inputs) {
    const text = String(item || "").trim();
    if (!text) {
      continue;
    }
    if (isRemoteUrl(text) || isDataUri(text)) {
      list.push(text);
    } else {
      list.push(encodeImageToDataUri(text));
    }
  }
  return list;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildIndexedPath(basePath, index, prefix = "") {
  const ext = path.extname(basePath);
  const stem = ext ? basePath.slice(0, -ext.length) : basePath;
  return `${stem}${prefix}${index}${ext}`;
}

function getSingleImageUrls(taskResult) {
  const raw = Array.isArray(taskResult.imageUrls) ? taskResult.imageUrls : [];
  const urls = [];
  for (const item of raw) {
    if (!item) {
      continue;
    }
    if (typeof item === "string") {
      const value = item.trim();
      if (value) {
        urls.push(value);
      }
      continue;
    }
    const value = String(item.url || "").trim();
    if (value) {
      urls.push(value);
    }
  }
  return urls;
}

async function downloadTaskImages(taskResult, downloadPath, downloadMode, timeoutSeconds, retry, retryDelay) {
  const mode = String(downloadMode || "grid").trim().toLowerCase();
  if (!["grid", "single", "both"].includes(mode)) {
    throw new Error("Invalid --download-mode. Use: grid, single, or both");
  }

  let downloadCount = 0;

  if (mode === "grid" || mode === "both") {
    const imageUrl = String(taskResult.imageUrl || "").trim();
    if (imageUrl) {
      await downloadFile(imageUrl, downloadPath, timeoutSeconds, retry, retryDelay);
      console.error(`Downloaded image (grid) -> ${downloadPath}`);
      downloadCount += 1;
    } else {
      console.error("Warning: imageUrl is empty, skip grid download");
    }
  }

  if (mode === "single" || mode === "both") {
    const urls = getSingleImageUrls(taskResult);
    if (urls.length === 0) {
      console.error("Warning: imageUrls is empty, skip single-image download");
    }
    for (let i = 0; i < urls.length; i += 1) {
      const savePath = urls.length === 1 ? downloadPath : buildIndexedPath(downloadPath, i + 1, "_single_");
      await downloadFile(urls[i], savePath, timeoutSeconds, retry, retryDelay);
      console.error(`Downloaded image (single) -> ${savePath}`);
      downloadCount += 1;
    }
  }

  if (downloadCount === 0) {
    throw new Error("Task finished but no downloadable image URL found");
  }
}

async function pollTask(apiKey, fetchUrl, timeoutSeconds, pollInterval, pollTimeout, retry, retryDelay) {
  const deadline = Date.now() + pollTimeout * 1000;
  let last = {};

  while (Date.now() < deadline) {
    last = await requestJson({
      method: "GET",
      url: fetchUrl,
      apiKey,
      body: undefined,
      timeoutSeconds,
      maxRetries: retry,
      retryDelayMs: retryDelay,
    });

    const status = String(last.status || "").toUpperCase();
    const progress = String(last.progress || "");
    if (["SUCCESS", "FAILURE", "CANCEL"].includes(status) || progress === "100%") {
      return last;
    }
    console.error(`Polling status: ${status || "PENDING"}${progress ? ` (${progress})` : ""}`);

    await sleep(Math.max(200, Math.floor(pollInterval * 1000)));
  }

  throw new Error(`Polling timed out after ${pollTimeout}s`);
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
        prompt: { type: "string" },
        "image-path": { type: "string", multiple: true },
        "model-id": { type: "string", default: "" },
        "base-url": { type: "string", default: "" },
        "route-prefix": { type: "string" },
        "notify-hook": { type: "string", default: "" },
        timeout: { type: "string", default: "120" },
        retry: { type: "string", default: "2" },
        "retry-delay": { type: "string", default: "800" },
        "no-poll": { type: "boolean", default: false },
        "poll-interval": { type: "string", default: "3" },
        "poll-timeout": { type: "string", default: "600" },
        download: { type: "string", default: "" },
        "download-mode": { type: "string", default: "grid" },
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

  const timeout = Number.parseInt(values.timeout, 10);
  const pollInterval = Number.parseFloat(values["poll-interval"]);
  const pollTimeout = Number.parseInt(values["poll-timeout"], 10);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    console.error("Invalid --timeout value");
    return 2;
  }
  if (!Number.isFinite(pollInterval) || pollInterval <= 0) {
    console.error("Invalid --poll-interval value");
    return 2;
  }
  if (!Number.isFinite(pollTimeout) || pollTimeout <= 0) {
    console.error("Invalid --poll-timeout value");
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
  if (!["grid", "single", "both"].includes(String(values["download-mode"] || "").trim().toLowerCase())) {
    console.error("Invalid --download-mode. Use: grid, single, or both");
    return 2;
  }

  let config;
  let apiKey;
  let baseUrl;
  let routePrefix;
  try {
    const runtime = resolveProviderRuntime(configPath, "mj", values["model-id"], DEFAULT_BASE_URL);
    config = runtime;
    apiKey = runtime.apiKey;
    baseUrl = resolveBaseUrl(values, runtime);
    routePrefix = resolveRoutePrefix(values, runtime);
  } catch (error) {
    console.error(`Config error: ${error.message}`);
    return 2;
  }

  let base64Array;
  try {
    base64Array = buildBase64Array(getImageInputs(values));
  } catch (error) {
    console.error(`Image error: ${error.message}`);
    return 2;
  }

  const submitUrl = buildSubmitUrl(baseUrl, routePrefix);
  const finalPrompt = normalizePrompt(prompt);

  console.error(`Submit URL: ${submitUrl}`);
  console.error(`Mode: ${base64Array.length > 0 ? "文图生图" : "文生图"}`);
  if (finalPrompt !== prompt) {
    console.error(`Auto append default MJ version: --v ${DEFAULT_MJ_VERSION}`);
  }

  const payload = {
    prompt: finalPrompt,
    base64Array,
  };
  if (String(values["notify-hook"] || "").trim()) {
    payload.notifyHook = String(values["notify-hook"]).trim();
  }

  if (values["dry-run"]) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      submit_url: submitUrl,
      provider: "mj",
      model_id: config.modelId,
      route_prefix: routePrefix,
      payload,
      poll: !values["no-poll"],
    }, null, 2));
    return 0;
  }

  let submitResult;
  try {
    console.error("Submitting MJ task... please wait.");
    submitResult = await requestJson({
      method: "POST",
      url: submitUrl,
      apiKey,
      body: payload,
      timeoutSeconds: timeout,
      maxRetries: retry,
      retryDelayMs: retryDelay,
    });
  } catch (error) {
    console.error(`Submit failed: ${error.message}`);
    return 1;
  }

  console.log(JSON.stringify(submitResult, null, 2));

  if (values["no-poll"]) {
    return 0;
  }

  const taskId = String(submitResult.result || "").trim();
  if (!taskId) {
    console.error("No task id found in submit result.result");
    return 1;
  }

  const fetchUrl = buildFetchUrl(baseUrl, routePrefix, taskId);
  console.error(`Polling task: ${taskId}`);

  let taskResult;
  try {
    taskResult = await pollTask(apiKey, fetchUrl, timeout, pollInterval, pollTimeout, retry, retryDelay);
  } catch (error) {
    console.error(`Polling failed: ${error.message}`);
    return 1;
  }

  console.log(JSON.stringify(taskResult, null, 2));

  if (values.download) {
    try {
      await downloadTaskImages(
        taskResult,
        values.download,
        values["download-mode"],
        timeout,
        retry,
        retryDelay,
      );
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
