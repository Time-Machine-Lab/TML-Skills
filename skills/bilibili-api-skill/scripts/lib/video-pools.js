'use strict';

const path = require('path');
const { VIDEO_POOLS_DIR, ensureDir, readJson, writeJson } = require('./config');
const { CliError } = require('./errors');

const VIDEO_POOL_INDEX_PATH = path.join(VIDEO_POOLS_DIR, 'index.json');
const READY_STATUSES = ['approved', 'new'];
const RESERVED_STATUS = 'reserved';
const RESERVATION_TTL_SEC = 30 * 60;

function nowIso() {
  return new Date().toISOString();
}

function safeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function ensureVideoPoolsDir() {
  ensureDir(VIDEO_POOLS_DIR);
  return VIDEO_POOLS_DIR;
}

function videoPoolPath(id) {
  ensureVideoPoolsDir();
  return path.join(VIDEO_POOLS_DIR, `${id}.json`);
}

function buildPoolId(productSlug) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `pool-${safeSlug(productSlug || 'generic')}-${stamp}`;
}

function readVideoPoolIndex() {
  return readJson(VIDEO_POOL_INDEX_PATH, { items: [] });
}

function writeVideoPoolIndex(payload) {
  ensureVideoPoolsDir();
  writeJson(VIDEO_POOL_INDEX_PATH, payload);
  return payload;
}

function normalizeKeywordScores(keywordScores) {
  return Object.fromEntries(
    Object.entries(keywordScores || {}).map(([keyword, score]) => [
      keyword,
      {
        total: Number(score?.total || 0),
        rank: Number(score?.rank || 0),
        cohortSize: Number(score?.cohortSize || 0),
        components: score?.components || {},
        stats: score?.stats || {},
      },
    ])
  );
}

function normalizePoolItem(item, index) {
  const sourceKeywords = Array.from(new Set((item.sourceKeywords || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const keywordScores = normalizeKeywordScores(item.keywordScores || {});
  const metricPlay = Number(item.playCount || item.play_count || 0);
  const metricComments = Number(item.commentCount || item.comment_count || 0);
  const metricFavorites = Number(item.favoriteCount || item.favorite_count || 0);
  return {
    bvid: String(item.bvid || '').trim(),
    aid: Number(item.aid || 0),
    title: String(item.title || '').trim(),
    author: String(item.author || '').trim(),
    authorMid: Number(item.authorMid || item.author_mid || 0),
    publishDate: String(item.publishDate || item.publish_date || '').trim(),
    description: String(item.description || '').trim(),
    playCount: metricPlay,
    commentCount: metricComments,
    favoriteCount: metricFavorites,
    likeCount: Number(item.likeCount || item.like_count || 0),
    duration: String(item.duration || '').trim(),
    category: item.category || null,
    sourceKeywords,
    keywordScores,
    mergedScore: Number(item.mergedScore || 0),
    selectedKeyword: String(item.selectedKeyword || sourceKeywords[0] || '').trim(),
    poolStatus: String(item.poolStatus || 'new').trim() || 'new',
    manualSeed: Boolean(item.manualSeed),
    externalSource: String(item.externalSource || (item.manualSeed ? 'manual-bvid' : 'search')).trim(),
    collectedAt: String(item.collectedAt || nowIso()),
    updatedAt: String(item.updatedAt || item.collectedAt || nowIso()),
    statusReason: String(item.statusReason || '').trim(),
    consumedAt: String(item.consumedAt || '').trim(),
    campaignId: String(item.campaignId || '').trim(),
    reservedAt: String(item.reservedAt || '').trim(),
    reservationExpiresAt: String(item.reservationExpiresAt || '').trim(),
    reservationSourceStatus: String(item.reservationSourceStatus || '').trim(),
    lastReleasedAt: String(item.lastReleasedAt || '').trim(),
    lastReleaseReason: String(item.lastReleaseReason || '').trim(),
    index: Number(item.index != null ? item.index : index),
  };
}

function countStatuses(items) {
  return (items || []).reduce((acc, item) => {
    const key = String(item.poolStatus || 'new');
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildVideoPoolSummary(pool) {
  const items = Array.isArray(pool.items) ? pool.items : [];
  const statuses = countStatuses(items);
  return {
    id: pool.id,
    productSlug: pool.productSlug || '',
    productTitle: pool.productTitle || '',
    createdAt: pool.createdAt,
    updatedAt: pool.updatedAt,
    path: videoPoolPath(pool.id),
    keywordCount: (pool.keywords || []).length,
    itemCount: items.length,
    statusCounts: statuses,
    readyCount: READY_STATUSES.reduce((total, status) => total + Number(statuses[status] || 0), 0),
    topCandidates: items
      .slice()
      .sort((a, b) => selectionScore(b) - selectionScore(a))
      .slice(0, 5)
      .map((item) => ({
        bvid: item.bvid,
        title: item.title,
        mergedScore: item.mergedScore,
        selectionScore: selectionScore(item),
        poolStatus: item.poolStatus,
        sourceKeywords: item.sourceKeywords,
      })),
  };
}

function parseTime(value) {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

function promotionPenalty(item) {
  const text = `${String(item?.title || '')}\n${String(item?.description || '')}`.toLowerCase();
  let penalty = 0;
  const patterns = [
    /免费/,
    /送账号/,
    /无限多开/,
    /自动切号/,
    /异步拿结果/,
    /入群/,
    /授权码/,
    /推广期间/,
    /一键三连/,
    /传送门/,
    /福利/,
    /下载链接/,
    /官网/,
  ];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      penalty += 8;
    }
  }
  return penalty;
}

function selectionScore(item) {
  return Number(item?.mergedScore || 0) - promotionPenalty(item);
}

function reconcilePoolReservations(pool, now = Date.now()) {
  let changed = false;
  const released = [];
  for (const item of pool.items || []) {
    if (String(item.poolStatus || '') !== RESERVED_STATUS) {
      continue;
    }
    const expiresAt = parseTime(item.reservationExpiresAt);
    const reservedAt = parseTime(item.reservedAt);
    const fallbackExpiry = reservedAt ? reservedAt + RESERVATION_TTL_SEC * 1000 : 0;
    const effectiveExpiry = expiresAt || fallbackExpiry;
    if (!effectiveExpiry || effectiveExpiry > now) {
      continue;
    }
    item.poolStatus = item.reservationSourceStatus || 'approved';
    item.lastReleasedAt = nowIso();
    item.lastReleaseReason = 'reservation_expired';
    item.statusReason = 'reserved 状态已过期，自动释放回可执行状态。';
    item.updatedAt = item.lastReleasedAt;
    item.reservedAt = '';
    item.reservationExpiresAt = '';
    item.reservationSourceStatus = '';
    changed = true;
    released.push({
      bvid: item.bvid,
      poolStatus: item.poolStatus,
      campaignId: item.campaignId || '',
    });
  }
  return {
    pool,
    changed,
    released,
  };
}

function refreshPool(pool) {
  if (!pool) {
    return null;
  }
  const reconciled = reconcilePoolReservations(pool);
  if (!reconciled.changed) {
    return pool;
  }
  return saveVideoPool(reconciled.pool);
}

function saveVideoPool(pool) {
  ensureVideoPoolsDir();
  const normalizedItems = (pool.items || []).map((item, index) => normalizePoolItem(item, index));
  const payload = {
    ...pool,
    id: String(pool.id || buildPoolId(pool.productSlug || 'generic')),
    productSlug: String(pool.productSlug || '').trim(),
    productTitle: String(pool.productTitle || '').trim(),
    keywords: Array.from(new Set((pool.keywords || []).map((value) => String(value || '').trim()).filter(Boolean))),
    createdAt: String(pool.createdAt || nowIso()),
    updatedAt: nowIso(),
    params: pool.params || {},
    stats: pool.stats || {},
    items: normalizedItems,
  };
  writeJson(videoPoolPath(payload.id), payload);
  const db = readVideoPoolIndex();
  const items = Array.isArray(db.items) ? db.items : [];
  const summary = buildVideoPoolSummary(payload);
  const index = items.findIndex((item) => item.id === payload.id);
  if (index >= 0) {
    items[index] = summary;
  } else {
    items.unshift(summary);
  }
  writeVideoPoolIndex({ items: items.slice(0, 200) });
  return payload;
}

function getVideoPool(id) {
  if (!id) {
    return null;
  }
  return refreshPool(readJson(videoPoolPath(id), null));
}

function listVideoPools({ productSlug = '' } = {}) {
  const items = readVideoPoolIndex().items || [];
  const pools = items
    .map((item) => getVideoPool(item.id))
    .filter(Boolean)
    .map((pool) => buildVideoPoolSummary(pool));
  if (!productSlug) {
    return pools;
  }
  return pools.filter((item) => String(item.productSlug || '') === String(productSlug));
}

function dedupeKeywords(values) {
  return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)));
}

function deriveProductKeywords(product, extraKeywords = []) {
  const profile = product?.profile || {};
  const values = [
    product?.slug || '',
    profile.title || '',
    ...(Array.isArray(profile.keywords) ? profile.keywords : []),
    ...(Array.isArray(profile.audience) ? profile.audience : []),
    ...(Array.isArray(profile.sellingPoints) ? profile.sellingPoints : []),
    ...extraKeywords,
  ];
  return dedupeKeywords(values).slice(0, 12);
}

function buildPoolFromCollection({
  product = null,
  keywords = [],
  collection = {},
  params = {},
}) {
  const mergedItems = (collection.merged?.items || []).map((item, index) =>
    normalizePoolItem(
      {
        ...item,
        poolStatus: item.poolStatus || 'new',
        collectedAt: collection.fetchedAt || nowIso(),
      },
      index
    )
  );

  return {
    id: buildPoolId(product?.slug || params.productSlug || 'generic'),
    productSlug: product?.slug || params.productSlug || '',
    productTitle: product?.profile?.title || product?.slug || '',
    keywords: dedupeKeywords(keywords),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    params,
    stats: {
      keywordCount: Number(collection.keywordCount || (collection.byKeyword || []).length || 0),
      rawCandidateCount: Number(collection.rawCandidateCount || 0),
      mergedCandidateCount: Number(collection.merged?.items?.length || mergedItems.length),
      filteredCandidateCount: Number(collection.filteredCandidateCount || 0),
    },
    items: mergedItems,
    byKeyword: collection.byKeyword || [],
  };
}

function getPreferredPools({ poolId = '', productSlug = '' } = {}) {
  if (poolId) {
    const pool = getVideoPool(poolId);
    if (!pool) {
      throw new CliError(`未找到候选池：${poolId}`);
    }
    return [pool];
  }
  const summaries = listVideoPools({ productSlug });
  return summaries
    .map((item) => getVideoPool(item.id))
    .filter(Boolean)
    .sort((a, b) => Date.parse(String(b.updatedAt || '')) - Date.parse(String(a.updatedAt || '')));
}

function pickCandidate(items, preferredStatuses, { campaignId = '', excludeBvid = '' } = {}) {
  const owner = String(campaignId || '').trim();
  const excluded = String(excludeBvid || '').trim();
  if (owner) {
    const existingReserved = (items || []).find((item) =>
      String(item.poolStatus || '') === RESERVED_STATUS &&
      String(item.campaignId || '') === owner &&
      String(item.bvid || '') !== excluded
    );
    if (existingReserved) {
      return existingReserved;
    }
  }
  const ready = (items || [])
    .filter((item) => String(item.bvid || '') !== excluded)
    .filter((item) => preferredStatuses.includes(String(item.poolStatus || 'new')))
    .sort((a, b) => {
      if (Boolean(b.manualSeed) !== Boolean(a.manualSeed)) {
        return Number(Boolean(b.manualSeed)) - Number(Boolean(a.manualSeed));
      }
      if (selectionScore(b) !== selectionScore(a)) {
        return selectionScore(b) - selectionScore(a);
      }
      if (Number(b.mergedScore || 0) !== Number(a.mergedScore || 0)) {
        return Number(b.mergedScore || 0) - Number(a.mergedScore || 0);
      }
      return Number(a.index || 0) - Number(b.index || 0);
    });
  return ready[0] || null;
}

function reserveNextCandidate({ productSlug = '', poolId = '', campaignId = '', excludeBvid = '' } = {}) {
  const pools = getPreferredPools({ poolId, productSlug });
  for (const pool of pools) {
    const owner = String(campaignId || '').trim();
    const excluded = String(excludeBvid || '').trim();
    if (owner && excluded) {
      const previous = (pool.items || []).find((item) =>
        String(item.poolStatus || '') === RESERVED_STATUS &&
        String(item.campaignId || '') === owner &&
        String(item.bvid || '') === excluded
      );
      if (previous) {
        previous.poolStatus = previous.reservationSourceStatus || 'approved';
        previous.lastReleasedAt = nowIso();
        previous.lastReleaseReason = 'campaign_hop';
        previous.statusReason = 'campaign 已切到下一个视频，当前预留已释放。';
        previous.updatedAt = previous.lastReleasedAt;
        previous.reservedAt = '';
        previous.reservationExpiresAt = '';
        previous.reservationSourceStatus = '';
      }
    }
    const candidate = pickCandidate(pool.items, READY_STATUSES, { campaignId, excludeBvid });
    if (!candidate) {
      continue;
    }
    const target = pool.items.find((item) => item.bvid === candidate.bvid);
    if (String(target.poolStatus || '') !== RESERVED_STATUS) {
      const reservedAt = nowIso();
      target.reservationSourceStatus = String(target.poolStatus || 'approved');
      target.poolStatus = RESERVED_STATUS;
      target.reservedAt = reservedAt;
      target.reservationExpiresAt = new Date(Date.parse(reservedAt) + RESERVATION_TTL_SEC * 1000).toISOString();
      target.updatedAt = reservedAt;
      target.statusReason = String(campaignId || '').trim()
        ? `已为 campaign ${campaignId} 预留候选视频。`
        : '已预留候选视频，等待后续执行。';
      target.campaignId = String(campaignId || '').trim();
    }
    const saved = saveVideoPool(pool);
    return {
      pool: buildVideoPoolSummary(saved),
      candidate: target,
    };
  }
  throw new CliError(
    productSlug ? `产品 ${productSlug} 当前没有可消费的候选视频。` : '当前没有可消费的候选视频。',
    1,
    {
      productSlug,
      poolId,
    },
    '先执行 `node scripts/bili.js candidate collect --product "<slug>" --target-count 30` 建候选池，或检查现有候选池里是否都已经 consumed / reserved / blacklisted。'
  );
}

function finalizeCandidateConsumption({ campaignId = '', bvid = '', poolId = '' } = {}) {
  const targetBvid = String(bvid || '').trim();
  if (!targetBvid) {
    return null;
  }
  const pools = getPreferredPools({ poolId, productSlug: '' });
  for (const pool of pools) {
    const target = (pool.items || []).find((item) => {
      if (String(item.bvid || '') !== targetBvid) {
        return false;
      }
      if (String(item.poolStatus || '') !== RESERVED_STATUS) {
        return false;
      }
      if (campaignId && String(item.campaignId || '') !== String(campaignId)) {
        return false;
      }
      return true;
    });
    if (!target) {
      continue;
    }
    target.poolStatus = 'consumed';
    target.consumedAt = nowIso();
    target.updatedAt = target.consumedAt;
    target.statusReason = campaignId ? `候选视频已由 campaign ${campaignId} 成功消费。` : '候选视频已成功消费。';
    target.reservationSourceStatus = '';
    target.reservationExpiresAt = '';
    const saved = saveVideoPool(pool);
    return {
      pool: buildVideoPoolSummary(saved),
      candidate: target,
    };
  }
  return null;
}

function updateCandidateStatus({ poolId, bvid, status, reason = '', campaignId = '' }) {
  const pool = getVideoPool(poolId);
  if (!pool) {
    throw new CliError(`未找到候选池：${poolId}`);
  }
  const target = (pool.items || []).find((item) => String(item.bvid) === String(bvid));
  if (!target) {
    throw new CliError(`候选池 ${poolId} 中不存在视频：${bvid}`);
  }
  target.poolStatus = String(status || target.poolStatus || 'new');
  target.statusReason = String(reason || '').trim();
  target.updatedAt = nowIso();
  if (target.poolStatus === RESERVED_STATUS) {
    target.reservationSourceStatus = target.reservationSourceStatus || 'approved';
    target.reservedAt = target.reservedAt || target.updatedAt;
    target.reservationExpiresAt = target.reservationExpiresAt || new Date(parseTime(target.reservedAt) + RESERVATION_TTL_SEC * 1000).toISOString();
  } else {
    target.reservedAt = '';
    target.reservationExpiresAt = '';
    target.reservationSourceStatus = '';
  }
  if (target.poolStatus === 'consumed') {
    target.consumedAt = target.updatedAt;
  }
  if (campaignId) {
    target.campaignId = String(campaignId);
  }
  const saved = saveVideoPool(pool);
  return {
    pool: buildVideoPoolSummary(saved),
    candidate: target,
  };
}

module.exports = {
  VIDEO_POOL_INDEX_PATH,
  READY_STATUSES,
  ensureVideoPoolsDir,
  buildPoolId,
  buildVideoPoolSummary,
  saveVideoPool,
  getVideoPool,
  listVideoPools,
  deriveProductKeywords,
  buildPoolFromCollection,
  reserveNextCandidate,
  finalizeCandidateConsumption,
  updateCandidateStatus,
};
