'use strict';

const zlib = require('zlib');
const { CliError } = require('./errors');

async function readResponseBody(response, decompressDeflate = false) {
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (decompressDeflate) {
    return zlib.inflateRawSync(buffer).toString('utf8');
  }
  return buffer.toString('utf8');
}

async function request(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    query,
    form,
    json,
    decompressDeflate = false,
  } = options;

  const target = new URL(url);
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        target.searchParams.set(key, String(value));
      }
    }
  }

  const finalHeaders = { ...headers };
  let body;

  if (form) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (value !== undefined && value !== null) {
        body.set(key, String(value));
      }
    }
    finalHeaders['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  } else if (json) {
    body = JSON.stringify(json);
    finalHeaders['content-type'] = 'application/json; charset=UTF-8';
  }

  const response = await fetch(target, {
    method,
    headers: finalHeaders,
    body,
  });

  const rawBody = await readResponseBody(response, decompressDeflate);
  let parsedBody = rawBody;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = rawBody;
  }

  if (!response.ok) {
    throw new CliError(`HTTP ${response.status} ${response.statusText}`, response.status, {
      url: target.toString(),
      body: parsedBody,
    });
  }

  return {
    status: response.status,
    headers: response.headers,
    body: parsedBody,
    rawBody,
    url: target.toString(),
  };
}

function unwrapBiliResponse(result) {
  const payload = result.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload.code === 'number') {
    const message = payload.message || payload.msg || '';
    if (payload.code !== 0) {
      let hint = '';
      if (payload.code === -404) {
        hint = '视频/资源不存在，或传入的 BV/AV 号大小写有误。优先直接粘贴完整 B 站链接，避免手动改动 BV 号。';
      } else if (payload.code === -352) {
        hint = '请求被风控拦截。建议补完整登录态，降低调用频率，或稍后再试。';
      } else if (payload.code === -403) {
        hint = '当前接口权限不足。通常需要完整登录态，或该资源本身受限。';
      }
      throw new CliError(`Bilibili API 错误: code=${payload.code}, message=${message}`, 1, payload, hint);
    }
  }

  return payload.data !== undefined ? payload.data : payload;
}

module.exports = {
  request,
  unwrapBiliResponse,
};
