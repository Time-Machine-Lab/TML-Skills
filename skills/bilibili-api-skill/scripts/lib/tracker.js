'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR, ensureDir, readJson, writeJson } = require('./config');

const OPERATIONS_LOG_PATH = path.join(DATA_DIR, 'operations.jsonl');
const CONVERSATIONS_PATH = path.join(DATA_DIR, 'conversations.json');

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
    if (resource === 'comment' && action === 'send') {
      return true;
    }
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

function getConversationByMid(mid) {
  return listConversations().find((item) => item.mid && String(item.mid) === String(mid)) || null;
}

function trackConversationFromCommand(context, payload) {
  const data = payload?.data;
  if (!context || !data) {
    return;
  }

  if (context.resource === 'notify' && context.action === 'replies' && Array.isArray(data.items)) {
    for (const item of data.items) {
      const mid = item.user?.mid;
      if (!mid) {
        continue;
      }
      upsertConversation(`mid:${mid}`, {
        mid: String(mid),
        nickname: item.user?.nickname || '',
        channels: { comment: true },
        lastInboundAt: item.replyTime ? new Date(item.replyTime * 1000).toISOString() : new Date().toISOString(),
        lastInbound: {
          type: 'comment_reply_notification',
          message: item.item?.targetReplyContent || item.item?.sourceContent || '',
          sourceContent: item.item?.sourceContent || '',
          title: item.item?.title || '',
        },
        history: [
          {
            ts: new Date().toISOString(),
            direction: 'inbound',
            type: 'comment_reply_notification',
            payload: sanitizeValue(item),
          },
        ],
      });
    }
  }

  if (context.resource === 'dm' && context.action === 'send' && data.receiverId) {
    upsertConversation(`mid:${data.receiverId}`, {
      mid: String(data.receiverId),
      channels: { dm: true },
      lastOutboundAt: new Date().toISOString(),
      lastOutbound: {
        type: 'dm_send',
        msgKey: data.msgKey || '',
      },
      history: [
        {
          ts: new Date().toISOString(),
          direction: 'outbound',
          type: 'dm_send',
          payload: sanitizeValue(data),
        },
      ],
    });
  }

  if (context.resource === 'dm' && context.action === 'send-image' && data.receiverId) {
    upsertConversation(`mid:${data.receiverId}`, {
      mid: String(data.receiverId),
      channels: { dm: true },
      lastOutboundAt: new Date().toISOString(),
      lastOutbound: {
        type: 'dm_send_image',
        msgKey: data.msgKey || '',
        imageUrl: data.image?.url || '',
      },
      history: [
        {
          ts: new Date().toISOString(),
          direction: 'outbound',
          type: 'dm_send_image',
          payload: sanitizeValue(data),
        },
      ],
    });
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

  if (context.resource === 'dm' && context.action === 'sessions' && Array.isArray(data.items)) {
    for (const item of data.items) {
      upsertConversation(`mid:${item.talkerId}`, {
        mid: String(item.talkerId),
        channels: { dm: true },
        unreadCount: item.unreadCount || 0,
        lastSessionAt: item.sessionTs ? new Date(item.sessionTs * 1000).toISOString() : '',
        lastSession: sanitizeValue(item.lastMsg || null),
      });
    }
  }

  if (context.resource === 'dm' && context.action === 'history' && Array.isArray(data.items) && context.options?.mid) {
    const mid = String(context.options.mid);
    const lastMessage = data.items[data.items.length - 1] || null;
    upsertConversation(`mid:${mid}`, {
      mid,
      channels: { dm: true },
      lastMessageAt: lastMessage?.timestamp ? new Date(lastMessage.timestamp * 1000).toISOString() : '',
      lastMessage: sanitizeValue(lastMessage),
      history: data.items.slice(-10).map((item) => ({
        ts: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : new Date().toISOString(),
        direction: String(item.senderUid) === mid ? 'inbound' : 'outbound',
        type: 'dm_message',
        payload: sanitizeValue(item),
      })),
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
};
