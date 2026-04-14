'use strict';

const { SECRETS_PATH, SESSION_PATH, readJson, writeJson } = require('./config');

function readSecrets() {
  return readJson(SECRETS_PATH, {});
}

function writeSecrets(payload) {
  writeJson(SECRETS_PATH, payload);
  return payload;
}

function patchSecrets(patch) {
  const next = {
    ...readSecrets(),
    ...patch,
  };
  return writeSecrets(next);
}

function readSession() {
  return readJson(SESSION_PATH, {});
}

function writeSession(payload) {
  writeJson(SESSION_PATH, payload);
  return payload;
}

function patchSession(patch) {
  const next = {
    ...readSession(),
    ...patch,
  };
  return writeSession(next);
}

module.exports = {
  readSecrets,
  writeSecrets,
  patchSecrets,
  readSession,
  writeSession,
  patchSession,
};
