'use strict';

const path = require('path');
const { MIN_NODE_MAJOR, MIN_NODE_MINOR } = require('../constants');
const { CliError } = require('../errors');
const { getRuntimePaths, getMissingRuntimeItems } = require('./paths');
const { ensureDir, exists, writeJson } = require('./files');
const { loadSqliteModule } = require('../sqlite');
const { FactStore } = require('../store');
const { syncDirectory, getTemplatePath } = require('./templates');
const { summarizeSession } = require('../session-store');

function checkNodeVersion() {
  const [majorRaw, minorRaw] = process.versions.node.split('.');
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  const ok = major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
  return {
    name: 'node_version',
    ok,
    actual: process.versions.node,
    required: `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+`,
    message: ok ? 'Node version is supported.' : 'Node version is too low.',
  };
}

function checkSqliteSupport() {
  try {
    loadSqliteModule();
    return {
      name: 'node_sqlite',
      ok: true,
      message: 'node:sqlite is available.',
    };
  } catch (error) {
    return {
      name: 'node_sqlite',
      ok: false,
      message: error.message,
      hint: error.hint || '',
    };
  }
}

function bootstrapRuntime(options = {}) {
  const paths = getRuntimePaths(options);
  const checks = [checkNodeVersion(), checkSqliteSupport()];
  const failed = checks.find((item) => !item.ok);
  if (failed) {
    throw new CliError(failed.message, 1, failed, failed.hint || '请先修复环境后再继续 bootstrap。');
  }

  const writes = [];
  [
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
    paths.cacheDir,
  ].forEach((dirPath) => {
    ensureDir(dirPath);
    writes.push(dirPath);
  });

  const capabilitiesSource = getTemplatePath('capabilities');
  const strategiesSource = getTemplatePath('strategies');
  const productTemplatesSource = getTemplatePath('product');
  const taskTemplatesSource = getTemplatePath('task');
  syncDirectory(capabilitiesSource, paths.capabilitiesDir, { force: Boolean(options.repair) });
  syncDirectory(strategiesSource, paths.strategiesDir, { force: Boolean(options.repair) });
  syncDirectory(productTemplatesSource, paths.productTemplatesDir, { force: Boolean(options.repair) });
  syncDirectory(taskTemplatesSource, paths.taskTemplatesDir, { force: Boolean(options.repair) });

  if (!exists(paths.sessionPath)) {
    writeJson(paths.sessionPath, {}, 0o600);
    writes.push(paths.sessionPath);
  }

  const store = new FactStore(paths.dbPath);
  try {
    store.setMeta('schema_version', '1');
    store.setMeta('runtime_initialized_at', new Date().toISOString());
  } finally {
    store.close();
  }
  writes.push(paths.dbPath);

  return {
    paths,
    checks,
    writes,
  };
}

function doctorRuntime(options = {}) {
  const paths = getRuntimePaths(options);
  const checks = [checkNodeVersion(), checkSqliteSupport()];
  const missing = getMissingRuntimeItems(paths);
  let sessionSummary = { hasSession: false };
  if (exists(paths.sessionPath)) {
    sessionSummary = summarizeSession(require('../session-store').readSession(paths));
  }
  return {
    paths,
    checks,
    missing,
    sessionSummary,
  };
}

function repairRuntime(options = {}) {
  const result = bootstrapRuntime({
    ...options,
    repair: true,
  });
  return {
    ...result,
    repaired: true,
  };
}

function findTaskDir(paths, taskId) {
  const productsRoot = paths.productsDir;
  if (!exists(productsRoot)) {
    return null;
  }
  const fs = require('fs');
  const productDirs = fs.readdirSync(productsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const productDir of productDirs) {
    const candidate = path.join(productsRoot, productDir.name, 'tasks', taskId);
    if (exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

module.exports = {
  bootstrapRuntime,
  doctorRuntime,
  repairRuntime,
  findTaskDir,
};
