'use strict';

const os = require('os');
const path = require('path');
const {
  DEFAULT_RUNTIME_ROOT,
  DEFAULT_DB_FILENAME,
  RUNTIME_ROOT_ENV,
  FALLBACK_RUNTIME_ROOT_ENV,
} = require('../constants');

function expandHome(input) {
  if (!input) {
    return input;
  }
  if (input === '~') {
    return os.homedir();
  }
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function resolveRuntimeRoot(options = {}) {
  const runtimeRoot =
    options.runtimeRoot ||
    process.env[RUNTIME_ROOT_ENV] ||
    process.env[FALLBACK_RUNTIME_ROOT_ENV] ||
    DEFAULT_RUNTIME_ROOT;
  return path.resolve(expandHome(String(runtimeRoot)));
}

function getRuntimePaths(options = {}) {
  const runtimeRoot = resolveRuntimeRoot(options);
  const dbDir = path.join(runtimeRoot, 'db');
  const resourcesDir = path.join(runtimeRoot, 'resources');
  const productsDir = path.join(resourcesDir, 'products');
  const strategiesDir = path.join(resourcesDir, 'strategies');
  const capabilitiesDir = path.join(resourcesDir, 'capabilities');
  const templatesDir = path.join(resourcesDir, 'templates');
  const productTemplatesDir = path.join(templatesDir, 'product');
  const taskTemplatesDir = path.join(templatesDir, 'task');
  const exportsDir = path.join(runtimeRoot, 'exports');
  const secretsDir = path.join(runtimeRoot, 'secrets');
  const cacheDir = path.join(runtimeRoot, 'cache');

  return {
    runtimeRoot,
    dbDir,
    dbPath: path.join(dbDir, DEFAULT_DB_FILENAME),
    resourcesDir,
    productsDir,
    strategiesDir,
    capabilitiesDir,
    templatesDir,
    productTemplatesDir,
    taskTemplatesDir,
    exportsDir,
    secretsDir,
    sessionPath: path.join(secretsDir, 'session.json'),
    wbiCachePath: path.join(cacheDir, 'wbi.json'),
    cacheDir,
  };
}

function getMissingRuntimeItems(paths) {
  const requiredDirs = [
    paths.runtimeRoot,
    paths.dbDir,
    paths.resourcesDir,
    paths.productsDir,
    paths.strategiesDir,
    paths.capabilitiesDir,
    paths.templatesDir,
    paths.productTemplatesDir,
    paths.taskTemplatesDir,
    paths.exportsDir,
    paths.secretsDir,
  ];

  const missingDirs = requiredDirs.filter((dirPath) => !require('./files').exists(dirPath));
  const missingFiles = [];
  if (!require('./files').exists(paths.dbPath)) {
    missingFiles.push(paths.dbPath);
  }

  return {
    missingDirs,
    missingFiles,
  };
}

module.exports = {
  resolveRuntimeRoot,
  getRuntimePaths,
  getMissingRuntimeItems,
};
