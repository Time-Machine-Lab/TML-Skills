'use strict';

const { CliError } = require('./errors');
const { getConversationByMid, listConversations } = require('./tracker');
const { getProduct, listProducts } = require('./products');
const { summarizeSchedule } = require('./scheduler');
const { readEngagementSettings } = require('./engagement');

function truncateText(value, max = 1200) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function toIso(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string' && value.includes('T')) {
    return value;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return '';
  }
  const millis = num > 10_000_000_000 ? num : num * 1000;
  return new Date(millis).toISOString();
}

function scoreTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildProductReference(productSlug) {
  if (!productSlug) {
    return {
      selected: null,
      available: listProducts().map((item) => ({
        slug: item.slug,
        title: item.title,
        path: item.path,
      })),
    };
  }
  const product = getProduct(productSlug);
  if (!product) {
    throw new CliError(
      `未找到产品资料：${productSlug}`,
      1,
      { productSlug },
      '先执行 `node scripts/bili.js product list` 查看可用产品，或执行 `node scripts/bili.js product init --title "你的产品名"` 初始化。'
    );
  }
  return {
    selected: {
      slug: product.slug,
      title: product.profile?.title || product.slug,
      path: product.path,
      docsPath: product.docsPath,
      imagesPath: product.imagesPath,
      attachmentsPath: product.attachmentsPath,
      brief: truncateText(product.brief, 2000),
      replyStrategy: truncateText(product.replyStrategy, 2000),
      faq: truncateText(product.faq, 2000),
      profile: product.profile || {},
      files: product.files || [],
      childDirs: product.childDirs || [],
    },
    available: listProducts().map((item) => ({
      slug: item.slug,
      title: item.title,
      path: item.path,
    })),
  };
}

function summarizeConversation(conversation) {
  if (!conversation) {
    return null;
  }
  const schedule = summarizeSchedule(conversation, readEngagementSettings());
  return {
    mid: conversation.mid,
    nickname: conversation.nickname || '',
    channels: Object.keys(conversation.channels || {}).filter((name) => conversation.channels[name]),
    unreadCount: conversation.unreadCount || 0,
    lastInboundAt: conversation.lastInboundAt || '',
    lastOutboundAt: conversation.lastOutboundAt || '',
    lastInboundMessage: conversation.lastInbound?.message || '',
    lastMessage: conversation.lastMessage?.content?.content || '',
    recentHistory: (conversation.history || []).slice(-8),
    schedule,
  };
}

function buildSuggestedCommands({ mid, productSlug, recommendedChannel }) {
  const commands = [];
  if (mid) {
    commands.push(`node scripts/bili.js thread continue --mid ${mid}${productSlug ? ` --product "${productSlug}"` : ''}`);
    if (recommendedChannel === 'dm') {
      commands.push(`node scripts/bili.js dm history --mid ${mid} --size 20`);
    } else {
      commands.push('先根据 replyNotifications 定位评论，再决定是否继续评论区回复。');
    }
  }
  return commands;
}

function buildReplyGuide({ product, recommendedChannel, replyNotifications, dmHistory, dmSession }) {
  const guide = {
    recommendedChannel,
    tone: product?.selected?.profile?.preferredTone || 'friendly',
    principles: [
      '先回应对方当前表达的具体问题或情绪，不要直接推产品。',
      '如果用户已经表现出明确兴趣，再逐步引导到私信或进一步信息。',
      '避免夸大承诺、价格承诺或脱离上下文的硬广表达。',
    ],
    suggestedFocus: [],
  };
  if (replyNotifications?.length) {
    guide.suggestedFocus.push('先看最近评论回复，确认用户是在提问、认可、质疑，还是继续追问。');
  }
  if ((dmHistory?.items || []).length) {
    guide.suggestedFocus.push('先看最近 3-5 条私信，避免重复解释已经聊过的信息。');
  }
  if (dmSession?.unreadCount > 0) {
    guide.suggestedFocus.push('该用户存在未读私信，优先处理未读内容。');
  }
  if (product?.selected?.replyStrategy) {
    guide.suggestedFocus.push('结合产品 reply-strategy.md 的限制和引导方式。');
  }
  return guide;
}

function buildActionCard({ item, productSlug }) {
  const commands = [
    `node scripts/bili.js thread continue --mid ${item.mid}${productSlug ? ` --product "${productSlug}"` : ''}`,
    `node scripts/bili.js thread draft --mid ${item.mid}${productSlug ? ` --product "${productSlug}"` : ''}`,
  ];
  if (item.recommendedChannel === 'dm') {
    commands.push(`node scripts/bili.js thread send --channel dm --mid ${item.mid}${productSlug ? ` --product "${productSlug}"` : ''} --content "<text>" --yes`);
  } else {
    commands.push('先定位评论上下文，再决定是否继续评论区回复。');
  }
  return {
    mid: item.mid,
    recommendedChannel: item.recommendedChannel,
    whyNow: item.reasons || [],
    commands,
  };
}

async function captureSafe(label, task) {
  try {
    return { data: await task(), warning: null };
  } catch (error) {
    return {
      data: null,
      warning: {
        source: label,
        message: error.message,
        hint: error.hint || '',
      },
    };
  }
}

function mergeInboxItems({ trackedConversations, replyNotifications, dmSessions, limit }) {
  const byMid = new Map();

  function upsert(mid, patch) {
    if (!mid) {
      return;
    }
    const key = String(mid);
    const current = byMid.get(key) || {
      mid: key,
      nickname: '',
      channels: [],
      reasons: [],
      unreadDmCount: 0,
      hasCommentReply: false,
      lastActivityAt: '',
      snippets: [],
      tracked: null,
    };
    const next = {
      ...current,
      ...patch,
      channels: Array.from(new Set([...(current.channels || []), ...(patch.channels || [])])),
      reasons: Array.from(new Set([...(current.reasons || []), ...(patch.reasons || [])])),
      snippets: [...(current.snippets || []), ...(patch.snippets || [])].filter(Boolean).slice(0, 5),
    };
    const currentTs = scoreTimestamp(current.lastActivityAt);
    const nextTs = scoreTimestamp(patch.lastActivityAt);
    if (currentTs > nextTs) {
      next.lastActivityAt = current.lastActivityAt;
    }
    byMid.set(key, next);
  }

  for (const item of trackedConversations) {
    upsert(item.mid, {
      mid: String(item.mid),
      nickname: item.nickname || '',
      channels: Object.keys(item.channels || {}).filter((name) => item.channels[name]),
      reasons: ['已有跟踪会话'],
      unreadDmCount: item.unreadCount || 0,
      hasCommentReply: Boolean(item.lastInbound?.type === 'comment_reply_notification'),
      lastActivityAt: item.updatedAt || item.lastInboundAt || item.lastOutboundAt || item.lastSessionAt || '',
      snippets: [item.lastInbound?.message, item.lastMessage?.content?.content],
      tracked: item,
    });
  }

  for (const item of replyNotifications?.items || []) {
    const mid = item.user?.mid;
    upsert(mid, {
      nickname: item.user?.nickname || '',
      channels: ['comment'],
      reasons: ['评论区有人回复，适合继续聊'],
      hasCommentReply: true,
      lastActivityAt: toIso(item.replyTime),
      snippets: [item.item?.targetReplyContent, item.item?.sourceContent, item.item?.title],
    });
  }

  for (const item of dmSessions?.items || []) {
    upsert(item.talkerId, {
      channels: ['dm'],
      reasons: item.unreadCount > 0 ? ['私信有未读消息'] : ['存在私信会话'],
      unreadDmCount: Math.max(Number(item.unreadCount || 0), 0),
      lastActivityAt: toIso(item.sessionTs),
      snippets: [item.lastMsg?.content?.content],
    });
  }

  return Array.from(byMid.values())
    .map((item) => ({
      ...item,
      recommendedChannel: item.unreadDmCount > 0 || item.channels.includes('dm') ? 'dm' : 'comment',
      priorityScore: (item.unreadDmCount > 0 ? 50 : 0) + (item.hasCommentReply ? 30 : 0) + Math.min(item.reasons.length, 5) * 5,
    }))
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      return scoreTimestamp(b.lastActivityAt) - scoreTimestamp(a.lastActivityAt);
    })
    .slice(0, limit);
}

async function buildInboxOverview({ client, productSlug, limit = 20, campaignId = '' }) {
  const product = buildProductReference(productSlug);
  const trackedConversations = listConversations();
  const [repliesResult, dmSessionsResult, unreadResult] = await Promise.all([
    captureSafe('notify.replies', () => client.getReplyNotifications()),
    captureSafe('dm.sessions', () => client.listDmSessions()),
    captureSafe('notify.unread', () => client.getUnreadNotifications()),
  ]);

  const warnings = [repliesResult.warning, dmSessionsResult.warning, unreadResult.warning].filter(Boolean);
  const items = mergeInboxItems({
    trackedConversations,
    replyNotifications: repliesResult.data,
    dmSessions: dmSessionsResult.data,
    limit,
  });

  return {
    generatedAt: new Date().toISOString(),
    campaign: campaignId
      ? {
          id: campaignId,
        }
      : null,
    product,
    overview: {
      trackedConversationCount: trackedConversations.length,
      inboxCount: items.length,
      unread: unreadResult.data,
      replyNotificationCount: repliesResult.data?.items?.length || 0,
      dmSessionCount: dmSessionsResult.data?.items?.length || 0,
    },
    items,
    actionCards: items.slice(0, 5).map((item) => buildActionCard({ item, productSlug: product.selected?.slug || '' })),
    warnings,
    nextSteps: [
      items.length ? '优先处理 recommendedChannel 为 dm 且 unreadDmCount > 0 的会话。' : '当前没有明显待处理会话，可先执行 `notify replies` 或 `dm sessions` 检查实时状态。',
      product.selected ? `回复前优先结合产品资料目录：${product.selected.path}` : '如果要围绕具体产品回复，先执行 `product list` 或 `product init` 准备产品资料。',
    ],
    suggestedCommands: [
      'node scripts/bili.js system onboard',
      product.selected ? `node scripts/bili.js inbox list --product "${product.selected.slug}"` : 'node scripts/bili.js product list',
      ...items.slice(0, 3).map((item) => `node scripts/bili.js thread continue --mid ${item.mid}${product.selected ? ` --product "${product.selected.slug}"` : ''}`),
    ],
  };
}

async function buildThreadContinuation({ client, mid, productSlug, historySize = 20 }) {
  const conversation = getConversationByMid(mid);
  const product = buildProductReference(productSlug);
  const [dmHistoryResult, dmSessionsResult, repliesResult] = await Promise.all([
    captureSafe('dm.history', () => client.getDmMessages({ talkerId: mid, size: historySize, beginSeqno: 0 })),
    captureSafe('dm.sessions', () => client.listDmSessions()),
    captureSafe('notify.replies', () => client.getReplyNotifications()),
  ]);

  const warnings = [dmHistoryResult.warning, dmSessionsResult.warning, repliesResult.warning].filter(Boolean);
  const dmSession = (dmSessionsResult.data?.items || []).find((item) => String(item.talkerId) === String(mid)) || null;
  const replyNotifications = (repliesResult.data?.items || []).filter((item) => String(item.user?.mid || '') === String(mid)).slice(0, 10);
  const dmHistory = dmHistoryResult.data || null;

  if (!conversation && !dmSession && !replyNotifications.length && !(dmHistory?.items || []).length) {
    throw new CliError(
      `未找到用户 ${mid} 的会话上下文。`,
      1,
      { mid },
      '先执行 `node scripts/bili.js inbox list`、`notify replies` 或 `dm sessions`，让 skill 拉到该用户的上下文后再继续。'
    );
  }

  const recommendedChannel = dmSession || (dmHistory?.items || []).length ? 'dm' : 'comment';
  const notes = [];
  if (dmSession?.unreadCount > 0) {
    notes.push('该用户私信有未读消息，优先看私信历史再回复。');
  }
  if (replyNotifications.length > 0) {
    notes.push('该用户最近在评论区回复过你，适合结合评论上下文继续沟通。');
  }
  if (product.selected) {
    notes.push(`回复前结合产品资料：${product.selected.path}`);
  } else {
    notes.push('如果这次沟通需要推广某个产品，补一个 `--product <slug>` 可以让上下文更完整。');
  }

  return {
    generatedAt: new Date().toISOString(),
    mid: String(mid),
    recommendedChannel,
    conversation,
    conversationSummary: summarizeConversation(conversation),
    schedule: conversation ? summarizeSchedule(conversation, readEngagementSettings()) : null,
    dmSession,
    dmHistory,
    replyNotifications,
    product,
    notes,
    warnings,
    actionPlan: [
      '先看 conversationSummary 和最近 3-5 条 history，确认对方最近在问什么。',
      recommendedChannel === 'dm' ? '优先私信继续聊；除非上下文很弱，否则不要切回评论区。' : '优先评论区轻量续聊；如果对方兴趣明确，再考虑引导到私信。',
      product.selected ? `回复时结合产品资料：${product.selected.path}` : '如果这次沟通要推广产品，补一个 `--product <slug>` 会更稳。',
      '先用 thread draft 产出草稿，再用 thread send 统一发送。',
    ],
    replyGuide: buildReplyGuide({ product, recommendedChannel, replyNotifications, dmHistory, dmSession }),
    suggestedCommands: buildSuggestedCommands({ mid: String(mid), productSlug: product.selected?.slug || '', recommendedChannel }),
  };
}

module.exports = {
  buildInboxOverview,
  buildThreadContinuation,
};
