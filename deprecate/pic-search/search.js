const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');
const net = require('net');

const ALLOWED_SORTING = new Set([
  'favorites',
  'relevance',
  'random',
  'toplist',
  'hot',
  'date_added',
]);

const ALLOWED_TOP_RANGE = new Set(['1d', '3d', '1w', '1M', '3M', '1y']);

const ALLOWED_COLORS = new Set(
  [
    '60000',
    '990000',
    'cc0000',
    'cc3333',
    'ea4c88',
    '993399',
    '663399',
    '333399',
    '0066cc',
    '0099cc',
    '66cccc',
    '77cc33',
    '669900',
    '336600',
    '666600',
    '999900',
    'cccc33',
    'ffff00',
    'ffcc33',
    'ff9900',
    'ff6600',
    'cc6633',
    '996633',
    '663300',
    '000000',
    '999999',
    'cccccc',
    'ffffff',
    '424153',
  ].map((s) => String(s).trim().toLowerCase())
);

function normalizeBool(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isTcpPortOpen({ host, port, timeoutMs }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    function finish(ok) {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    }

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function buildWallhavenSearchUrl(params) {
  const {
    q,
    sorting,
    topRange,
    categories,
    purity,
    ratios,
    atleast,
    order,
    colors,
    page,
  } = params || {};

  if (!q || String(q).trim() === '') {
    throw new Error('Missing required param: q');
  }

  const url = new URL('https://wallhaven.cc/search');
  url.searchParams.set('q', String(q));

  if (sorting != null) {
    const s = String(sorting);
    if (!ALLOWED_SORTING.has(s)) {
      throw new Error(`Invalid sorting: ${s}`);
    }
    url.searchParams.set('sorting', s);
  }

  if (topRange != null && String(topRange).trim() !== '') {
    const r = String(topRange).trim();
    const s = sorting == null ? null : String(sorting);
    if (s !== 'toplist') {
      throw new Error(`Param topRange is only available when sorting=toplist. Got sorting=${s}`);
    }
    if (!ALLOWED_TOP_RANGE.has(r)) {
      throw new Error(
        `Invalid topRange: ${r}. Allowed: ${Array.from(ALLOWED_TOP_RANGE).join(', ')}`
      );
    }
    url.searchParams.set('topRange', r);
  }

  url.searchParams.set('categories', categories != null ? String(categories) : '111');
  url.searchParams.set('purity', purity != null ? String(purity) : '100');
  url.searchParams.set('atleast', atleast != null ? String(atleast) : '1920x1080');
  url.searchParams.set('order', order != null ? String(order) : 'desc');

  if (ratios != null && String(ratios).trim() !== '') {
    url.searchParams.set('ratios', String(ratios));
  }

  if (colors != null && String(colors).trim() !== '') {
    const raw = String(colors).trim();
    if (raw.includes(',')) {
      throw new Error(`Invalid colors: only one value is supported. Got: ${raw}`);
    }

    const normalized = raw.toLowerCase();
    if (!ALLOWED_COLORS.has(normalized)) {
      throw new Error(
        `Invalid colors: ${raw}. Allowed: ${Array.from(ALLOWED_COLORS).join(', ')}`
      );
    }
    url.searchParams.set('colors', normalized);
  }

  if (page != null) {
    url.searchParams.set('page', String(page));
  }

  return url.toString();
}

function httpGetText(targetUrl, { timeoutMs = 20000, agent } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      targetUrl,
      {
        method: 'GET',
        agent: agent || undefined,
        headers: {
          'User-Agent': 'wallhaven-skill/1.0 (+https://wallhaven.cc)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip,deflate',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          const redirectUrl = new URL(location, targetUrl).toString();
          res.resume();
          httpGetText(redirectUrl, { timeoutMs, agent }).then(resolve, reject);
          return;
        }

        if (status < 200 || status >= 300) {
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const err = new Error(`HTTP ${status} for ${targetUrl}\n${body.slice(0, 500)}`);
            err.statusCode = status;
            err.headers = res.headers;
            reject(err);
          });
          return;
        }

        let stream = res;
        const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

        const chunks = [];
        stream.on('data', (d) => chunks.push(d));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms: ${targetUrl}`));
    });
    req.end();
  });
}

async function httpGetTextWithRetry(
  targetUrl,
  { timeoutMs = 20000, agent, retry429 = 3, minBackoffMs = 1200, maxBackoffMs = 12000 } = {}
) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await httpGetText(targetUrl, { timeoutMs, agent });
    } catch (err) {
      const status = err && err.statusCode;
      const is429 = status === 429;
      if (!is429 || attempt >= retry429) throw err;

      const headers = (err && err.headers) || {};
      const retryAfter = headers['retry-after'];
      let waitMs;
      if (retryAfter != null && String(retryAfter).trim() !== '' && !Number.isNaN(Number(retryAfter))) {
        waitMs = Math.min(maxBackoffMs, Math.max(minBackoffMs, Number(retryAfter) * 1000));
      } else {
        const base = Math.min(maxBackoffMs, minBackoffMs * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 400);
        waitMs = base + jitter;
      }

      await sleep(waitMs);
      attempt += 1;
    }
  }
}

function normalizeProxyUrl(proxy) {
  const raw = proxy == null ? '' : String(proxy).trim();
  if (raw === '') return null;

  const withScheme = raw.includes('://') ? raw : `http://${raw}`;
  const u = new URL(withScheme);
  const protocol = String(u.protocol || '').toLowerCase();
  if (protocol !== 'http:') {
    throw new Error(`Only HTTP proxy is supported (via CONNECT). Got: ${u.protocol}`);
  }

  // Ensure it keeps the full original (including auth if any)
  return u.toString();
}

function getProxyUrlFromParamsOrEnv(params) {
  if (params && params.proxy != null && String(params.proxy).trim() !== '') {
    return normalizeProxyUrl(params.proxy);
  }

  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (envProxy && String(envProxy).trim() !== '') {
    return normalizeProxyUrl(envProxy);
  }

  return null;
}

async function getDefaultLocalProxyUrl() {
  // 最常见：Clash / v2rayN / sing-box 开在 127.0.0.1:7890
  const host = '127.0.0.1';
  const port = 7890;
  const ok = await isTcpPortOpen({ host, port, timeoutMs: 250 });
  return ok ? `http://${host}:${port}` : null;
}

function extractWallpaperIdsFromHtml(html) {
  const ids = new Set();

  // 用户指定的 class: <a class="jsAnchor overlay-anchor wall-favs" data-href="https://wallhaven.cc/wallpaper/fav/0p82om">
  const favRe = /data-href="https:\/\/wallhaven\.cc\/wallpaper\/fav\/([a-z0-9]+)"/gi;
  for (let m = favRe.exec(html); m; m = favRe.exec(html)) {
    ids.add(m[1]);
  }

  // 兜底：搜索页常见的详情页链接 https://wallhaven.cc/w/xxxxxx
  const wRe = /href="https:\/\/wallhaven\.cc\/w\/([a-z0-9]+)"/gi;
  for (let m = wRe.exec(html); m; m = wRe.exec(html)) {
    ids.add(m[1]);
  }

  return Array.from(ids);
}

function extractDirectImageFromWallpaperHtml(html) {
  // 详情页里通常有 <img id="wallpaper" src="https://w.wallhaven.cc/full/...jpg">
  const re = /<img[^>]*id="wallpaper"[^>]*src="([^"]+)"/i;
  const m = re.exec(html);
  return m ? m[1] : null;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }

  const workers = [];
  const n = Math.max(1, Math.min(concurrency, items.length));
  for (let i = 0; i < n; i += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

/**
 * 搜索并返回链接数组
 * @param {object} params
 * @param {string} params.q 搜索关键词
 * @param {string} [params.sorting] favorites|relevance|random|toplist|hot|date_added
 * @param {string} [params.topRange] 1d|3d|1w|1M|3M|1y（仅 sorting=toplist 可用）
 * @param {string} [params.categories] 三位 0/1，默认 111
 * @param {string} [params.purity] 默认 100
 * @param {string} [params.ratios] 可多选，用逗号分隔
 * @param {string} [params.atleast] 默认 1920x1080
 * @param {string} [params.order] asc|desc，默认 desc
 * @param {string} [params.colors] 单选，可为空
 * @param {number|string} [params.page]
 * @param {boolean} [params.direct] true 则返回直链图片，否则返回详情页链接
 * @param {number|string} [params.timeoutMs] 单次请求超时（毫秒），默认 20000
 * @param {number|string} [params.timeout] 同 timeoutMs（兼容字段）
 * @returns {Promise<string[]>}
 */
async function searchWallhaven(params) {
  const direct = params && params.direct == null ? true : normalizeBool(params && params.direct);
  const timeoutMsRaw = params && (params.timeoutMs != null ? params.timeoutMs : params.timeout);
  const timeoutMs =
    timeoutMsRaw == null || String(timeoutMsRaw).trim() === ''
      ? 20000
      : Math.max(1000, Number(timeoutMsRaw));

  let proxyUrl = getProxyUrlFromParamsOrEnv(params);
  if (!proxyUrl) {
    proxyUrl = await getDefaultLocalProxyUrl();
  }
  
  let agent;
  if (proxyUrl) {
    try {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      agent = new HttpsProxyAgent(proxyUrl);
    } catch (e) {
       // Ignore or warn if verbose
       // console.warn('Note: Proxy found but https-proxy-agent not installed. Ignoring proxy.');
    }
  }

  const url = buildWallhavenSearchUrl(params);
  const html = await httpGetTextWithRetry(url, { timeoutMs, agent });
  const ids = extractWallpaperIdsFromHtml(html);

  if (!direct) {
    return ids.map((id) => `https://wallhaven.cc/w/${id}`);
  }

  // 访问详情页拿直链更容易触发 429：降低并发并在每次请求前做轻微延时
  const detailConcurrency = 2;
  const minDelayMs = 450;
  const jitterMs = 350;

  const links = await mapWithConcurrency(ids, detailConcurrency, async (id) => {
    await sleep(minDelayMs + Math.floor(Math.random() * jitterMs));

    const pageHtml = await httpGetTextWithRetry(`https://wallhaven.cc/w/${id}`, {
      timeoutMs,
      agent,
      retry429: 4,
      minBackoffMs: 1500,
      maxBackoffMs: 15000,
    });
    const img = extractDirectImageFromWallpaperHtml(pageHtml);
    return img || `https://wallhaven.cc/w/${id}`;
  });

  return links;
}

module.exports = {
  buildWallhavenSearchUrl,
  extractWallpaperIdsFromHtml,
  searchWallhaven,
};
