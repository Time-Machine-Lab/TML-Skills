'use strict';

const { SETTINGS_PATH, readJson, writeJson } = require('./config');
const { CliError } = require('./errors');

const DEFAULT_SETTINGS = {
  sendMode: 'confirm',
  autoSendMaxRisk: 'low',
  draftCount: 3,
  defaultChannel: 'dm',
  sendMinGapSec: 600,
  publicCommentMinGapSec: 180,
  publicCommentMaxPerHour: 20,
  publicReplyMaxPerHour: 100,
  postVideoCommentPauseSec: 90,
  postCommentReplyPauseSec: 20,
  postDmPauseSec: 20,
  campaignCommentReplyGapSec: 20,
  campaignVideoHopMinSec: 60,
  campaignVideoHopMaxSec: 120,
  sendFirstFollowUpDelaySec: 28800,
  sendRepeatFollowUpDelaySec: 86400,
  sendMaxFollowUpWithoutReply: 2,
  watchIntervalSec: 90,
  watchHistorySize: 20,
  watchMaxDmFetchPerRun: 5,
  watchIncludeSystemDm: false,
  watchPrimeOnEmptyState: true,
  watchAutoRefresh: true,
  watchBaseBackoffSec: 120,
  watchMaxBackoffSec: 1800,
  watchJitterSec: 15,
  watchHotPollSec: 60,
  watchWarmPollSec: 180,
  watchCoolPollSec: 900,
  watchColdPollSec: 2700,
  watchHotWindowSec: 600,
  watchWarmWindowSec: 3600,
  watchCoolWindowSec: 86400,
};

const RISK_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
};

function readEngagementSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...readJson(SETTINGS_PATH, {}),
  };
}

function writeEngagementSettings(payload) {
  const next = {
    ...DEFAULT_SETTINGS,
    ...payload,
  };
  writeJson(SETTINGS_PATH, next);
  return next;
}

function patchEngagementSettings(patch) {
  return writeEngagementSettings({
    ...readEngagementSettings(),
    ...patch,
  });
}

function normalizeMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (['confirm', 'semi-auto', 'semi_auto', 'auto'].includes(value)) {
    return value.replace('_', '-');
  }
  throw new CliError('不支持的发送模式，请使用 confirm、semi-auto 或 auto。');
}

function maxAllowedRiskForMode(mode, settings) {
  if (mode === 'confirm') {
    return 'none';
  }
  if (mode === 'semi-auto') {
    return settings.autoSendMaxRisk || 'low';
  }
  return 'medium';
}

function exceedsRisk(risk, allowedRisk) {
  if (allowedRisk === 'none') {
    return true;
  }
  return RISK_ORDER[risk] > RISK_ORDER[allowedRisk];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function normalizeHistoryItems(items = []) {
  return [...items]
    .map((item) => ({
      ...item,
      __ts: Number(item.timestamp || 0) || Math.floor((Date.parse(item.ts || '') || 0) / 1000),
    }))
    .sort((a, b) => a.__ts - b.__ts);
}

function summarizeProduct(product) {
  if (!product?.selected) {
    return {
      title: '',
      audience: [],
      sellingPoints: [],
      tone: 'friendly',
      assets: {},
    };
  }
  const profile = product.selected.profile || {};
  return {
    title: product.selected.title || '',
    audience: Array.isArray(profile.audience) ? profile.audience : [],
    sellingPoints: Array.isArray(profile.sellingPoints) ? profile.sellingPoints : [],
    tone: profile.preferredTone || 'friendly',
    assets: profile.assets || {},
  };
}

function extractLatestInbound(threadContext) {
  const conversationMessage = threadContext?.conversationSummary?.lastInboundMessage || '';
  const replyMessage = threadContext?.replyNotifications?.[0]?.item?.targetReplyContent || '';
  const dmMessage = normalizeHistoryItems(threadContext?.dmHistory?.items || [])
    .filter((item) => String(item.senderUid || '') === String(threadContext?.mid || ''))
    .slice(-1)?.[0]?.content?.content || '';
  return firstNonEmpty(conversationMessage, replyMessage, dmMessage);
}

function buildOpeningSnippet(inboundText, channel) {
  if (!inboundText) {
    return channel === 'dm' ? '看到你的消息了' : '看到你的回复了';
  }
  const trimmed = inboundText.replace(/\s+/g, ' ').trim();
  return trimmed.length > 28 ? `${trimmed.slice(0, 28)}...` : trimmed;
}

function buildAcknowledgement(inboundText, channel) {
  if (!inboundText) {
    return channel === 'dm' ? '看到你的消息了' : '看到你的回复了';
  }
  return channel === 'dm' ? `看到你刚刚提到“${inboundText}”` : `看到你在评论里提到“${inboundText}”`;
}

function buildValueSnippet(productSummary) {
  if (productSummary.sellingPoints.length) {
    return productSummary.sellingPoints[0];
  }
  return '可以结合你的情况给你更具体地说一下';
}

function buildCallToAction(channel) {
  if (channel === 'dm') {
    return '如果你愿意，我可以继续按你的情况具体聊聊。';
  }
  return '如果你愿意，我也可以继续跟你展开说。';
}

function collectInboundTexts(threadContext) {
  const texts = [];
  const pushText = (value) => {
    const text = String(value || '').trim();
    if (text) {
      texts.push(text);
    }
  };
  pushText(threadContext?.conversationSummary?.lastInboundMessage);
  pushText(threadContext?.replyNotifications?.[0]?.item?.targetReplyContent);
  for (const item of normalizeHistoryItems(threadContext?.dmHistory?.items || [])) {
    if (String(item.senderUid || '') === String(threadContext?.mid || '')) {
      pushText(item.content?.content);
    }
  }
  return texts;
}

function assessDmLeadStage(threadContext) {
  const texts = collectInboundTexts(threadContext);
  const merged = texts.join('\n');
  const hasNeed = /(接口|api|接入|工作流|自用|长期|并发|稳定)/i.test(merged);
  const hasPrice = /(收费|价格|多少钱|报价|套餐)/i.test(merged);
  const hasTrial = /(想试|试一试|先试|刚刚开始|刚开始|入门)/i.test(merged);
  const hasModelPreference = /(seedance|即梦|veo|sora|可灵)/i.test(merged);
  const signals = [hasNeed, hasPrice, hasTrial, hasModelPreference].filter(Boolean).length;
  const highIntent = signals >= 2;
  return {
    highIntent,
    hasNeed,
    hasPrice,
    hasTrial,
    hasModelPreference,
    texts,
  };
}

function buildCommentHook(productSummary, inboundText) {
  const source = String(inboundText || '').toLowerCase();
  if (/(贵|成本|价格|收费)/.test(source)) {
    return '官方那套价格很多人都是看完就先劝退';
  }
  if (/(限制|排队|额度|卡|审核)/.test(source)) {
    return '很多人卡的不是效果，反而是额度和使用门槛';
  }
  if (/(seedance|veo|即梦|sora|可灵)/.test(source)) {
    return '这几个模型现在表面上大家都在聊效果，真正麻烦的其实是怎么持续用得起';
  }
  if (productSummary.sellingPoints.length) {
    return `${productSummary.sellingPoints[0]}这件事，很多人一开始都没找对入口`;
  }
  return '这个点很多人以为是模型问题，其实往往是入口没找对';
}

function assessSendRisk({ channel, content, product, threadContext }) {
  const reasons = [];
  let level = 'low';
  const normalized = String(content || '');
  const hasStrongClaim = /(保证|包过|稳赚|绝对|一定|永久免费|最低价|稳赚不赔)/.test(normalized);
  const hasPriceTalk = /(¥|￥|\$|价格|多少钱|优惠|折扣)/.test(normalized);
  const hasPriorConversation = Boolean(threadContext?.conversationSummary || threadContext?.dmSession || (threadContext?.replyNotifications || []).length);
  const hasProduct = Boolean(product?.selected);

  if (channel === 'dm' && !hasPriorConversation) {
    level = 'high';
    reasons.push('这是一个缺少历史上下文的私信触达。');
  }
  if (!hasProduct) {
    if (level === 'low') {
      level = 'medium';
    }
    reasons.push('当前没有绑定产品资料，回复依据较弱。');
  }
  if (normalized.length > 120) {
    if (level === 'low') {
      level = 'medium';
    }
    reasons.push('消息较长，建议先人工看一眼。');
  }
  if (hasPriceTalk || hasStrongClaim) {
    level = 'high';
    reasons.push('内容涉及价格、优惠或强承诺，建议人工确认。');
  }
  if (!reasons.length) {
    reasons.push('当前场景相对低风险。');
  }

  return { level, reasons };
}

function resolveConfirmationPolicy({ riskLevel, options = {}, settings }) {
  const mode = normalizeMode(options.mode || settings.sendMode);
  const allowedRisk = maxAllowedRiskForMode(mode, settings);
  const yes = Boolean(options.yes);
  const autoSend = Boolean(options['auto-send']);
  const requiresConfirmation = exceedsRisk(riskLevel, allowedRisk) || (!autoSend && mode === 'confirm');
  return {
    mode,
    allowedRisk,
    requiresConfirmation: requiresConfirmation && !yes,
    bypassedByYes: requiresConfirmation && yes,
  };
}

function buildDraftCandidates({ channel, product, inboundText, objective, threadContext }) {
  const productSummary = summarizeProduct(product);
  const opening = buildOpeningSnippet(inboundText, channel);
  const acknowledgement = buildAcknowledgement(opening, channel);
  const value = buildValueSnippet(productSummary);
  const cta = buildCallToAction(channel);
  const title = productSummary.title || '这个产品';
  const goal = objective ? `重点想回应的是：${objective}` : '';

  if (channel === 'comment') {
    const hook = buildCommentHook(productSummary, inboundText);
    const commentVariants = [
      {
        style: 'hooked',
        content: `${hook}。你这个点不是个例，我这边刚好踩过这条路，真想省时间的话可以私我，我把关键坑位直接告诉你。`,
      },
      {
        style: 'curious',
        content: `${acknowledgement}。很多人其实卡的不是生成，而是后面怎么稳定跑和怎么把成本压下来。你要是正准备长期用，可以私我，我把我这边试下来的路子跟你说清楚。`,
      },
      {
        style: 'insider',
        content: `${acknowledgement}。这类模型最近看着选择很多，但真正好用的组合没那么公开。你要是是认真在做，不是随便玩玩，可以私我，我把我现在在用的思路直接讲给你。`,
      },
    ];
    return commentVariants.map((item, index) => ({
      id: index + 1,
      style: item.style,
      content: item.content.trim(),
    }));
  }

  const leadStage = assessDmLeadStage(threadContext);
  const groupNumber = String(productSummary.assets?.groupNumber || '').trim();
  const qqNumber = String(productSummary.assets?.qqNumber || '').trim();
  const directHandoff = channel === 'dm' && leadStage.highIntent && (groupNumber || qqNumber)
    ? [
        {
          style: 'direct-handoff',
          content: `你这种刚开始试、又已经确定要 Seedance 的，就不用在这边来回聊太久了。你直接先进群就行，群号 ${groupNumber || qqNumber}，进群备注一下“Seedance 试用”，我看到后直接给你对接使用方式和大概范围。`,
        },
        {
          style: 'direct-qq',
          content: `你这个场景已经够明确了，直接走承接就行。你先加一下 QQ / 群 ${qqNumber || groupNumber}，备注“Seedance 自用试用”，我这边直接按你现在的量跟你说怎么接更省事。`,
        },
      ]
    : [];

  const variants = [
    {
      style: 'concise',
      content: `${channel === 'dm' ? '你好，' : ''}${acknowledgement}。${productSummary.sellingPoints.length ? `${title}比较适合 ${value}` : `我这边 ${value}`}。${cta}`,
    },
    {
      style: 'consultative',
      content: `${channel === 'dm' ? '你好，' : ''}${acknowledgement}，这个点其实很多人都会关心。${productSummary.sellingPoints.length ? `我们现在主要能提供的是 ${value}。` : '我可以先按你的具体情况帮你拆一下。'}${goal}${cta}`,
    },
    {
      style: 'soft-cta',
      content: `${channel === 'dm' ? '你好，' : ''}${acknowledgement}，我先不打扰你太多。${productSummary.sellingPoints.length ? `如果你在意的是这块，${title}比较有帮助的一点是 ${value}。` : '如果你愿意，我可以根据你的情况继续具体说。'}${cta}`,
    },
  ];

  return [...directHandoff, ...variants].map((item, index) => ({
    id: index + 1,
    style: item.style,
    content: item.content.trim(),
  }));
}

function buildThreadDraft({ threadContext, product, channel, objective, settings }) {
  const inboundText = extractLatestInbound(threadContext);
  const draftChannel = channel || threadContext.recommendedChannel || settings.defaultChannel;
  const candidates = buildDraftCandidates({
    channel: draftChannel,
    product,
    inboundText,
    objective,
    threadContext,
  }).slice(0, settings.draftCount);

  const risk = assessSendRisk({
    channel: draftChannel,
    content: candidates[0]?.content || '',
    product,
    threadContext,
  });
  const policy = resolveConfirmationPolicy({
    riskLevel: risk.level,
    options: { mode: settings.sendMode },
    settings,
  });
  const preferredTone = product?.selected?.profile?.preferredTone || 'friendly';
  const disallowedClaims = Array.isArray(product?.selected?.profile?.disallowedClaims) ? product.selected.profile.disallowedClaims : [];
  const recommendedCandidate = candidates[0] || null;

  return {
    channel: draftChannel,
    objective: objective || 'continue',
    latestInboundText: inboundText,
    candidates,
    recommendedCandidateId: recommendedCandidate?.id || null,
    replyCard: {
      recommendedStyle: recommendedCandidate?.style || '',
      recommendedContent: recommendedCandidate?.content || '',
      sendReasons: [
        inboundText ? '已经捕获到最近一条用户表达，可直接围绕该内容回应。' : '当前没有明显的最近表达，建议先用更温和的探询式回复。',
        product?.selected ? `已绑定产品资料：${product.selected.title || product.selected.slug}` : '当前没有绑定产品资料，建议补一个产品上下文再发。',
        draftChannel === 'dm' ? '当前更适合私信继续展开说明。' : '当前更适合在评论区继续保持轻量互动。',
        draftChannel === 'dm' && assessDmLeadStage(threadContext).highIntent ? '该用户已经表现出较高意向，可以直接走联系方式或群入口承接。' : '',
      ].filter(Boolean),
      beforeSendChecklist: [
        '确认回复是否真正回应了用户刚才的问题或兴趣点。',
        '确认措辞没有夸大承诺、价格承诺或过强营销感。',
        draftChannel === 'dm' ? '确认这是适合继续私信的用户，不要无上下文硬私聊。' : '确认评论区回复不要过长，避免像广告。',
      ],
    },
    risk,
    confirmationPolicy: policy,
    guardrails: {
      tone: preferredTone,
      disallowedClaims,
      bannedPatterns: ['保证', '绝对', '稳赚', '最低价', '永久免费', '包过'],
    },
    guidance: [
      '优先基于用户刚刚表达的问题或兴趣点来回复。',
      '如果用户兴趣明确，再自然地引导到更具体的信息或私信。',
      '不要把草稿当固定模板照抄，先结合上下文调整。',
    ],
  };
}

function buildPostActionGuidance({ channel, commentTarget = null, settings, now = Date.now() }) {
  const root = String(commentTarget?.root || '').trim();
  const isComment = channel === 'comment';
  const isReply = isComment && Boolean(root);
  const pauseSec = isComment
    ? Math.max(Number(isReply ? settings.postCommentReplyPauseSec : settings.postVideoCommentPauseSec), 5)
    : Math.max(Number(settings.postDmPauseSec), 5);
  const resumeAfter = new Date(now + pauseSec * 1000).toISOString();
  const actionType = isComment ? (isReply ? 'comment-reply' : 'video-comment') : 'dm';
  const title = isComment
    ? (isReply ? '评论回复后建议暂停' : '视频评论后建议暂停')
    : '私信发送后建议暂停';
  const reason = isComment
    ? (isReply ? '为了预防评论区连续回复触发风控，建议短暂停顿后再继续。' : '为了预防公开视频动作过密触发风控，建议短暂停顿后再继续。')
    : '为了预防私信节奏过密触发风控，建议短暂停顿后再继续。';
  return {
    actionType,
    pauseSec,
    resumeAfter,
    title,
    reason,
    prompt: `为了预防风控，你可以稍作休息 ${pauseSec} 秒后继续工作。`,
    settingsKeys: isComment
      ? (isReply ? ['postCommentReplyPauseSec'] : ['postVideoCommentPauseSec'])
      : ['postDmPauseSec'],
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_PATH,
  readEngagementSettings,
  writeEngagementSettings,
  patchEngagementSettings,
  normalizeMode,
  assessSendRisk,
  resolveConfirmationPolicy,
  buildThreadDraft,
  buildPostActionGuidance,
};
