'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR, ensureDir, readJson, writeJson } = require('./config');
const { readCredentials } = require('./config');
const { readSession } = require('./store');
const { refreshCookie } = require('./auth');
const { readEngagementSettings } = require('./engagement');
const { upsertConversation, sanitizeValue } = require('./tracker');
const { rebalanceAllConversations, computeAdaptiveWatchIntervalSec } = require('./scheduler');

const WATCH_STATE_PATH = path.join(DATA_DIR, 'watch-state.json');
const WATCH_EVENTS_LOG_PATH = path.join(DATA_DIR, 'watch-events.jsonl');
const WATCH_LOCK_PATH = path.join(DATA_DIR, 'watch.lock.json');

function defaultWatchState() {
  return {
    updatedAt: '',
    replies: {
      cursorId: 0,
      cursorTime: 0,
      processedIds: [],
      lastPollAt: '',
    },
    dm: {
      sessions: {},
      processedMsgKeys: [],
      lastPollAt: '',
    },
    stats: {
      runs: 0,
      errors: 0,
      events: 0,
      lastRunAt: '',
    },
    control: {
      backoffUntil: '',
      consecutiveErrors: 0,
      lastError: '',
      lastSuccessAt: '',
      lastRefreshAt: '',
    },
  };
}

function readWatchState() {
  const saved = readJson(WATCH_STATE_PATH, {});
  const defaults = defaultWatchState();
  return {
    ...defaults,
    ...saved,
    replies: {
      ...defaults.replies,
      ...(saved.replies || {}),
    },
    dm: {
      ...defaults.dm,
      ...(saved.dm || {}),
    },
    stats: {
      ...defaults.stats,
      ...(saved.stats || {}),
    },
    control: {
      ...defaults.control,
      ...(saved.control || {}),
    },
  };
}

function writeWatchState(payload) {
  writeJson(WATCH_STATE_PATH, payload);
  return payload;
}

function resetWatchState() {
  clearWatchLock();
  try {
    fs.unlinkSync(WATCH_EVENTS_LOG_PATH);
  } catch {}
  return writeWatchState(defaultWatchState());
}

function appendEventLog(event) {
  ensureDir(path.dirname(WATCH_EVENTS_LOG_PATH));
  fs.appendFileSync(WATCH_EVENTS_LOG_PATH, `${JSON.stringify(event)}\n`, 'utf8');
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readWatchLock() {
  return readJson(WATCH_LOCK_PATH, null);
}

function writeWatchLock(payload) {
  writeJson(WATCH_LOCK_PATH, payload);
  return payload;
}

function clearWatchLock() {
  try {
    fs.unlinkSync(WATCH_LOCK_PATH);
  } catch {}
}

function acquireWatchLock() {
  const current = readWatchLock();
  if (current && current.pid && isProcessAlive(Number(current.pid))) {
    return {
      acquired: false,
      lock: current,
    };
  }
  const lock = {
    pid: process.pid,
    startedAt: nowIso(),
  };
  writeWatchLock(lock);
  return {
    acquired: true,
    lock,
  };
}

function toIso(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) {
    return '';
  }
  let millis = num;
  if (num < 10_000_000_000) {
    millis = num * 1000;
  } else if (num > 10_000_000_000_000) {
    millis = Math.floor(num / 1000);
  }
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function rememberIds(items, incoming, max = 500) {
  return Array.from(new Set([...(items || []), ...incoming.filter(Boolean).map(String)])).slice(-max);
}

function buildReplyEvent(item) {
  const mid = String(item.user?.mid || '');
  return {
    id: `reply:${item.id}`,
    type: 'reply_notification',
    channel: 'comment',
    mid,
    nickname: item.user?.nickname || '',
    at: toIso(item.replyTime) || new Date().toISOString(),
    summary: item.item?.targetReplyContent || item.item?.sourceContent || item.item?.title || '',
    payload: sanitizeValue(item),
  };
}

function buildDmEvent(mid, message) {
  return {
    id: `dm:${mid}:${message.msgKey || message.msgSeqno}`,
    type: 'dm_message',
    channel: 'dm',
    mid: String(mid),
    at: toIso(message.timestamp) || new Date().toISOString(),
    summary: message.content?.content || '',
    payload: sanitizeValue(message),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function isEmptyCheckpoint(state) {
  return !state.replies.cursorId && !state.replies.cursorTime && !Object.keys(state.dm.sessions || {}).length;
}

function isInterestingDmMessage(message, settings) {
  if (!message) {
    return false;
  }
  const msgType = Number(message.msgType || 0);
  if (msgType === 1) {
    return true;
  }
  if (settings.watchIncludeSystemDm) {
    return true;
  }
  return false;
}

function classifyError(error) {
  const code = Number(error?.details?.code);
  const message = String(error?.message || '');
  const hint = String(error?.hint || '');
  const auth = code === -101 || /缺少 Bilibili Cookie|请先登录|登录/i.test(message) || /登录/.test(hint);
  const risk = code === -352 || code === -403 || /风控|权限不足/.test(message) || /风控|权限不足/.test(hint);
  return { auth, risk, code };
}

function computeBackoffSeconds(state, settings, error) {
  const consecutive = Number(state.control?.consecutiveErrors || 0) + 1;
  const base = Number(settings.watchBaseBackoffSec || 120);
  const max = Number(settings.watchMaxBackoffSec || 1800);
  const jitter = Number(settings.watchJitterSec || 15);
  const { risk } = classifyError(error);
  const multiplier = risk ? Math.max(2, consecutive) : consecutive;
  const seconds = Math.min(max, base * multiplier + Math.floor(Math.random() * jitter));
  return Math.max(seconds, 30);
}

function applyBackoff(state, settings, error) {
  const seconds = computeBackoffSeconds(state, settings, error);
  state.control.consecutiveErrors = Number(state.control.consecutiveErrors || 0) + 1;
  state.control.lastError = error.message || '';
  state.control.backoffUntil = new Date(Date.now() + seconds * 1000).toISOString();
  return seconds;
}

function clearBackoff(state) {
  state.control.consecutiveErrors = 0;
  state.control.lastError = '';
  state.control.backoffUntil = '';
  state.control.lastSuccessAt = nowIso();
}

async function tryAutoRefresh({ userAgent, settings }) {
  if (!settings.watchAutoRefresh) {
    return { refreshed: false, reason: 'disabled' };
  }
  const credentials = readCredentials();
  const session = readSession();
  const cookie = credentials.cookie || session.cookie || '';
  const refreshToken = session.refreshToken || '';
  if (!cookie || !refreshToken) {
    return { refreshed: false, reason: 'missing_credentials' };
  }
  const refreshed = await refreshCookie({
    cookie,
    refreshToken,
    userAgent,
  });
  return { refreshed: true, cookie: refreshed.cookie };
}

async function runWithRecovery({ task, state, settings, userAgent, warnings, source, client }) {
  try {
    return await task();
  } catch (error) {
    const kind = classifyError(error);
    if (kind.auth) {
      try {
        const refreshResult = await tryAutoRefresh({ userAgent, settings });
        if (refreshResult.refreshed) {
          state.control.lastRefreshAt = nowIso();
          if (client && refreshResult.cookie) {
            client.cookie = refreshResult.cookie;
          }
          return await task();
        }
      } catch (refreshError) {
        warnings.push({
          source: `${source}.refresh`,
          message: refreshError.message,
          hint: refreshError.hint || '',
        });
      }
    }
    throw error;
  }
}

async function pollReplyNotifications({ client, state }) {
  const response = await client.getReplyNotifications({
    id: state.replies.cursorId || undefined,
    replyTime: state.replies.cursorTime || undefined,
  });
  const seen = new Set((state.replies.processedIds || []).map(String));
  const items = (response.items || []).filter((item) => !seen.has(String(item.id)));
  const events = items.map(buildReplyEvent);

  for (const event of events) {
    upsertConversation(`mid:${event.mid}`, {
      mid: event.mid,
      nickname: event.nickname,
      channels: { comment: true },
      lastInboundAt: event.at,
      lastInbound: {
        type: 'comment_reply_notification',
        message: event.summary,
      },
      history: [
        {
          ts: event.at,
          direction: 'inbound',
          type: 'comment_reply_notification',
          payload: event.payload,
        },
      ],
    });
    appendEventLog(event);
  }

  state.replies.cursorId = response.cursor?.id || state.replies.cursorId || 0;
  state.replies.cursorTime = response.cursor?.time || state.replies.cursorTime || 0;
  state.replies.processedIds = rememberIds(state.replies.processedIds, items.map((item) => item.id));
  state.replies.lastPollAt = new Date().toISOString();
  return {
    count: events.length,
    events,
    cursor: response.cursor || {},
  };
}

function maxSeqnoFromMessages(items) {
  return (items || []).reduce((max, item) => {
    const seq = Number(item.msgSeqno || 0);
    return seq > max ? seq : max;
  }, 0);
}

async function pollDmSessions({ client, state, historySize = 20, settings }) {
  const sessions = await client.listDmSessions();
  const events = [];
  const processed = new Set((state.dm.processedMsgKeys || []).map(String));
  let fetchedCount = 0;
  const maxFetch = Math.max(Number(settings.watchMaxDmFetchPerRun || 5), 1);

  for (const session of sessions.items || []) {
    const mid = String(session.talkerId);
    const current = state.dm.sessions[mid] || { maxSeqno: 0, ackSeqno: 0, unreadCount: 0, lastPolledAt: '' };
    const sessionMaxSeqno = Number(session.maxSeqno || 0);
    const sessionAckSeqno = Number(session.ackSeqno || 0);
    const shouldFetch = session.unreadCount > 0 || sessionMaxSeqno > Number(current.maxSeqno || 0);

    state.dm.sessions[mid] = {
      maxSeqno: sessionMaxSeqno,
      ackSeqno: sessionAckSeqno,
      unreadCount: Number(session.unreadCount || 0),
      lastSessionAt: toIso(session.sessionTs),
      lastPolledAt: new Date().toISOString(),
    };

    upsertConversation(`mid:${mid}`, {
      mid,
      channels: { dm: true },
      unreadCount: Number(session.unreadCount || 0),
      lastSessionAt: toIso(session.sessionTs),
      lastSession: sanitizeValue(session.lastMsg || null),
    });

    if (!shouldFetch || fetchedCount >= maxFetch) {
      continue;
    }
    fetchedCount += 1;

    const history = await client.getDmMessages({
      talkerId: mid,
      beginSeqno: Math.max(Number(current.maxSeqno || 0), 0),
      size: historySize,
    });

    const newMessages = (history.items || []).filter((item) => {
      const key = String(item.msgKey || item.msgSeqno || '');
      if (!key || processed.has(key)) {
        return false;
      }
      return String(item.senderUid || '') === mid && isInterestingDmMessage(item, settings);
    });

    for (const message of newMessages) {
      const event = buildDmEvent(mid, message);
      events.push(event);
      appendEventLog(event);
      processed.add(String(message.msgKey || message.msgSeqno));
    }

    const lastMessage = (history.items || []).slice(-1)[0] || null;
    upsertConversation(`mid:${mid}`, {
      mid,
      channels: { dm: true },
      unreadCount: Number(session.unreadCount || 0),
      lastMessageAt: toIso(lastMessage?.timestamp),
      lastMessage: sanitizeValue(lastMessage),
      history: (history.items || []).slice(-10).map((item) => ({
        ts: toIso(item.timestamp) || new Date().toISOString(),
        direction: String(item.senderUid || '') === mid ? 'inbound' : 'outbound',
        type: 'dm_message',
        payload: sanitizeValue(item),
      })),
    });

    state.dm.sessions[mid].maxSeqno = Math.max(sessionMaxSeqno, maxSeqnoFromMessages(history.items));
  }

  state.dm.processedMsgKeys = rememberIds(state.dm.processedMsgKeys, Array.from(processed), 1000);
  state.dm.lastPollAt = new Date().toISOString();
  return {
    count: events.length,
    events,
    sessionCount: (sessions.items || []).length,
  };
}

async function primeWatchState({ client }) {
  const state = readWatchState();
  const settings = readEngagementSettings();
  const [replies, sessions] = await Promise.all([
    client.getReplyNotifications().catch(() => null),
    client.listDmSessions().catch(() => null),
  ]);

  if (replies?.cursor) {
    state.replies.cursorId = replies.cursor.id || 0;
    state.replies.cursorTime = replies.cursor.time || 0;
    state.replies.processedIds = rememberIds([], (replies.items || []).map((item) => item.id));
    state.replies.lastPollAt = new Date().toISOString();
  }

  if (sessions?.items) {
    const nextSessions = {};
    for (const session of sessions.items) {
      nextSessions[String(session.talkerId)] = {
        maxSeqno: Number(session.maxSeqno || 0),
        ackSeqno: Number(session.ackSeqno || 0),
        unreadCount: Number(session.unreadCount || 0),
        lastSessionAt: toIso(session.sessionTs),
        lastPolledAt: new Date().toISOString(),
      };
    }
    state.dm.sessions = nextSessions;
    state.dm.lastPollAt = new Date().toISOString();
  }

  rebalanceAllConversations(settings);
  state.updatedAt = new Date().toISOString();
  writeWatchState(state);
  return {
    statePath: WATCH_STATE_PATH,
    eventsLogPath: WATCH_EVENTS_LOG_PATH,
    repliesCursor: {
      id: state.replies.cursorId,
      time: state.replies.cursorTime,
    },
    dmSessionCount: Object.keys(state.dm.sessions || {}).length,
    note: '已把当前消息状态设为新的增量基线，后续 watch once/run 将从这里继续。',
  };
}

async function watchOnce({ client, historySize = 20 }) {
  const state = readWatchState();
  const settings = readEngagementSettings();
  const startedAt = new Date().toISOString();
  const result = {
    startedAt,
    replies: { count: 0, events: [] },
    dm: { count: 0, events: [], sessionCount: 0 },
    events: [],
    warnings: [],
  };
  if (settings.watchPrimeOnEmptyState && isEmptyCheckpoint(state)) {
    const primed = await primeWatchState({ client });
    return {
      statePath: WATCH_STATE_PATH,
      eventsLogPath: WATCH_EVENTS_LOG_PATH,
      summary: {
        totalEvents: 0,
        replyEvents: 0,
        dmEvents: 0,
        dmSessionCount: primed.dmSessionCount || 0,
        warnings: 0,
      },
      events: [],
      warnings: [],
      nextSteps: ['首次运行已自动建立基线。后续再次执行 watch once/run 时才会只抓新增事件。'],
      primed: true,
    };
  }
  const backoffUntil = Date.parse(state.control?.backoffUntil || '');
  if (backoffUntil && backoffUntil > Date.now()) {
    return {
      statePath: WATCH_STATE_PATH,
      eventsLogPath: WATCH_EVENTS_LOG_PATH,
      summary: {
        totalEvents: 0,
        replyEvents: 0,
        dmEvents: 0,
        dmSessionCount: Object.keys(state.dm.sessions || {}).length,
        warnings: 0,
      },
      events: [],
      warnings: [],
      cooldown: {
        backoffUntil: state.control.backoffUntil,
        consecutiveErrors: state.control.consecutiveErrors,
        lastError: state.control.lastError,
      },
      nextSteps: ['当前处于退避窗口，先等待 backoffUntil 之后再继续轮询。'],
    };
  }

  try {
    result.replies = await runWithRecovery({
      task: () => pollReplyNotifications({ client, state }),
      state,
      settings,
      userAgent: client.userAgent,
      warnings: result.warnings,
      source: 'watch.reply_notifications',
      client,
    });
  } catch (error) {
    result.warnings.push({
      source: 'watch.reply_notifications',
      message: error.message,
      hint: error.hint || '',
    });
    applyBackoff(state, settings, error);
  }

  try {
    result.dm = await runWithRecovery({
      task: () => pollDmSessions({ client, state, historySize, settings }),
      state,
      settings,
      userAgent: client.userAgent,
      warnings: result.warnings,
      source: 'watch.dm_sessions',
      client,
    });
  } catch (error) {
    result.warnings.push({
      source: 'watch.dm_sessions',
      message: error.message,
      hint: error.hint || '',
    });
    applyBackoff(state, settings, error);
  }

  result.events = [...result.replies.events, ...result.dm.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  state.updatedAt = new Date().toISOString();
  state.stats.runs = Number(state.stats.runs || 0) + 1;
  state.stats.events = Number(state.stats.events || 0) + result.events.length;
  state.stats.lastRunAt = state.updatedAt;
  if (result.warnings.length) {
    state.stats.errors = Number(state.stats.errors || 0) + result.warnings.length;
  } else {
    clearBackoff(state);
  }
  const rebalanced = rebalanceAllConversations(settings);
  writeWatchState(state);
  const suggestedIntervalSec = computeAdaptiveWatchIntervalSec(settings);

  return {
    statePath: WATCH_STATE_PATH,
    eventsLogPath: WATCH_EVENTS_LOG_PATH,
    summary: {
      totalEvents: result.events.length,
      replyEvents: result.replies.count,
      dmEvents: result.dm.count,
      dmSessionCount: result.dm.sessionCount,
      warnings: result.warnings.length,
    },
    events: result.events,
    warnings: result.warnings,
    cooldown: state.control.backoffUntil
      ? {
          backoffUntil: state.control.backoffUntil,
          consecutiveErrors: state.control.consecutiveErrors,
          lastError: state.control.lastError,
        }
      : null,
    scheduler: {
      conversations: rebalanced.length,
      suggestedIntervalSec,
      hottestThreads: rebalanced
        .slice()
        .sort((a, b) => {
          const scoreDiff = Number(b.engagementScore || 0) - Number(a.engagementScore || 0);
          if (scoreDiff) {
            return scoreDiff;
          }
          return Date.parse(a.nextPollAt || '') - Date.parse(b.nextPollAt || '');
        })
        .slice(0, 5)
        .map((item) => ({
          mid: item.mid || '',
          nickname: item.nickname || '',
          tier: item.engagementTier || '',
          score: item.engagementScore || 0,
          nextPollAt: item.nextPollAt || '',
          nextAllowedSendAt: item.nextAllowedSendAt || '',
          unreadCount: item.unreadCount || 0,
        })),
    },
    nextSteps: [
      result.events.length
        ? '优先先看 `inbox unread` / `inbox replies`，再按事件里的 mid 调用 `thread continue --mid <mid>` 继续处理。'
        : '当前没有新增互动，可以继续按当前间隔轮询；如果要确认实时未读摘要，执行 `inbox unread`。',
    ],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function watchRun({ client, intervalSec = 90, iterations = 1, historySize = 20 }) {
  const settings = readEngagementSettings();
  const lockResult = acquireWatchLock();
  if (!lockResult.acquired) {
    return {
      statePath: WATCH_STATE_PATH,
      eventsLogPath: WATCH_EVENTS_LOG_PATH,
      lockPath: WATCH_LOCK_PATH,
      completed: 0,
      runs: [],
      note: '已有另一个 watch run 正在执行，当前运行已跳过。',
      lock: lockResult.lock,
    };
  }
  const runs = [];
  let completed = 0;
  const loopForever = Number(iterations) <= 0;
  const configuredInterval = Math.max(Number(intervalSec || settings.watchIntervalSec || 90), 5);

  try {
    while (loopForever || completed < Number(iterations)) {
      const snapshot = await watchOnce({ client, historySize });
      runs.push({
        index: completed + 1,
        summary: snapshot.summary,
        scheduler: snapshot.scheduler || null,
        at: new Date().toISOString(),
      });
      completed += 1;
      if (!loopForever && completed >= Number(iterations)) {
        break;
      }
      const cooldownUntil = Date.parse(snapshot.cooldown?.backoffUntil || '');
      const adaptiveInterval = Math.max(Number(snapshot.scheduler?.suggestedIntervalSec || configuredInterval), 30);
      const effectiveInterval = Math.max(configuredInterval, adaptiveInterval);
      const waitMs = cooldownUntil && cooldownUntil > Date.now() ? cooldownUntil - Date.now() : effectiveInterval * 1000;
      await sleep(Math.max(waitMs, 5000));
    }
  } finally {
    clearWatchLock();
  }

  return {
    statePath: WATCH_STATE_PATH,
    eventsLogPath: WATCH_EVENTS_LOG_PATH,
    lockPath: WATCH_LOCK_PATH,
    intervalSec: configuredInterval,
    completed,
    runs,
    note: loopForever ? '本次运行按无限轮询模式配置，但当前结果只会在进程结束时返回。' : '',
  };
}

function readEventLog(limit = 20) {
  try {
    const lines = fs.readFileSync(WATCH_EVENTS_LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

module.exports = {
  WATCH_STATE_PATH,
  WATCH_EVENTS_LOG_PATH,
  WATCH_LOCK_PATH,
  readWatchState,
  readWatchLock,
  writeWatchState,
  resetWatchState,
  readEventLog,
  primeWatchState,
  watchOnce,
  watchRun,
};
