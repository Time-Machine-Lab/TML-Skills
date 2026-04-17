'use strict';

const { nowIso } = require('./output');
const { readJson, writeJson } = require('./runtime/files');

function readSession(paths) {
  return readJson(paths.sessionPath, {});
}

function writeSession(paths, payload) {
  return writeJson(paths.sessionPath, payload, 0o600);
}

function patchSession(paths, patch) {
  const next = {
    ...readSession(paths),
    ...patch,
    updatedAt: nowIso(),
  };
  return writeSession(paths, next);
}

function summarizeSession(session) {
  if (!session || (!session.cookie && !session.qrcodeKey && !session.loginUrl)) {
    return {
      hasSession: false,
    };
  }

  return {
    hasSession: Boolean(session.cookie),
    hasPendingQr: Boolean(session.qrcodeKey && !session.cookie),
    qrcodeKey: session.qrcodeKey || '',
    loginUrl: session.loginUrl || '',
    mid: session.userInfo?.mid || session.dedeUserId || '',
    uname: session.userInfo?.uname || '',
    hasRefreshToken: Boolean(session.refreshToken),
    hasCsrf: Boolean(session.csrf || session.biliJct),
    updatedAt: session.updatedAt || '',
  };
}

module.exports = {
  readSession,
  writeSession,
  patchSession,
  summarizeSession,
};
