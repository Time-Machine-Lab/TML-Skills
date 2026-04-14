'use strict';

const crypto = require('crypto');
const { CliError } = require('./errors');
const { extractCsrf } = require('./cookie');

function parseCookieString(cookie) {
  const jar = {};
  if (!cookie) {
    return jar;
  }

  for (const part of String(cookie).split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) {
      jar[key] = value;
    }
  }

  return jar;
}

function serializeCookieMap(cookieMap) {
  return Object.entries(cookieMap)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function mergeCookieInputs(...inputs) {
  const merged = {};
  for (const input of inputs) {
    if (!input) {
      continue;
    }
    const nextMap = typeof input === 'string' ? parseCookieString(input) : input;
    Object.assign(merged, nextMap);
  }
  return merged;
}

function parseSetCookieHeaders(setCookies) {
  const pairs = {};
  for (const item of setCookies || []) {
    const [first] = String(item).split(';');
    const separatorIndex = first.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = first.slice(0, separatorIndex).trim();
    const value = first.slice(separatorIndex + 1).trim();
    if (key) {
      pairs[key] = value;
    }
  }
  return pairs;
}

function getSetCookieArray(headers) {
  if (!headers) {
    return [];
  }
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const combined = headers.get?.('set-cookie');
  return combined ? [combined] : [];
}

function maskValue(value, { keepStart = 4, keepEnd = 4 } = {}) {
  if (!value) {
    return '';
  }
  const stringValue = String(value);
  if (stringValue.length <= keepStart + keepEnd) {
    return `${stringValue.slice(0, 1)}***`;
  }
  return `${stringValue.slice(0, keepStart)}***${stringValue.slice(-keepEnd)}`;
}

function buildSessionRecord(cookie, extras = {}) {
  const cookieMap = parseCookieString(cookie);
  const csrf = extractCsrf(cookie) || '';
  const now = new Date().toISOString();
  return {
    cookie,
    cookieMap,
    csrf,
    dedeUserId: cookieMap.DedeUserID || '',
    sessdata: cookieMap.SESSDATA || '',
    biliJct: cookieMap.bili_jct || '',
    buvid3: cookieMap.buvid3 || '',
    buvid4: cookieMap.buvid4 || '',
    bNut: cookieMap.b_nut || '',
    biliTicket: cookieMap.bili_ticket || '',
    needRefresh: extras.needRefresh ?? null,
    refreshCheckAt: extras.refreshCheckAt || '',
    refreshTimestamp: extras.refreshTimestamp || 0,
    devId: extras.devId || '',
    createdAt: extras.createdAt || now,
    updatedAt: now,
    ...extras,
  };
}

function buildSessionSummary(session) {
  if (!session || (!session.cookie && !session.qrcodeKey && !session.loginUrl)) {
    return {
      hasSession: false,
    };
  }

  const hasCookieSession = Boolean(session.cookie);
  return {
    hasSession: hasCookieSession,
    hasPendingQr: Boolean(session.qrcodeKey),
    dedeUserId: session.dedeUserId || '',
    hasCookie: hasCookieSession,
    hasCsrf: Boolean(session.csrf),
    hasRefreshToken: Boolean(session.refreshToken),
    hasBuvid3: Boolean(session.buvid3),
    hasBuvid4: Boolean(session.buvid4),
    hasBNut: Boolean(session.bNut),
    hasBiliTicket: Boolean(session.biliTicket),
    needRefresh: session.needRefresh ?? null,
    qrcodeKey: session.qrcodeKey || '',
    loginUrl: session.loginUrl || '',
    cookiePreview: maskValue(session.cookie, { keepStart: 16, keepEnd: 10 }),
    refreshTokenPreview: maskValue(session.refreshToken),
    updatedAt: session.updatedAt || '',
  };
}

function makeStateToken(prefix = 'bili') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function requireQrcodeKey(qrcodeKey) {
  if (!qrcodeKey) {
    throw new CliError('缺少 qrcode_key。请先执行 auth qr-generate，或通过 --key 显式传入。');
  }
  return qrcodeKey;
}

module.exports = {
  parseCookieString,
  serializeCookieMap,
  mergeCookieInputs,
  parseSetCookieHeaders,
  getSetCookieArray,
  maskValue,
  buildSessionRecord,
  buildSessionSummary,
  makeStateToken,
  requireQrcodeKey,
};
