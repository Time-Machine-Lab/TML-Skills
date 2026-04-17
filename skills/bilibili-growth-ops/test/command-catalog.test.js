'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapTempRuntime, withContext } = require('../support');
const { runCommand } = require('../scripts/lib/commands');
const { doctorRuntime } = require('../scripts/lib/runtime/bootstrap');
const { listCapabilities } = require('../scripts/lib/workflows/catalog');
const { explainCommands, listCatalogEntries } = require('../scripts/lib/command-catalog');

test('command catalog can list and batch explain commands', async () => {
  const listed = await runCommand('command', 'list', {
    group: 'task',
  });

  assert.equal(Array.isArray(listed.data.items), true);
  assert.equal(listed.data.items.some((item) => item.key === 'task.create'), true);
  assert.equal(listed.data.items.some((item) => item.key === 'comment.send'), false);

  const explained = await runCommand('command', 'explain', {
    ids: 'task.plan-next,notification.unread_get,comment send,missing.command',
  });

  assert.equal(explained.command, 'command.explain');
  assert.deepEqual(
    explained.data.items.map((item) => item.key),
    ['task.plan-next', 'notification.unread-get', 'comment.send']
  );
  assert.deepEqual(explained.data.missing, ['missing.command']);
  assert.equal(explained.data.items.find((item) => item.key === 'comment.send').writesOperationRecord, true);
});

test('records cooldown policy commands manage centralized throttle policy', async () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ store }) => {
    store.upsertAccount({
      id: 'account:policy',
      bilibiliMid: '5005',
      displayName: 'policy',
      profile: {
        mid: '5005',
        uname: 'policy',
      },
    });
  });

  const before = await runCommand('records', 'cooldown-policy-get', {
    runtimeRoot,
    operationType: 'direct_message',
  });
  assert.equal(before.command, 'records.cooldown_policy_get');
  assert.equal(before.data.policySource, 'default');

  const updated = await runCommand('records', 'cooldown-policy-set', {
    runtimeRoot,
    operationType: 'direct_message',
    cooldownSeconds: '180',
    windowMinutes: '60',
    maxInWindow: '20',
  });
  assert.equal(updated.command, 'records.cooldown_policy_set');
  assert.equal(updated.data.policySource, 'persisted');
  assert.equal(updated.data.effectivePolicy.cooldownSeconds, 180);

  const checked = await runCommand('records', 'cooldown-check', {
    runtimeRoot,
    operationType: 'direct_message',
  });
  assert.equal(checked.command, 'records.cooldown_check');
  assert.equal(checked.data.policySource, 'persisted');
  assert.equal(checked.data.policy.cooldownSeconds, 180);
  assert.deepEqual(checked.data.persistedPolicy, {
    cooldownSeconds: 180,
    windowMinutes: 60,
    maxInWindow: 20,
  });

  const reset = await runCommand('records', 'cooldown-policy-reset', {
    runtimeRoot,
    operationType: 'direct_message',
  });
  assert.equal(reset.command, 'records.cooldown_policy_reset');
  assert.equal(reset.data.policySource, 'default');
});

test('command catalog stays aligned with capability allowed commands', () => {
  const runtimeRoot = bootstrapTempRuntime();
  const doctor = doctorRuntime({ runtimeRoot });
  const capabilities = listCapabilities(doctor.paths);
  const commandEntries = listCatalogEntries();

  assert.equal(commandEntries.length > 0, true);

  for (const capability of capabilities) {
    const commandIds = capability.metadata.commands || [];
    if (!commandIds.length) {
      continue;
    }

    const explained = explainCommands({
      ids: commandIds.join(','),
    });

    assert.deepEqual(
      explained.missing,
      [],
      `Capability ${capability.slug} references unknown commands: ${explained.missing.join(', ')}`
    );
  }
});
