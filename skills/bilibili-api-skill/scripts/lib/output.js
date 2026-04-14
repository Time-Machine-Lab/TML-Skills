'use strict';

const { getCommandContext } = require('./runtime-context');
const { recordOperation, trackConversationFromCommand } = require('./tracker');

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function ok(data, meta = {}) {
  const context = getCommandContext();
  try {
    recordOperation({
      status: 'ok',
      context,
      payload: { ...meta, data },
    });
    trackConversationFromCommand(context, { ...meta, data });
  } catch {}
  printJson({
    ok: true,
    ...meta,
    data,
  });
}

function fail(error) {
  const context = getCommandContext();
  try {
    recordOperation({
      status: 'error',
      context,
      error,
    });
  } catch {}
  printJson({
    ok: false,
    error: error.message,
    details: error.details || null,
    hint: error.hint || '',
  });
}

module.exports = {
  printJson,
  ok,
  fail,
};
