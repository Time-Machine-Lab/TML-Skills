#!/usr/bin/env node
const { parseArgs } = require("node:util");
const {
  downloadFile,
  encodeImageToDataUri,
  isDataUri,
  isRemoteUrl,
  loadApiKey,
  loadConfig,
  normalizeArgvForMultiValueOptions,
  requestJson,
  resolveConfigPath,
} = require("./lib/image_api_common");

const DEFAULT_BASE_URL = "https://api.bltcy.top";
const DEFAULT_MJ_VERSION = "7";

function resolveBaseUrl(values, config) {
  const raw = values["base-url"] || config.mj_base_url || config.base_url || DEFAULT_BASE_URL;
  const finalValue = String(raw || "").trim().replace(/\/+$/, "");
  if (!finalValue) {
    throw new Error("Base URL is empty");
  }
  return finalValue;
}

function resolveRoutePrefix(values, config) {
  const raw = values["route-prefix"] !== undefined ? values["route-prefix"] : config.mj_route_prefix || "fast";
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

async function pollTask(apiKey, fetchUrl, timeoutSeconds, pollInterval, pollTimeout) {
  const deadline = Date.now() + pollTimeout * 1000;
  let last = {};

  while (Date.now() < deadline) {
    last = await requestJson({
      method: "GET",
      url: fetchUrl,
      apiKey,
      body: undefined,
      timeoutSeconds,
    });

    const status = String(last.status || "").toUpperCase();
    const progress = String(last.progress || "");
    if (["SUCCESS", "FAILURE", "CANCEL"].includes(status) || progress === "100%") {
      return last;
    }

    await sleep(Math.max(200, Math.floor(pollInterval * 1000)));
  }

  throw new Error(`Polling timed out after ${pollTimeout}s`);
}

async function main() {
  const scriptDir = __dirname;
  const configPath = resolveConfigPath(scriptDir);
  const normalizedArgv = normalizeArgvForMultiValueOptions(process.argv.slice(2), ["--image-path"]);

  const { values } = parseArgs({
    args: normalizedArgv,
    options: {
      prompt: { type: "string" },
      "image-path": { type: "string", multiple: true },
      "base-url": { type: "string", default: "" },
      "route-prefix": { type: "string" },
      "notify-hook": { type: "string", default: "" },
      timeout: { type: "string", default: "120" },
      "no-poll": { type: "boolean", default: false },
      "poll-interval": { type: "string", default: "3" },
      "poll-timeout": { type: "string", default: "600" },
      download: { type: "string", default: "" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values.prompt) {
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

  let config;
  let apiKey;
  let baseUrl;
  let routePrefix;
  try {
    config = loadConfig(configPath);
    apiKey = loadApiKey(config, configPath);
    baseUrl = resolveBaseUrl(values, config);
    routePrefix = resolveRoutePrefix(values, config);
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
  const finalPrompt = normalizePrompt(values.prompt);

  console.error(`Submit URL: ${submitUrl}`);
  console.error(`Mode: ${base64Array.length > 0 ? "文图生图" : "文生图"}`);
  if (finalPrompt !== String(values.prompt).trim()) {
    console.error(`Auto append default MJ version: --v ${DEFAULT_MJ_VERSION}`);
  }

  const payload = {
    prompt: finalPrompt,
    base64Array,
  };
  if (String(values["notify-hook"] || "").trim()) {
    payload.notifyHook = String(values["notify-hook"]).trim();
  }

  let submitResult;
  try {
    submitResult = await requestJson({
      method: "POST",
      url: submitUrl,
      apiKey,
      body: payload,
      timeoutSeconds: timeout,
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
    taskResult = await pollTask(apiKey, fetchUrl, timeout, pollInterval, pollTimeout);
  } catch (error) {
    console.error(`Polling failed: ${error.message}`);
    return 1;
  }

  console.log(JSON.stringify(taskResult, null, 2));

  if (values.download) {
    const imageUrl = String(taskResult.imageUrl || "").trim();
    if (!imageUrl) {
      console.error("Task finished but imageUrl is empty");
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
