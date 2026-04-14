'use strict';

const { listConversations, getConversationByMid, upsertConversation } = require('./tracker');

function parseTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function toIso(value) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return '';
  }
  return new Date(value).toISOString();
}

function secondsSince(value, now) {
  const ts = parseTime(value);
  if (!ts) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor((now - ts) / 1000));
}

function countHistory(history, predicate) {
  return (history || []).reduce((count, item) => (predicate(item) ? count + 1 : count), 0);
}

function latestHistoryTs(history, predicate) {
  return (history || []).reduce((latest, item) => {
    if (!predicate(item)) {
      return latest;
    }
    const ts = parseTime(item.ts);
    return ts > latest ? ts : latest;
  }, 0);
}

function readRecentMetrics(conversation, now) {
  const history = Array.isArray(conversation.history) ? conversation.history : [];
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const hourAgo = now - 60 * 60 * 1000;
  const tenMinAgo = now - 10 * 60 * 1000;
  const lastInboundAt = parseTime(conversation.lastInboundAt) || latestHistoryTs(history, (item) => item.direction === 'inbound');
  const lastOutboundAt = parseTime(conversation.lastOutboundAt) || latestHistoryTs(history, (item) => item.direction === 'outbound');
  const inboundCount24h = countHistory(history, (item) => item.direction === 'inbound' && parseTime(item.ts) >= dayAgo);
  const outboundCount24h = countHistory(history, (item) => item.direction === 'outbound' && parseTime(item.ts) >= dayAgo);
  const inboundCount1h = countHistory(history, (item) => item.direction === 'inbound' && parseTime(item.ts) >= hourAgo);
  const inboundCount10m = countHistory(history, (item) => item.direction === 'inbound' && parseTime(item.ts) >= tenMinAgo);
  const lastInboundMs = lastInboundAt || 0;
  const lastOutboundMs = lastOutboundAt || 0;
  const followUpCount = countHistory(history, (item) => item.direction === 'outbound' && parseTime(item.ts) > lastInboundMs);

  return {
    lastInboundMs,
    lastOutboundMs,
    inboundCount24h,
    outboundCount24h,
    inboundCount1h,
    inboundCount10m,
    followUpCount,
  };
}

function computeTier(metrics, conversation, settings, now) {
  const unreadCount = Number(conversation.unreadCount || 0);
  const sinceInboundSec = metrics.lastInboundMs ? Math.floor((now - metrics.lastInboundMs) / 1000) : Number.POSITIVE_INFINITY;
  const hotWindow = Number(settings.watchHotWindowSec || 600);
  const warmWindow = Number(settings.watchWarmWindowSec || 3600);
  const coolWindow = Number(settings.watchCoolWindowSec || 86400);

  if (unreadCount > 0 || sinceInboundSec <= hotWindow || metrics.inboundCount10m >= 2) {
    return 'hot';
  }
  if (sinceInboundSec <= warmWindow || metrics.inboundCount1h >= 1) {
    return 'warm';
  }
  if (sinceInboundSec <= coolWindow || metrics.inboundCount24h >= 1) {
    return 'cool';
  }
  return 'cold';
}

function computeScore(metrics, conversation, settings, now) {
  const unreadCount = Number(conversation.unreadCount || 0);
  const sinceInboundSec = metrics.lastInboundMs ? Math.floor((now - metrics.lastInboundMs) / 1000) : Number.POSITIVE_INFINITY;
  let score = 0;

  score += Math.min(unreadCount, 3) * 4;
  score += Math.min(metrics.inboundCount10m, 3) * 4;
  score += Math.min(metrics.inboundCount1h, 3) * 2;
  score += Math.min(metrics.inboundCount24h, 5);

  if (sinceInboundSec <= Number(settings.watchHotWindowSec || 600)) {
    score += 5;
  } else if (sinceInboundSec <= Number(settings.watchWarmWindowSec || 3600)) {
    score += 3;
  } else if (sinceInboundSec <= Number(settings.watchCoolWindowSec || 86400)) {
    score += 1;
  }

  if (metrics.followUpCount >= 1) {
    score -= Math.min(metrics.followUpCount, 3) * 2;
  }
  if (metrics.outboundCount24h > metrics.inboundCount24h) {
    score -= 1;
  }

  return score;
}

function tierIntervalSec(tier, settings) {
  const map = {
    hot: Number(settings.watchHotPollSec || 60),
    warm: Number(settings.watchWarmPollSec || 180),
    cool: Number(settings.watchCoolPollSec || 900),
    cold: Number(settings.watchColdPollSec || 2700),
  };
  return Math.max(Number(map[tier] || settings.watchIntervalSec || 90), 30);
}

function computeNextPollAt(metrics, conversation, settings, now, tier) {
  let intervalSec = tierIntervalSec(tier, settings);
  const unreadCount = Number(conversation.unreadCount || 0);
  if (unreadCount > 0) {
    intervalSec = Math.min(intervalSec, Number(settings.watchHotPollSec || 60));
  }
  if (metrics.inboundCount10m >= 2) {
    intervalSec = Math.min(intervalSec, 45);
  }
  return toIso(now + intervalSec * 1000);
}

function computeNextAllowedSendAt(metrics, settings, now) {
  const minGapSec = Number(settings.sendMinGapSec || 600);
  const firstFollowUpDelaySec = Number(settings.sendFirstFollowUpDelaySec || 8 * 60 * 60);
  const repeatFollowUpDelaySec = Number(settings.sendRepeatFollowUpDelaySec || 24 * 60 * 60);
  const maxFollowUpWithoutReply = Number(settings.sendMaxFollowUpWithoutReply || 2);
  const lastOutboundMs = metrics.lastOutboundMs || 0;
  const lastInboundMs = metrics.lastInboundMs || 0;

  if (!lastOutboundMs) {
    return {
      nextAllowedSendAt: '',
      cooldownReason: '',
    };
  }

  const baselineMs = lastOutboundMs + minGapSec * 1000;
  if (lastInboundMs && lastInboundMs >= lastOutboundMs) {
    return {
      nextAllowedSendAt: toIso(baselineMs),
      cooldownReason: baselineMs > now ? 'min_gap' : '',
    };
  }

  if (metrics.followUpCount >= maxFollowUpWithoutReply) {
    return {
      nextAllowedSendAt: '',
      cooldownReason: 'await_reply',
    };
  }

  const followUpDelaySec = metrics.followUpCount <= 1 ? firstFollowUpDelaySec : repeatFollowUpDelaySec;
  const scheduledMs = Math.max(baselineMs, lastOutboundMs + followUpDelaySec * 1000);
  return {
    nextAllowedSendAt: toIso(scheduledMs),
    cooldownReason: scheduledMs > now ? 'follow_up_cooldown' : '',
  };
}

function summarizeSchedule(conversation, settings, now = Date.now()) {
  const metrics = readRecentMetrics(conversation, now);
  const tier = computeTier(metrics, conversation, settings, now);
  const score = computeScore(metrics, conversation, settings, now);
  const nextPollAt = computeNextPollAt(metrics, conversation, settings, now, tier);
  const sendWindow = computeNextAllowedSendAt(metrics, settings, now);

  return {
    engagementScore: score,
    engagementTier: tier,
    nextPollAt,
    nextAllowedSendAt: sendWindow.nextAllowedSendAt,
    cooldownReason: sendWindow.cooldownReason,
    followUpCount: metrics.followUpCount,
    inboundCount24h: metrics.inboundCount24h,
    outboundCount24h: metrics.outboundCount24h,
    inboundCount1h: metrics.inboundCount1h,
    inboundCount10m: metrics.inboundCount10m,
    lastInboundAt: toIso(metrics.lastInboundMs) || conversation.lastInboundAt || '',
    lastOutboundAt: toIso(metrics.lastOutboundMs) || conversation.lastOutboundAt || '',
  };
}

function rebalanceConversation(mid, settings, now = Date.now()) {
  const conversation = getConversationByMid(mid);
  if (!conversation) {
    return null;
  }
  const schedule = summarizeSchedule(conversation, settings, now);
  return upsertConversation(conversation.key, schedule);
}

function rebalanceAllConversations(settings, now = Date.now()) {
  return listConversations().map((conversation) =>
    upsertConversation(conversation.key, summarizeSchedule(conversation, settings, now))
  );
}

function getThreadSendStatus(mid, settings, now = Date.now()) {
  const conversation = getConversationByMid(mid);
  if (!conversation) {
    return {
      conversation: null,
      schedule: null,
      blocked: false,
    };
  }
  const schedule = summarizeSchedule(conversation, settings, now);
  const nextAllowedMs = parseTime(schedule.nextAllowedSendAt);
  const blocked = schedule.cooldownReason === 'await_reply' || (nextAllowedMs && nextAllowedMs > now);
  return {
    conversation,
    schedule,
    blocked,
  };
}

function computeAdaptiveWatchIntervalSec(settings, now = Date.now()) {
  const conversations = listConversations();
  if (!conversations.length) {
    return Math.max(Number(settings.watchIntervalSec || 90), 30);
  }
  const schedules = conversations.map((conversation) => summarizeSchedule(conversation, settings, now));
  const dueTimes = schedules
    .map((schedule) => parseTime(schedule.nextPollAt))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!dueTimes.length) {
    return Math.max(Number(settings.watchIntervalSec || 90), 30);
  }

  const earliestDueAt = Math.min(...dueTimes);
  if (earliestDueAt <= now) {
    return Math.max(Math.min(Number(settings.watchHotPollSec || 60), Number(settings.watchIntervalSec || 90)), 30);
  }

  const seconds = Math.ceil((earliestDueAt - now) / 1000);
  return Math.max(30, Math.min(seconds, Number(settings.watchColdPollSec || 2700)));
}

module.exports = {
  summarizeSchedule,
  rebalanceConversation,
  rebalanceAllConversations,
  getThreadSendStatus,
  computeAdaptiveWatchIntervalSec,
};
