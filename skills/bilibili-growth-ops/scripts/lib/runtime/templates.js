'use strict';

const fs = require('fs');
const path = require('path');
const { exists, ensureDir, readText, copyFile } = require('./files');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMPLATE_ROOT = path.join(PACKAGE_ROOT, 'assets', 'templates');

function getTemplatePath(...segments) {
  return path.join(TEMPLATE_ROOT, ...segments);
}

function getRuntimeTemplatePath(paths, scope, ...segments) {
  if (!paths) {
    return '';
  }
  if (scope === 'task') {
    return path.join(paths.taskTemplatesDir || path.join(paths.resourcesDir, 'templates', 'task'), ...segments);
  }
  if (scope === 'product') {
    return path.join(paths.productTemplatesDir || path.join(paths.resourcesDir, 'templates', 'product'), ...segments);
  }
  return '';
}

function resolveTemplatePath(paths, scope, name) {
  const runtimePath = getRuntimeTemplatePath(paths, scope, name);
  if (runtimePath && exists(runtimePath)) {
    return runtimePath;
  }
  return getTemplatePath(scope, name);
}

function loadTemplate(...segments) {
  return readText(getTemplatePath(...segments), '');
}

function loadRuntimeTemplate(paths, scope, name) {
  return readText(resolveTemplatePath(paths, scope, name), '');
}

function renderTemplate(template, variables = {}) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : '';
  });
}

function syncDirectory(sourceDir, targetDir, options = {}) {
  const { force = false } = options;
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      syncDirectory(sourcePath, targetPath, options);
      continue;
    }
    if (force || !exists(targetPath)) {
      copyFile(sourcePath, targetPath);
    }
  }
}

module.exports = {
  PACKAGE_ROOT,
  TEMPLATE_ROOT,
  getTemplatePath,
  getRuntimeTemplatePath,
  loadTemplate,
  loadRuntimeTemplate,
  renderTemplate,
  syncDirectory,
};
