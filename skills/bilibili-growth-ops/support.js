'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootstrapRuntime } = require('./scripts/lib/runtime/bootstrap');
const { createRuntimeContext } = require('./scripts/lib/runtime/context');

function makeTempRuntime(prefix = 'bgo-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function bootstrapTempRuntime() {
  const runtimeRoot = makeTempRuntime();
  bootstrapRuntime({ runtimeRoot });
  return runtimeRoot;
}

function withContext(runtimeRoot, fn) {
  const context = createRuntimeContext({ runtimeRoot });
  try {
    return fn(context);
  } finally {
    context.close();
  }
}

module.exports = {
  makeTempRuntime,
  bootstrapTempRuntime,
  withContext,
};
