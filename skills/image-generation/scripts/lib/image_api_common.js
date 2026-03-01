#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 800;

function resolveConfigPath(scriptDir) {
  const fromEnv = process.env.IMAGE_API_CONFIG || "";
  if (fromEnv.trim()) {
    return path.resolve(fromEnv.trim());
  }
  return path.join(scriptDir, "api_config.json");
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read config file: ${configPath}. ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in config file: ${configPath}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file must be a JSON object: ${configPath}`);
  }
  return parsed;
}

function loadApiKey(config, configPath) {
  const apiKey = String(config.api_key || "").trim();
  if (!apiKey) {
    throw new Error(`Missing 'api_key' in config file: ${configPath}`);
  }
  return apiKey;
}

function resolveBaseUrl(config, defaultBaseUrl) {
  const value = String(config.base_url || defaultBaseUrl || "").trim().replace(/\/+$/, "");
  if (!value) {
    throw new Error("Base URL is empty");
  }
  return value;
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function isDataUri(value) {
  return /^data:/i.test(value);
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}

function encodeImageToDataUri(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }
  const content = fs.readFileSync(imagePath);
  const encoded = Buffer.from(content).toString("base64");
  const mimeType = guessMimeType(imagePath);
  return `data:${mimeType};base64,${encoded}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryNumber(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function computeRetryDelay(baseDelayMs, attempt) {
  const safeBase = Math.max(1, baseDelayMs);
  const safeAttempt = Math.max(0, attempt);
  return safeBase * Math.pow(2, safeAttempt);
}

function shouldRetryError(error) {
  if (!error) {
    return false;
  }
  if (error.retryable === true) {
    return true;
  }
  if (error.name === "AbortError") {
    return true;
  }
  return error instanceof TypeError;
}

function withRetryTip(error, maxRetries, retryDelayMs) {
  const msg = String(error && error.message ? error.message : error);
  return new Error(`${msg} (retries=${maxRetries}, retryDelayMs=${retryDelayMs})`);
}

async function requestJson({
  method,
  url,
  apiKey,
  body,
  timeoutSeconds,
  extraHeaders,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  const retries = parseRetryNumber(maxRetries, DEFAULT_MAX_RETRIES);
  const baseDelay = parseRetryNumber(retryDelayMs, DEFAULT_RETRY_DELAY_MS);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutMs = Math.max(1, timeoutSeconds) * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      ...(extraHeaders || {}),
    };

    const init = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body !== undefined && body !== null) {
      if (typeof FormData !== "undefined" && body instanceof FormData) {
        init.body = body;
      } else {
        init.body = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }
    }

    try {
      const response = await fetch(url, init);
      const text = await response.text();

      if (!response.ok) {
        const bodyText = text.slice(0, 500);
        const error = new Error(`HTTP ${response.status}: ${bodyText}`);
        error.status = response.status;
        error.retryable = RETRYABLE_HTTP_STATUS.has(response.status);
        throw error;
      }

      try {
        return JSON.parse(text);
      } catch (_error) {
        throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
      }
    } catch (error) {
      let finalError = error;
      if (error && error.name === "AbortError") {
        finalError = new Error(`Network timeout after ${timeoutSeconds}s`);
        finalError.retryable = true;
      }

      const canRetry = shouldRetryError(finalError) && attempt < retries;
      if (!canRetry) {
        throw withRetryTip(finalError, retries, baseDelay);
      }

      await sleep(computeRetryDelay(baseDelay, attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Unexpected retry loop exit");
}

async function downloadFile(url, outputPath, timeoutSeconds, maxRetries = DEFAULT_MAX_RETRIES, retryDelayMs = DEFAULT_RETRY_DELAY_MS) {
  const retries = parseRetryNumber(maxRetries, DEFAULT_MAX_RETRIES);
  const baseDelay = parseRetryNumber(retryDelayMs, DEFAULT_RETRY_DELAY_MS);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutMs = Math.max(1, timeoutSeconds) * 1000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        error.status = response.status;
        error.retryable = RETRYABLE_HTTP_STATUS.has(response.status);
        throw error;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
      return;
    } catch (error) {
      let finalError = error;
      if (error && error.name === "AbortError") {
        finalError = new Error(`Download timeout after ${timeoutSeconds}s`);
        finalError.retryable = true;
      }

      const canRetry = shouldRetryError(finalError) && attempt < retries;
      if (!canRetry) {
        throw withRetryTip(finalError, retries, baseDelay);
      }

      await sleep(computeRetryDelay(baseDelay, attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Unexpected download retry loop exit");
}

function parseBooleanString(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(value)) {
    return false;
  }
  throw new Error("watermark must be true/false");
}

function normalizeArgvForMultiValueOptions(argv, multiOptions) {
  const result = [];
  const set = new Set(multiOptions || []);

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!set.has(token)) {
      result.push(token);
      continue;
    }

    result.push(token);
    const firstValue = argv[i + 1];
    if (!firstValue || firstValue.startsWith("--")) {
      continue;
    }

    result.push(firstValue);
    i += 1;

    while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      result.push(token, argv[i + 1]);
      i += 1;
    }
  }

  return result;
}

function parseRetryOptions(values) {
  const retryRaw = values && values.retry !== undefined ? values.retry : DEFAULT_MAX_RETRIES;
  const retryDelayRaw =
    values && values["retry-delay"] !== undefined ? values["retry-delay"] : DEFAULT_RETRY_DELAY_MS;

  const retry = Number.parseInt(String(retryRaw), 10);
  if (!Number.isFinite(retry) || retry < 0) {
    throw new Error("Invalid --retry value. Use a non-negative integer.");
  }

  const retryDelay = Number.parseInt(String(retryDelayRaw), 10);
  if (!Number.isFinite(retryDelay) || retryDelay < 0) {
    throw new Error("Invalid --retry-delay value. Use a non-negative integer (milliseconds).");
  }

  return { retry, retryDelay };
}

function mergePromptWithPositionals(promptValue, positionals) {
  const basePrompt = String(promptValue || "").trim();
  const extras = Array.isArray(positionals)
    ? positionals.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (extras.length === 0) {
    return {
      prompt: basePrompt,
      merged: false,
    };
  }

  const mergedPrompt = basePrompt ? `${basePrompt} ${extras.join(" ")}` : extras.join(" ");
  return {
    prompt: mergedPrompt,
    merged: true,
  };
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
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
};
