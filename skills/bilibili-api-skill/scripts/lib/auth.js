'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { request, unwrapBiliResponse } = require('./http');
const { patchSecrets, patchSession, readSession } = require('./store');
const { updateCredentials, CACHE_DIR, ensureDir } = require('./config');
const {
  mergeCookieInputs,
  serializeCookieMap,
  parseSetCookieHeaders,
  getSetCookieArray,
  buildSessionRecord,
  requireQrcodeKey,
} = require('./session');
const { CliError } = require('./errors');
const { BilibiliClient } = require('./client');

const QR_CODE_GENERATE_URL =
  'https://passport.bilibili.com/x/passport-login/web/qrcode/generate?source=main-fe-header';
const QR_CODE_POLL_URL = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll';
const SPI_URL = 'https://api.bilibili.com/x/frontend/finger/spi';
const BILIBILI_URL = 'https://www.bilibili.com/';
const BILI_TICKET_URL = 'https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket';
const COOKIE_INFO_URL = 'https://passport.bilibili.com/x/passport-login/web/cookie/info';
const COOKIE_REFRESH_URL = 'https://passport.bilibili.com/x/passport-login/web/cookie/refresh';
const COOKIE_CONFIRM_REFRESH_URL = 'https://passport.bilibili.com/x/passport-login/web/confirm/refresh';
const CORRESPOND_URL_PREFIX = 'https://www.bilibili.com/correspond/1/';
const DEFAULT_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
};
const CORRESPOND_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----`;

function getQrCodeLibrary() {
  try {
    return require('qrcode');
  } catch (error) {
    throw new CliError(
      '当前环境缺少 `qrcode` 依赖，暂时无法生成扫码登录二维码。',
      1,
      {
        dependency: 'qrcode',
        detail: error.message,
      },
      '其余不依赖扫码登录的命令仍可继续使用；如果需要二维码登录，请先补齐该依赖。'
    );
  }
}

async function generateQrCode({ userAgent }) {
  const QRCode = getQrCodeLibrary();
  const result = await request(QR_CODE_GENERATE_URL, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
    },
  });
  const data = unwrapBiliResponse(result);
  const sessionPatch = {
    qrcodeKey: data.qrcode_key,
    loginUrl: data.url,
    qrGeneratedAt: new Date().toISOString(),
  };
  patchSession({
    ...readSession(),
    ...sessionPatch,
  });
  ensureDir(CACHE_DIR);
  const qrSvgPath = path.join(CACHE_DIR, 'bilibili-login-qrcode.svg');
  const qrPngPath = path.join(CACHE_DIR, 'bilibili-login-qrcode.png');
  const qrAscii = await QRCode.toString(data.url, {
    type: 'terminal',
    small: true,
    margin: 1,
  });
  const qrSvg = await QRCode.toString(data.url, {
    type: 'svg',
    margin: 1,
    width: 320,
  });
  const qrPngBuffer = await QRCode.toBuffer(data.url, {
    type: 'png',
    margin: 1,
    width: 320,
  });
  fs.writeFileSync(qrSvgPath, qrSvg, 'utf8');
  fs.writeFileSync(qrPngPath, qrPngBuffer);
  return {
    qrcodeKey: data.qrcode_key,
    url: data.url,
    qrSvgPath,
    qrPngPath,
    qrAscii,
  };
}

async function pollQrCode({ qrcodeKey, userAgent }) {
  const key = requireQrcodeKey(qrcodeKey || readSession().qrcodeKey);
  const result = await request(QR_CODE_POLL_URL, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
    },
    query: {
      qrcode_key: key,
      source: 'main-fe-header',
    },
  });

  const payload = result.body?.data || {};
  const statusCode = payload.code;
  if (statusCode === 86101) {
    return { status: 'waiting_scan', message: payload.message || '等待扫码', data: payload };
  }
  if (statusCode === 86090) {
    return { status: 'waiting_confirm', message: payload.message || '已扫码，等待确认', data: payload };
  }
  if (statusCode === 86038) {
    return { status: 'expired', message: payload.message || '二维码已失效', data: payload };
  }
  if (statusCode !== 0) {
    throw new CliError(`二维码登录轮询失败: code=${statusCode}`, 1, payload);
  }

  const headerCookies = parseSetCookieHeaders(getSetCookieArray(result.headers));
  const rawCookie = serializeCookieMap(headerCookies);
  const refreshToken = payload.refresh_token || '';
  const hydrated = await hydrateSession({
    cookie: rawCookie,
    refreshToken,
    userAgent,
    qrcodeKey: key,
    loginUrl: payload.url || '',
  });

  return {
    status: 'success',
    message: '登录成功',
    ...hydrated,
  };
}

async function fetchBuvids({ cookie, userAgent }) {
  const result = await request(SPI_URL, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
      cookie,
    },
  });
  const data = unwrapBiliResponse(result);
  return {
    buvid3: data.b_3 || '',
    buvid4: data.b_4 || '',
  };
}

async function fetchBNut({ cookie, userAgent }) {
  const result = await request(BILIBILI_URL, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
      cookie,
    },
  });
  const setCookies = parseSetCookieHeaders(getSetCookieArray(result.headers));
  return {
    buvid3: setCookies.buvid3 || '',
    bNut: setCookies.b_nut || '',
  };
}

function bytesToHex(buffer) {
  return Buffer.from(buffer).toString('hex');
}

function buildBiliTicketSign(ts) {
  return crypto.createHmac('sha256', 'XgwSnGZ1p').update(`ts${ts}`).digest('hex');
}

async function fetchBiliTicket({ csrf, userAgent }) {
  const ts = Math.floor(Date.now() / 1000);
  const hexsign = buildBiliTicketSign(ts);
  const result = await request(BILI_TICKET_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
    },
    query: {
      key_id: 'ec02',
      hexsign,
      'context[ts]': ts,
      csrf: csrf || '',
    },
  });
  const data = unwrapBiliResponse(result);
  return {
    ticket: data.ticket || '',
    createdAt: data.created_at || ts,
    ttl: data.ttl || 0,
    nav: data.nav || {},
  };
}

function getCorrespondPath(timestamp) {
  const encrypted = crypto.publicEncrypt(
    {
      key: CORRESPOND_PUBLIC_KEY_PEM,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(`refresh_${timestamp}`, 'utf8')
  );
  return encrypted.toString('hex');
}

async function checkCookieRefresh({ cookie, userAgent }) {
  if (!cookie) {
    throw new CliError('检查 Cookie 刷新状态失败：缺少 Cookie。');
  }
  const cookieMap = mergeCookieInputs(cookie);
  const csrf = cookieMap.bili_jct || '';
  const result = await request(COOKIE_INFO_URL, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
      cookie,
    },
    query: { csrf },
  });
  const data = unwrapBiliResponse(result);
  return {
    refresh: Boolean(data.refresh),
    timestamp: data.timestamp || 0,
    csrf,
    raw: data,
  };
}

async function fetchRefreshCsrf({ cookie, timestamp, userAgent }) {
  const correspondPath = getCorrespondPath(timestamp);
  const result = await request(`${CORRESPOND_URL_PREFIX}${correspondPath}`, {
    method: 'GET',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
      cookie,
    },
  });
  const html = result.rawBody || '';
  const match = html.match(/<div id="1-name">([^<]+)<\/div>/);
  if (!match) {
    throw new CliError('未能从 correspond 页面中提取 refresh_csrf。', 1, {
      correspondPath,
      bodyPreview: html.slice(0, 500),
    });
  }
  return {
    correspondPath,
    refreshCsrf: match[1].trim(),
  };
}

async function refreshCookie({ cookie, refreshToken, userAgent }) {
  if (!cookie) {
    throw new CliError('刷新 Cookie 失败：缺少当前 Cookie。');
  }
  if (!refreshToken) {
    throw new CliError('刷新 Cookie 失败：缺少 refresh_token。');
  }

  const oldRefreshToken = refreshToken;
  const refreshInfo = await checkCookieRefresh({ cookie, userAgent });
  const { correspondPath, refreshCsrf } = await fetchRefreshCsrf({
    cookie,
    timestamp: refreshInfo.timestamp,
    userAgent,
  });

  const oldCookieMap = mergeCookieInputs(cookie);
  const csrf = oldCookieMap.bili_jct || '';
  const refreshResult = await request(COOKIE_REFRESH_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
      cookie,
    },
    form: {
      csrf,
      refresh_csrf: refreshCsrf,
      source: 'main_web',
      refresh_token: oldRefreshToken,
    },
  });
  const refreshData = unwrapBiliResponse(refreshResult);
  const newCookiePairs = parseSetCookieHeaders(getSetCookieArray(refreshResult.headers));
  const newCookie = serializeCookieMap(mergeCookieInputs(oldCookieMap, newCookiePairs));
  const newRefreshToken = refreshData.refresh_token || '';
  const newCsrf = mergeCookieInputs(newCookie).bili_jct || '';

  await request(COOKIE_CONFIRM_REFRESH_URL, {
    method: 'POST',
    headers: {
      ...DEFAULT_HEADERS,
      'user-agent': userAgent,
      cookie: newCookie,
    },
    form: {
      csrf: newCsrf,
      refresh_token: oldRefreshToken,
    },
  });

  const hydrated = await hydrateSession({
    cookie: newCookie,
    refreshToken: newRefreshToken,
    userAgent,
    qrcodeKey: readSession().qrcodeKey || '',
    loginUrl: readSession().loginUrl || '',
  });

  const mergedSession = {
    ...hydrated.session,
    needRefresh: false,
    refreshCheckAt: new Date().toISOString(),
    refreshTimestamp: refreshInfo.timestamp,
    correspondPath,
  };
  patchSession(mergedSession);

  return {
    cookie: hydrated.cookie,
    refreshToken: newRefreshToken,
    correspondPath,
    refreshCsrf,
    session: mergedSession,
  };
}

async function hydrateSession({ cookie, refreshToken = '', userAgent, qrcodeKey = '', loginUrl = '' }) {
  if (!cookie) {
    throw new CliError('无法补全会话，缺少 Cookie。');
  }

  const baseCookieMap = mergeCookieInputs(cookie);
  const baseCookie = serializeCookieMap(baseCookieMap);
  const csrf = baseCookieMap.bili_jct || '';
  if (!csrf) {
    throw new CliError('登录结果中缺少 bili_jct，无法继续补全会话。');
  }

  const [spi, nut, ticket] = await Promise.all([
    fetchBuvids({ cookie: baseCookie, userAgent }),
    fetchBNut({ cookie: baseCookie, userAgent }),
    fetchBiliTicket({ csrf, userAgent }),
  ]);

  const finalCookieMap = mergeCookieInputs(baseCookieMap, {
    buvid3: spi.buvid3 || nut.buvid3,
    buvid4: spi.buvid4,
    b_nut: nut.bNut,
    bili_ticket: ticket.ticket,
  });
  const finalCookie = serializeCookieMap(finalCookieMap);

  const client = new BilibiliClient({
    cookie: finalCookie,
    userAgent,
  });
  let userInfo = null;
  try {
    userInfo = await client.getUserInfo();
  } catch {
    userInfo = null;
  }

  const sessionRecord = buildSessionRecord(finalCookie, {
    refreshToken,
    qrcodeKey,
    loginUrl,
    ticketCreatedAt: ticket.createdAt || 0,
    ticketTtl: ticket.ttl || 0,
    wbiNav: ticket.nav || {},
    userAgent,
    userInfo,
    devId: readSession().devId || crypto.randomUUID(),
  });

  patchSession(sessionRecord);
  patchSecrets({
    cookie: finalCookie,
    refreshToken,
  });
  updateCredentials({
    cookie: finalCookie,
    userAgent,
  });

  return {
    cookie: finalCookie,
    session: sessionRecord,
    userInfo,
  };
}

module.exports = {
  generateQrCode,
  pollQrCode,
  hydrateSession,
  checkCookieRefresh,
  fetchRefreshCsrf,
  refreshCookie,
  fetchBuvids,
  fetchBNut,
  fetchBiliTicket,
};
