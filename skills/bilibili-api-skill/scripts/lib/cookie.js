'use strict';

const { CliError } = require('./errors');

function extractCsrf(cookie) {
  if (!cookie) {
    return null;
  }
  const match = cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/);
  return match ? match[1] : null;
}

function requireCookie(cookie) {
  if (!cookie) {
    throw new CliError(
      '缺少 Bilibili Cookie。',
      1,
      null,
      '可以直接告诉 agent“帮我登录 B 站”，或手动执行 `node scripts/bili.js auth qr-generate` 后扫码，再执行 `node scripts/bili.js auth qr-poll`。也可以用 `node scripts/bili.js system paths` 查看运行态配置路径。'
    );
  }
  return cookie;
}

function requireCsrf(cookie) {
  const csrf = extractCsrf(cookie);
  if (!csrf) {
    throw new CliError(
      'Cookie 中缺少 bili_jct，无法执行写操作。',
      1,
      null,
      '当前登录态不完整。建议重新执行二维码登录，或先用 `node scripts/bili.js session hydrate --cookie "<cookie>"` 补全会话材料。'
    );
  }
  return csrf;
}

module.exports = {
  extractCsrf,
  requireCookie,
  requireCsrf,
};
