'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_USER_AGENT } = require('./constants');

const SKILL_ROOT_DIR = path.resolve(__dirname, '..', '..');
const BUNDLED_CONFIG_DIR = path.join(SKILL_ROOT_DIR, 'config');
const RUNTIME_CONFIG_PATH = path.join(BUNDLED_CONFIG_DIR, 'runtime.json');
const DEFAULT_RUNTIME_ROOT = path.join(os.homedir(), '.openclaw', 'state', 'bilibili-api-skill');
const persistedRuntimeConfig = readJson(RUNTIME_CONFIG_PATH, {});
const RUNTIME_ROOT_DIR = process.env.BILI_SKILL_RUNTIME_DIR || persistedRuntimeConfig.runtimeRoot || DEFAULT_RUNTIME_ROOT;
const CONFIG_DIR = path.join(RUNTIME_ROOT_DIR, 'config');
const CACHE_DIR = path.join(RUNTIME_ROOT_DIR, 'cache');
const DATA_DIR = path.join(RUNTIME_ROOT_DIR, 'data');
const TASKS_DIR = path.join(DATA_DIR, 'tasks');
const PRODUCTS_DIR = process.env.BILI_SKILL_PRODUCTS_DIR || path.join(RUNTIME_ROOT_DIR, 'products');
const PLAYBOOKS_DIR = process.env.BILI_SKILL_PLAYBOOKS_DIR || path.join(RUNTIME_ROOT_DIR, 'playbooks');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const SECRETS_PATH = path.join(CONFIG_DIR, 'secrets.json');
const SESSION_PATH = path.join(CONFIG_DIR, 'session.json');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
const BUNDLED_CREDENTIALS_EXAMPLE_PATH = path.join(BUNDLED_CONFIG_DIR, 'credentials.json.example');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function buildRuntimePaths(runtimeRoot) {
  const resolvedRoot = path.resolve(String(runtimeRoot || DEFAULT_RUNTIME_ROOT));
  const configDir = path.join(resolvedRoot, 'config');
  return {
    runtimeRoot: resolvedRoot,
    configDir,
    cacheDir: path.join(resolvedRoot, 'cache'),
    dataDir: path.join(resolvedRoot, 'data'),
    tasksDir: path.join(resolvedRoot, 'data', 'tasks'),
    productsDir: path.join(resolvedRoot, 'products'),
    playbooksDir: path.join(resolvedRoot, 'playbooks'),
    credentialsPath: path.join(configDir, 'credentials.json'),
    secretsPath: path.join(configDir, 'secrets.json'),
    sessionPath: path.join(configDir, 'session.json'),
    settingsPath: path.join(configDir, 'settings.json'),
  };
}

function writeRuntimeConfig(payload) {
  writeJson(RUNTIME_CONFIG_PATH, payload);
  return payload;
}

function readCredentials() {
  const fileConfig = readJson(CREDENTIALS_PATH, readJson(BUNDLED_CREDENTIALS_EXAMPLE_PATH, {}));
  const secrets = readJson(SECRETS_PATH, {});
  const session = readJson(SESSION_PATH, {});
  return {
    cookie: process.env.BILI_COOKIE || fileConfig.cookie || secrets.cookie || session.cookie || '',
    userAgent: process.env.BILI_USER_AGENT || fileConfig.userAgent || DEFAULT_USER_AGENT,
  };
}

function updateCredentials(patch) {
  const current = readJson(CREDENTIALS_PATH, {});
  const next = {
    ...current,
    ...patch,
  };
  writeJson(CREDENTIALS_PATH, next);
  return next;
}

module.exports = {
  SKILL_ROOT_DIR,
  RUNTIME_ROOT_DIR,
  RUNTIME_CONFIG_PATH,
  PRODUCTS_DIR,
  PLAYBOOKS_DIR,
  CONFIG_DIR,
  BUNDLED_CONFIG_DIR,
  CACHE_DIR,
  DATA_DIR,
  TASKS_DIR,
  CREDENTIALS_PATH,
  SECRETS_PATH,
  SESSION_PATH,
  SETTINGS_PATH,
  BUNDLED_CREDENTIALS_EXAMPLE_PATH,
  buildRuntimePaths,
  writeRuntimeConfig,
  ensureDir,
  readJson,
  writeJson,
  readCredentials,
  updateCredentials,
};
