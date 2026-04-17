'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { bootstrapTempRuntime } = require('../support');
const { doctorRuntime } = require('../scripts/lib/runtime/bootstrap');
const { exists } = require('../scripts/lib/runtime/files');
const { getCapability } = require('../scripts/lib/workflows/catalog');

test('runtime bootstrap creates the expected workspace', () => {
  const runtimeRoot = bootstrapTempRuntime();
  const doctor = doctorRuntime({ runtimeRoot });

  assert.equal(doctor.checks.every((item) => item.ok), true);
  assert.equal(exists(path.join(runtimeRoot, 'db', 'bilibili-growth-ops.sqlite')), true);
  assert.equal(exists(path.join(runtimeRoot, 'resources', 'capabilities', 'video-discovery', 'CAPABILITY.md')), true);
  assert.equal(exists(path.join(runtimeRoot, 'resources', 'strategies', 'baseline-comment-reply-dm', 'strategy.json')), true);
  assert.equal(exists(path.join(runtimeRoot, 'resources', 'templates', 'product', 'PRODUCT.md.tmpl')), true);
  assert.equal(exists(path.join(runtimeRoot, 'resources', 'templates', 'product', 'PRODUCT-INSIGHT.md.tmpl')), true);
  assert.equal(exists(path.join(runtimeRoot, 'resources', 'templates', 'product', 'PRODUCT-INSIGHT-GUIDE.md')), true);

  const capability = getCapability(doctor.paths, 'video-discovery');
  assert.deepEqual(capability.metadata.commands, ['product.get', 'video.search']);
  assert.deepEqual(capability.metadata.outputs, ['video-list']);
  assert.equal(capability.sections.Purpose.includes('提炼关键词'), true);
  assert.equal(capability.sections['Execution Steps'].includes('先读取产品资料'), true);
});
