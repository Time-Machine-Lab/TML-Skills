'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR, ensureDir, readJson, writeJson } = require('./config');

const OPERATIONS_LOG_PATH = path.join(DATA_DIR, 'operations.jsonl');
const CONVERSATIONS_PATH = path.join(DATA_DIR, 'conversations.json');

function parseTime(value) {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

function appendJsonl(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) {
    return '[truncated]';
  }
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 800 ? `${value.slice(0, 800)}...[truncated]` : value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (['cookie', 'refreshToken', 'refresh_token', 'csrf', 'csrf_token', 'biliTicket'].includes(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = sanitizeValue(item, depth + 1);
  }
  return output;
}

function recordOperation({ status, context, payload, error }) {
  appendJsonl(OPERATIONS_LOG_PATH, {
    ts: new Date().toISOString(),
    status,
    command: context,
    payload: payload ? sanitizeValue(payload) : undefined,
    error: error ? { message: error.message, details: sanitizeValue(error.details || null) } : undefined,
  });
}

function readRecentOperations(limit = 400) {
  try {
    const text = fs.readFileSync(OPERATIONS_LOG_PATH, 'utf8');
    const lines = text.trim().split('\n').filter(Boolean);
    return lines
      .slice(-Math.max(limit, 1))
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function filterOperationsByCampaign(items, campaignId) {
  const target = String(campaignId || '').trim();
  if (!target) {
    return items;
  }
  return (items || []).filter((item) => {
    const payloadCampaignId = String(item.payload?.data?.campaignId || '').trim();
    const optionCampaignId = String(item.command?.options?.campaign || '').trim();
    return payloadCampaignId === target || optionCampaignId === target;
  });
}

function getPublicSendThrottleStatus(settings, now = Date.now()) {
  const operations = readRecentOperations(800);
  const hourAgo = now - 60 * 60 * 1000;
  const minGapMs = Math.max(Number(settings.publicCommentMinGapSec || 1200), 60) * 1000;
  const commentMaxPerHour = Math.max(Number(settings.publicCommentMaxPerHour || 2), 1);
  const replyMaxPerHour = Math.max(Number(settings.publicReplyMaxPerHour || 3), 1);

  const publicSends = operations.filter((item) => {
    if (item.status !== 'ok') {
      return false;
    }
    const resource = item.command?.resource || '';
    const action = item.command?.action || '';
    if (resource === 'thread' && action === 'send' && item.payload?.data?.channel === 'comment') {
      return true;
    }
    return false;
  });

  const latest = publicSends
    .map((item) => ({ ...item, tsMs: Date.parse(String(item.ts || '')) || 0 }))
    .sort((a, b) => b.tsMs - a.tsMs)[0] || null;

  const recentHour = publicSends.filter((item) => {
    const ts = Date.parse(String(item.ts || '')) || 0;
    return ts >= hourAgo;
  });

  const replyCountPerHour = recentHour.filter((item) => {
    const root = item.command?.options?.root || item.payload?.data?.commentTarget?.root || '';
    return Boolean(String(root || '').trim());
  }).length;
  const commentCountPerHour = recentHour.length - replyCountPerHour;

  const latestTs = latest?.tsMs || 0;
  const nextAllowedAtMs = latestTs ? latestTs + minGapMs : 0;
  const blockedByGap = Boolean(nextAllowedAtMs && nextAllowedAtMs > now);
  const blockedByHourlyCap = commentCountPerHour >= commentMaxPerHour || replyCountPerHour >= replyMaxPerHour;

  let reason = '';
  if (blockedByGap) {
    reason = 'public_min_gap';
  } else if (commentCountPerHour >= commentMaxPerHour) {
    reason = 'public_comment_hourly_cap';
  } else if (replyCountPerHour >= replyMaxPerHour) {
    reason = 'public_reply_hourly_cap';
  }

  return {
    blocked: blockedByGap || blockedByHourlyCap,
    reason,
    latestPublicSendAt: latest?.ts || '',
    nextAllowedAt: nextAllowedAtMs ? new Date(nextAllowedAtMs).toISOString() : '',
    commentCountPerHour,
    replyCountPerHour,
    limits: {
      publicCommentMinGapSec: Number(settings.publicCommentMinGapSec || 1200),
      publicCommentMaxPerHour: commentMaxPerHour,
      publicReplyMaxPerHour: replyMaxPerHour,
    },
  };
}

function readConversations() {
  return readJson(CONVERSATIONS_PATH, { items: [] });
}

function writeConversations(data) {
  writeJson(CONVERSATIONS_PATH, data);
  return data;
}

function upsertConversation(key, patch) {
  const db = readConversations();
  const items = Array.isArray(db.items) ? db.items : [];
  const index = items.findIndex((item) => item.key === key);
  const existing = index >= 0 ? items[index] : { key, tags: [], channels: {}, history: [] };
  const next = {
    ...existing,
    ...patch,
    tags: Array.from(new Set([...(existing.tags || []), ...(patch.tags || [])])),
    channels: {
      ...(existing.channels || {}),
      ...(patch.channels || {}),
    },
    history: [...(existing.history || []), ...(patch.history || [])].slice(-50),
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }
  writeConversations({ items });
  return next;
}

function listConversations() {
  const db = readConversations();
  return Array.isArray(db.items) ? db.items : [];
}

function conversationLastActivityAt(item) {
  return Math.max(
    parseTime(item?.lastInboundAt),
    parseTime(item?.lastOutboundAt),
    parseTime(item?.lastSessionAt)
  );
}

function shouldKeepConversation(item, now = Date.now()) {
  if (!item) {
    return false;
  }
  if (Number(item.unreadCount || 0) > 0) {
    return true;
  }
  const lastActivityAt = conversationLastActivityAt(item);
  if (!lastActivityAt) {
    return false;
  }
  const isCommentOnly = Boolean(item.channels?.comment) && !Boolean(item.channels?.dm);
  const isDmThread = Boolean(item.channels?.dm);
  if (isCommentOnly) {
    return lastActivityAt >= now - 72 * 60 * 60 * 1000;
  }
  if (isDmThread) {
    return lastActivityAt >= now - 14 * 24 * 60 * 60 * 1000;
  }
  return lastActivityAt >= now - 7 * 24 * 60 * 60 * 1000;
}

function compactConversations({ now = Date.now() } = {}) {
  const db = readConversations();
  const items = Array.isArray(db.items) ? db.items : [];
  const kept = items.filter((item) => shouldKeepConversation(item, now));
  if (kept.length !== items.length) {
    writeConversations({ items: kept });
  }
  return kept;
}

function getConversationByMid(mid) {
  return listConversations().find((item) => item.mid && String(item.mid) === String(mid)) || null;
}

function trackConversationFromCommand(context, payload) {
  const data = payload?.data;
  if (!context || !data) {
    return;
  }

  if (context.resource === 'thread' && context.action === 'send' && data.targetMid) {
    upsertConversation(`mid:${data.targetMid}`, {
      mid: String(data.targetMid),
      channels: { [data.channel || 'dm']: true },
      lastOutboundAt: new Date().toISOString(),
      lastOutbound: {
        type: `${data.channel || 'dm'}_send`,
        message: data.message || '',
        productSlug: data.productSlug || '',
      },
      history: [
        {
          ts: new Date().toISOString(),
          direction: 'outbound',
          type: `${data.channel || 'dm'}_send`,
          payload: sanitizeValue(data),
        },
      ],
    });
  }
}

module.exports = {
  OPERATIONS_LOG_PATH,
  CONVERSATIONS_PATH,
  recordOperation,
  readRecentOperations,
  filterOperationsByCampaign,
  getPublicSendThrottleStatus,
  trackConversationFromCommand,
  listConversations,
  getConversationByMid,
  upsertConversation,
  sanitizeValue,
  compactConversations,
  shouldKeepConversation,
  conversationLastActivityAt,
};
