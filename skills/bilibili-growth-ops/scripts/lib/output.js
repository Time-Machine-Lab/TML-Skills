'use strict';

function nowIso() {
  return new Date().toISOString();
}

function createResult({
  ok = true,
  command,
  runtimeRoot = '',
  data = {},
  riskHints = [],
  nextSteps = [],
  writes = [],
}) {
  return {
    ok,
    command,
    runtimeRoot,
    data,
    riskHints,
    nextSteps,
    writes,
    timestamp: nowIso(),
  };
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printResult(result) {
  printJson(result);
}

function printError(error, runtimeRoot = '') {
  const payload = {
    ok: false,
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      details: error?.details || null,
      hint: error?.hint || '',
      exitCode: error?.exitCode || 1,
    },
    runtimeRoot,
    timestamp: nowIso(),
  };
  printJson(payload);
}

module.exports = {
  nowIso,
  createResult,
  printResult,
  printError,
};
