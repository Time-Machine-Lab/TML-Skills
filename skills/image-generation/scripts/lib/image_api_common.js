#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

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

async function requestJson({ method, url, apiKey, body, timeoutSeconds, extraHeaders }) {
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
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Network timeout after ${timeoutSeconds}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadFile(url, outputPath, timeoutSeconds) {
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
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Download timeout after ${timeoutSeconds}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

module.exports = {
  downloadFile,
  encodeImageToDataUri,
  isDataUri,
  isRemoteUrl,
  loadApiKey,
  loadConfig,
  normalizeArgvForMultiValueOptions,
  parseBooleanString,
  requestJson,
  resolveBaseUrl,
  resolveConfigPath,
};
