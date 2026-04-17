'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function exists(targetPath) {
  return fs.existsSync(targetPath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload, mode = 0o644) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  try {
    fs.chmodSync(filePath, mode);
  } catch {}
  return payload;
}

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function writeText(filePath, content, mode = 0o644) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  try {
    fs.chmodSync(filePath, mode);
  } catch {}
  return filePath;
}

function copyFile(sourcePath, targetPath, mode = 0o644) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  try {
    fs.chmodSync(targetPath, mode);
  } catch {}
}

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function uniqueId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function listDirectories(rootPath) {
  if (!exists(rootPath)) {
    return [];
  }
  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listFiles(rootPath) {
  if (!exists(rootPath)) {
    return [];
  }
  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

module.exports = {
  exists,
  ensureDir,
  readJson,
  writeJson,
  readText,
  writeText,
  copyFile,
  slugify,
  uniqueId,
  listDirectories,
  listFiles,
};
