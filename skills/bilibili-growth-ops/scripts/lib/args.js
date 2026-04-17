'use strict';

const { CliError } = require('./errors');

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next == null || next.startsWith('--')) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positionals, options };
}

function requireOption(options, key, message) {
  const value = options[key];
  if (value == null || value === '') {
    throw new CliError(message || `Missing required option --${key}`);
  }
  return String(value);
}

function toInt(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase());
}

function pick(options, keys) {
  const picked = {};
  for (const key of keys) {
    if (options[key] !== undefined) {
      picked[key] = options[key];
    }
  }
  return picked;
}

module.exports = {
  parseArgs,
  requireOption,
  toInt,
  toBool,
  pick,
};
