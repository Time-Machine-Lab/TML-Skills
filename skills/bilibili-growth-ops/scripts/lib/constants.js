'use strict';

const os = require('os');
const path = require('path');

const SKILL_SLUG = 'bilibili-growth-ops';
const SKILL_DISPLAY_NAME = 'B 站增长运营系统';
const DEFAULT_RUNTIME_ROOT = path.join(os.homedir(), '.tml', 'skills', SKILL_SLUG);
const RUNTIME_ROOT_ENV = 'BILIBILI_GROWTH_OPS_RUNTIME_ROOT';
const FALLBACK_RUNTIME_ROOT_ENV = 'TML_SKILL_RUNTIME_ROOT';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 13;
const DEFAULT_DB_FILENAME = 'bilibili-growth-ops.sqlite';
const WBI_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const BUILTIN_STRATEGY_SLUG = 'baseline-comment-reply-dm';
const OUTBOUND_GUARD_POLICY_META_KEY = 'outbound_guard_policy';
const BUILTIN_CAPABILITIES = [
  'video-discovery',
  'comment-prospect-mining',
  'public-comment-outreach',
  'reply-and-dm-follow-up',
];
const DEFAULT_OUTBOUND_GUARDS = {
  video_comment: {
    cooldownSeconds: 90,
    windowMinutes: 30,
    maxInWindow: 20,
    recentLimit: 5,
  },
  comment_reply: {
    cooldownSeconds: 20,
    windowMinutes: 30,
    maxInWindow: 60,
    recentLimit: 5,
  },
  direct_message: {
    cooldownSeconds: 120,
    windowMinutes: 60,
    maxInWindow: 30,
    recentLimit: 5,
  },
};
const OUTBOUND_OPERATION_TYPES = Object.freeze(Object.keys(DEFAULT_OUTBOUND_GUARDS));

function getDefaultOutboundGuard(operationType) {
  return {
    cooldownSeconds: 0,
    windowMinutes: 0,
    maxInWindow: 0,
    recentLimit: 5,
    ...(DEFAULT_OUTBOUND_GUARDS[String(operationType || '').trim()] || {}),
  };
}

module.exports = {
  SKILL_SLUG,
  SKILL_DISPLAY_NAME,
  DEFAULT_RUNTIME_ROOT,
  RUNTIME_ROOT_ENV,
  FALLBACK_RUNTIME_ROOT_ENV,
  DEFAULT_USER_AGENT,
  MIN_NODE_MAJOR,
  MIN_NODE_MINOR,
  DEFAULT_DB_FILENAME,
  WBI_CACHE_TTL_MS,
  BUILTIN_STRATEGY_SLUG,
  OUTBOUND_GUARD_POLICY_META_KEY,
  BUILTIN_CAPABILITIES,
  DEFAULT_OUTBOUND_GUARDS,
  OUTBOUND_OPERATION_TYPES,
  getDefaultOutboundGuard,
};
