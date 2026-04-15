'use strict';

const path = require('path');
const { DATA_DIR, ensureDir, writeJson, readJson } = require('./config');
const { CliError } = require('./errors');
const { summarizeProduct } = require('./products');
const { readRecentOperations, filterOperationsByCampaign, getPublicSendThrottleStatus, listConversations } = require('./tracker');
const { readEngagementSettings } = require('./engagement');
const { summarizeSchedule } = require('./scheduler');

const CAMPAIGNS_DIR = path.join(DATA_DIR, 'campaigns');
const CAMPAIGN_INDEX_PATH = path.join(CAMPAIGNS_DIR, 'index.json');

function ensureCampaignsDir() {
  ensureDir(CAMPAIGNS_DIR);
  return CAMPAIGNS_DIR;
}

function nowIso() {
  return new Date().toISOString();
}

function campaignId(productSlug, scheme) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `campaign-${productSlug}-${scheme}-${stamp}`;
}

function parseTime(value) {
  const ts = Date.parse(String(value || ''));
  return Number.isFinite(ts) ? ts : 0;
}

function normalizeQualityTier(value) {
  const normalized = String(value || 'medium').trim().toLowerCase();
  if (['low', 'medium', 'high'].includes(normalized)) {
    return normalized;
  }
  return 'medium';
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function addSeconds(iso, seconds) {
  const base = parseTime(iso);
  if (!base) {
    return '';
  }
  return new Date(base + Math.max(Number(seconds || 0), 0) * 1000).toISOString();
}

function qualityBudgetKey(value) {
  const normalized = normalizeQualityTier(value);
  if (normalized === 'low') {
    return 'lowQuality';
  }
  if (normalized === 'high') {
    return 'highQuality';
  }
  return 'mediumQuality';
}

function getPerVideoBudget(plan, qualityTier) {
  const bucket = plan?.budgets?.perVideoQualityBudget || {};
  return bucket[qualityBudgetKey(qualityTier)] || bucket.mediumQuality || null;
}

function nextWindowOpenAt(operations, now) {
  const timestamps = (operations || [])
    .map((item) => parseTime(item.ts))
    .filter((value) => value > 0 && value >= now - 60 * 60 * 1000)
    .sort((a, b) => a - b);
  if (!timestamps.length) {
    return '';
  }
  return new Date(timestamps[0] + 60 * 60 * 1000).toISOString();
}

function schemePreset(name) {
  const normalized = String(name || 'candidate-pool-v1').trim().toLowerCase();
  if (normalized !== 'candidate-pool-v1') {
    throw new CliError('当前只支持 candidate-pool-v1。');
  }
  return {
    key: 'candidate-pool-v1',
    title: '候选池公开引流-v1',
    description: '围绕单个产品按小步快跑的方式消费候选池、执行公开评论、评论回复和私信跟进，优先保证节奏稳定和低重复。',
    cadence: {
      pickCandidateEverySec: 120,
      checkInboxEverySec: 180,
      commentReplyMinGapSec: 20,
      videoHopMinSec: 60,
      videoHopMaxSec: 120,
      phaseReviewEverySec: 900,
    },
    perCycle: {
      videoCandidates: 1,
      rootComments: 1,
      candidateCommentRepliesMin: 2,
      candidateCommentRepliesMax: 4,
      directDmHighIntentMax: 1,
      directDmMediumIntent: false,
    },
    videoDwell: {
      lowQuality: {
        label: '低质量评论区',
        maxCommentReplies: 2,
        maxDirectDm: 0,
        stayMinutes: [2, 4],
      },
      mediumQuality: {
        label: '中等质量评论区',
        maxCommentReplies: 5,
        maxDirectDm: 1,
        stayMinutes: [5, 10],
      },
      highQuality: {
        label: '高质量评论区',
        maxCommentReplies: 12,
        maxDirectDm: 3,
        stayMinutes: [10, 25],
      },
    },
    budgets: {
      maxVideoCandidatesPerHour: 20,
      maxRootCommentsPerHour: 12,
      maxCommentRepliesPerHour: 36,
      maxDmsPerHour: 8,
      maxTotalTouchesPerHour: 56,
    },
    guardrails: [
      '公开区内容要相关、短句、像真人，避免模板重复。',
      '公开区不直接发群链接、二维码、QQ 号。',
      '高意向用户可私信，中意向优先只回复评论。',
      '每次发送前都要结合用户原话做轻微改写，不要整批复读。',
      '如果任务进入等待回复阶段，优先处理 inbox，不要继续扩大发送面。',
      '评论区质量高时可以在同一个视频下停留更久，但仍要遵守单条公开互动至少 20 秒间隔。',
      '从当前视频切到下一个视频前，至少等待 1 到 2 分钟，不要频繁换视频。',
      '不要机械地每 2 分钟都重新搜索；默认只是在候选池里切换到下一个视频。',
      '只有当前视频评论区质量差、已榨干或命中黑名单时，才换下一个候选视频。',
      '优先挑播放量、收藏量、互动密度都更高的候选视频；宁可少换，也不要一直翻低质量长尾视频。',
    ],
  };
}

function readCampaignIndex() {
  return readJson(CAMPAIGN_INDEX_PATH, { items: [] });
}

function writeCampaignIndex(payload) {
  ensureCampaignsDir();
  writeJson(CAMPAIGN_INDEX_PATH, payload);
  return payload;
}

function campaignFilePath(id) {
  ensureCampaignsDir();
  return path.join(CAMPAIGNS_DIR, `${id}.json`);
}

function readCampaign(id) {
  return readJson(campaignFilePath(id), null);
}

function writeCampaign(payload) {
  ensureCampaignsDir();
  payload.runtime = {
    activeVideoId: '',
    activeVideoQuality: '',
    activeVideoReason: '',
    lastActionAt: '',
    lastVideoActionAt: '',
    lastVideoSwitchAt: '',
    lastInboxCheckAt: '',
    lastCandidatePickAt: '',
    videos: {},
    ...(payload.runtime || {}),
  };
  payload.updatedAt = nowIso();
  writeJson(campaignFilePath(payload.id), payload);
  const index = readCampaignIndex();
  const items = Array.isArray(index.items) ? index.items : [];
  const summary = {
    id: payload.id,
    productSlug: payload.summary.productSlug,
    scheme: payload.summary.scheme,
    hours: payload.summary.hours,
    status: payload.status,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    path: campaignFilePath(payload.id),
  };
  const currentIndex = items.findIndex((item) => item.id === payload.id);
  if (currentIndex >= 0) {
    items[currentIndex] = summary;
  } else {
    items.unshift(summary);
  }
  writeCampaignIndex({ items: items.slice(0, 100) });
  return payload;
}

function buildBudgetSummary({ preset, durationHours, settings }) {
  const safeRootPerHour = Math.min(
    Number(preset.budgets.maxRootCommentsPerHour || 12),
    Number(settings.publicCommentMaxPerHour || 20)
  );
  const safeReplyPerHour = Math.min(
    Number(preset.budgets.maxCommentRepliesPerHour || 36),
    Number(settings.publicReplyMaxPerHour || 100)
  );
  const safeDmPerHour = Number(preset.budgets.maxDmsPerHour || 8);
  const safeTouchesPerHour = Math.min(
    Number(preset.budgets.maxTotalTouchesPerHour || 56),
    safeRootPerHour + safeReplyPerHour + safeDmPerHour
  );
  const maxVideosPerHour = Math.min(
    Number(preset.budgets.maxVideoCandidatesPerHour || 20),
    Math.max(safeRootPerHour + 1, 2)
  );
  return {
    perHour: {
      videoCandidates: maxVideosPerHour,
      rootComments: safeRootPerHour,
      commentReplies: safeReplyPerHour,
      dms: safeDmPerHour,
      totalTouches: safeTouchesPerHour,
    },
    total: {
      videoCandidates: maxVideosPerHour * durationHours,
      rootComments: safeRootPerHour * durationHours,
      commentReplies: safeReplyPerHour * durationHours,
      dms: safeDmPerHour * durationHours,
      totalTouches: safeTouchesPerHour * durationHours,
    },
  };
}

function normalizeRuntime(runtime) {
  return {
    activeVideoId: '',
    activeVideoQuality: '',
    activeVideoReason: '',
    lastActionAt: '',
    lastVideoActionAt: '',
    lastVideoSwitchAt: '',
    lastInboxCheckAt: '',
    lastCandidatePickAt: '',
    videos: {},
    ...(runtime || {}),
  };
}

function updatePhaseStatuses(phases, currentPhaseId) {
  return (phases || []).map((phase) => {
    if (phase.id === currentPhaseId) {
      return {
        ...phase,
        status: 'in_progress',
      };
    }
    if (phase.status === 'completed') {
      return phase;
    }
    return {
      ...phase,
      status: 'pending',
    };
  });
}

function buildCampaignPlan({ productSlug, hours = 3, scheme = 'candidate-pool-v1' }) {
  const product = summarizeProduct(productSlug);
  if (!product) {
    throw new CliError(`未找到产品资料：${productSlug}`);
  }
  const preset = schemePreset(scheme);
  const settings = readEngagementSettings();
  const durationHours = clamp(Number(hours || 3), 1, 72);
  const durationSec = durationHours * 3600;
  const budget = buildBudgetSummary({ preset, durationHours, settings });
  const candidatePickCycles = Math.max(Math.floor(durationSec / preset.cadence.pickCandidateEverySec), 1);
  const inboxChecks = Math.max(Math.floor(durationSec / preset.cadence.checkInboxEverySec), 1);

  return {
    generatedAt: nowIso(),
    scheme: preset,
    duration: {
      hours: durationHours,
      seconds: durationSec,
    },
    product: {
      slug: product.slug,
      title: product.title,
      path: product.path,
      readiness: product.readiness,
    },
    executionModel: {
      userInput: '用户只需要提供产品名或 slug，以及推广时长。',
      agentLoop: [
        '读取产品资料和资源图，不要脱离产品上下文。',
        '不要把搜索当主动作；先处理当前聚焦视频和 inbox，只有当前视频价值不高时才切到候选池里的下一个。',
        '优先挑播放量、收藏量、互动质量都更高的候选视频，不要在低播放视频上浪费动作预算。',
        '先判断当前视频评论区质量和与产品的相关度，再决定是否停留更久。',
        '带 campaign 的公开动作按当前 campaign 的预算和视频节奏执行，不走普通模式的全局公开护栏。',
        '如果评论区质量高，可以在同一视频下停留更久，持续回复更多高意向评论。',
        '从该视频评论区里只挑少量但更像潜在用户的人跟进，不要整批扫射。',
        '高意向用户才允许直接私信，中意向优先只做评论回复。',
        '每隔 3 分钟检查一次私信和评论回复，优先继续已有会话。',
        '一旦进入等待回复阶段，优先 inbox 和 thread continue，不要继续扩公开动作。',
      ],
      qualityHeuristics: [
        '评论区里明确提问、比较方案、询问资源或表达持续使用意向，可视为高质量信号。',
        '如果评论区只有玩梗、纯情绪表达、与产品弱相关内容，不要长时间停留。',
        '高质量评论区允许从 1-2 条回复扩展到更长停留，但仍需分散节奏和改写内容。',
        '如果视频播放量、收藏量、评论量都偏低，即使关键词命中，也不要当重点推广目标。',
      ],
    },
    pacing: {
      candidatePickEverySec: preset.cadence.pickCandidateEverySec,
      inboxCheckEverySec: preset.cadence.checkInboxEverySec,
      commentReplyMinGapSec: Math.max(
        Number(preset.cadence.commentReplyMinGapSec || 20),
        Number(settings.campaignCommentReplyGapSec || 20)
      ),
      betweenVideoHopSec: {
        min: Math.max(Number(preset.cadence.videoHopMinSec || 60), Number(settings.campaignVideoHopMinSec || 60)),
        max: Math.max(Number(preset.cadence.videoHopMaxSec || 120), Number(settings.campaignVideoHopMaxSec || 120)),
      },
      nonCampaignPublicSafetyGateSec: Number(settings.publicCommentMinGapSec || 180),
    },
    budgets: {
      candidatePickCycles,
      inboxChecks,
      perHour: budget.perHour,
      total: budget.total,
      perCycle: preset.perCycle,
      perVideoQualityBudget: preset.videoDwell,
    },
    commands: {
      init: [
        'node scripts/bili.js init status',
        'node scripts/bili.js system doctor',
      ],
      prep: [
        `node scripts/bili.js product summarize --slug "${product.slug}"`,
        'node scripts/bili.js auth qr-generate',
        'node scripts/bili.js auth qr-poll',
      ],
      launch: [
        'node scripts/bili.js watch prime',
        `node scripts/bili.js watch run --interval-sec ${preset.cadence.checkInboxEverySec} --iterations 0`,
        `node scripts/bili.js inbox list --product "${product.slug}"`,
      ],
      candidatePool: [
        `node scripts/bili.js candidate collect --product "${product.slug}" --target-count 30`,
        `node scripts/bili.js candidate next --product "${product.slug}" --campaign "<campaign_id>"`,
      ],
    },
    operatorRules: [
      '这是预算型任务，不允许一次性把所有公开视频和私信全发出去。',
      '没有明确上下文时，不要无脑直发私信。',
      '带 campaign 的公开评论和公开回复按 campaign 预算与视频节奏执行；不带 campaign 时才受全局公开护栏约束。',
      '在同一个视频里回复不同评论时，至少保持 20 秒间隔。',
      '从一个视频切到下一个视频前，保持 1 到 2 分钟缓冲。',
      '任务结束后必须汇总视频、公开评论、评论回复、私信和回复率。',
    ],
    recommendedSequence: [
      '先看 campaign plan，确认总时长、视频质量阈值和预算是否合理。',
      '启动 campaign run 后，优先 watch -> inbox -> 当前聚焦视频 -> thread，而不是直接批量 search / send。',
      '如果某个视频评论区质量高，可以延长停留时间，但不要突破单视频内的节奏约束。',
      '每一轮只消耗少量预算，命中等待回复后切回消息跟进。',
    ],
  };
}

function buildTouchedVideos(operations) {
  const map = new Map();
  for (const item of operations) {
    const payload = item.payload?.data || {};
    const bvid = payload.video?.bvid || payload.commentTarget?.bvid || item.command?.options?.id || '';
    if (!bvid) {
      continue;
    }
    if (!map.has(bvid)) {
      map.set(bvid, {
        bvid,
        title: payload.video?.title || '',
        commentCount: 0,
        replyCount: 0,
      });
    }
    const entry = map.get(bvid);
    if (payload.commentTarget?.root || item.command?.options?.root) {
      entry.replyCount += 1;
    } else {
      entry.commentCount += 1;
    }
  }
  return Array.from(map.values()).slice(0, 50);
}

function buildTouchedUsers(operations) {
  const map = new Map();
  for (const item of operations) {
    const payload = item.payload?.data || {};
    const mid = String(
      payload.receiverId ||
      payload.targetMid ||
      item.command?.options?.mid ||
      ''
    ).trim();
    if (!mid) {
      continue;
    }
    if (!map.has(mid)) {
      map.set(mid, {
        mid,
        dmCount: 0,
        lastTs: '',
      });
    }
    const entry = map.get(mid);
    entry.dmCount += 1;
    entry.lastTs = item.ts || entry.lastTs;
  }
  return Array.from(map.values()).slice(0, 100);
}

function campaignWindowOperations(campaign) {
  const sinceMs = parseTime(campaign.createdAt);
  const recent = readRecentOperations(2000).filter((item) => {
    const ts = parseTime(item.ts);
    return ts >= sinceMs && item.status === 'ok';
  });
  const campaignSpecific = filterOperationsByCampaign(recent, campaign.id);
  return campaignSpecific.length ? campaignSpecific : recent;
}

function summarizeExecution(campaign, now = Date.now()) {
  const operations = campaignWindowOperations(campaign);
  const publicOps = operations.filter(
    (item) => item.command?.resource === 'thread' && item.command?.action === 'send' && item.payload?.data?.channel === 'comment'
  );
  const dmOps = operations.filter(
    (item) => item.command?.resource === 'thread' && item.command?.action === 'send' && item.payload?.data?.channel === 'dm'
  );
  const candidateOps = operations.filter(
    (item) => item.command?.resource === 'candidate' && item.command?.action === 'next'
  );

  let rootComments = 0;
  let commentReplies = 0;
  for (const item of publicOps) {
    const hasRoot = Boolean(item.command?.options?.root || item.payload?.data?.commentTarget?.root);
    if (hasRoot) {
      commentReplies += 1;
    } else {
      rootComments += 1;
    }
  }

  const hourAgo = now - 60 * 60 * 1000;
  const recentWindow = operations.filter((item) => parseTime(item.ts) >= hourAgo);
  const recentPublicOps = publicOps.filter((item) => parseTime(item.ts) >= hourAgo);
  const recentDmOps = dmOps.filter((item) => parseTime(item.ts) >= hourAgo);
  const recentCandidateOps = candidateOps.filter((item) => parseTime(item.ts) >= hourAgo);
  const recentRootComments = recentPublicOps.filter((item) => {
    const hasRoot = Boolean(item.command?.options?.root || item.payload?.data?.commentTarget?.root);
    return !hasRoot;
  });
  const recentReplies = recentPublicOps.filter((item) => {
    const hasRoot = Boolean(item.command?.options?.root || item.payload?.data?.commentTarget?.root);
    return hasRoot;
  });
  const recentTouches = recentWindow.filter((item) => item.command?.resource === 'thread' && item.command?.action === 'send');

  return {
    operations,
    metrics: {
      candidatePicks: candidateOps.length,
      publicComments: rootComments,
      publicReplies: commentReplies,
      dms: dmOps.length,
      totalTouches: rootComments + commentReplies + dmOps.length,
      touchedVideos: buildTouchedVideos(publicOps),
      touchedUsers: buildTouchedUsers(dmOps),
      recentOperationCount: operations.length,
      currentHour: {
        videoCandidates: recentCandidateOps.length,
        rootComments: recentRootComments.length,
        commentReplies: recentReplies.length,
        dms: recentDmOps.length,
        totalTouches: recentTouches.length,
        nextWindowOpenAt: {
          videoCandidates: nextWindowOpenAt(recentCandidateOps, now),
          rootComments: nextWindowOpenAt(recentRootComments, now),
          commentReplies: nextWindowOpenAt(recentReplies, now),
          dms: nextWindowOpenAt(recentDmOps, now),
          totalTouches: nextWindowOpenAt(recentTouches, now),
        },
      },
    },
  };
}

function inferPhase(campaign, metrics) {
  if (!metrics.totalTouches && !metrics.candidatePicks) {
    return 'prepare';
  }
  if (metrics.candidatePicks && !metrics.publicComments && !metrics.publicReplies && !metrics.dms) {
    return 'pick_candidate';
  }
  if (metrics.publicComments || metrics.publicReplies) {
    return 'engage_public';
  }
  if (metrics.dms) {
    return 'engage_dm';
  }
  return 'monitor';
}

function summarizeBudgetState(campaign, metrics) {
  let perHour = campaign.plan?.budgets?.perHour || {};
  let total = campaign.plan?.budgets?.total || {};
  if (!Object.keys(total).length) {
    const preset = schemePreset(campaign.summary?.scheme || 'candidate-pool-v1');
    const settings = readEngagementSettings();
    const durationHours = clamp(Number(campaign.summary?.hours || campaign.plan?.duration?.hours || 3), 1, 72);
    const fallbackBudget = buildBudgetSummary({ preset, durationHours, settings });
    perHour = fallbackBudget.perHour;
    total = fallbackBudget.total;
  }
  return {
    perHour,
    total,
    consumed: {
      videoCandidates: metrics.candidatePicks,
      rootComments: metrics.publicComments,
      commentReplies: metrics.publicReplies,
      dms: metrics.dms,
      totalTouches: metrics.totalTouches,
    },
    remaining: {
      videoCandidates: Math.max(Number(total.videoCandidates || 0) - metrics.candidatePicks, 0),
      rootComments: Math.max(Number(total.rootComments || 0) - metrics.publicComments, 0),
      commentReplies: Math.max(Number(total.commentReplies || 0) - metrics.publicReplies, 0),
      dms: Math.max(Number(total.dms || 0) - metrics.dms, 0),
      totalTouches: Math.max(Number(total.totalTouches || 0) - metrics.totalTouches, 0),
    },
    currentHour: {
      consumed: {
        videoCandidates: Number(metrics.currentHour?.videoCandidates || 0),
        rootComments: Number(metrics.currentHour?.rootComments || 0),
        commentReplies: Number(metrics.currentHour?.commentReplies || 0),
        dms: Number(metrics.currentHour?.dms || 0),
        totalTouches: Number(metrics.currentHour?.totalTouches || 0),
      },
      remaining: {
        videoCandidates: Math.max(Number(perHour.videoCandidates || 0) - Number(metrics.currentHour?.videoCandidates || 0), 0),
        rootComments: Math.max(Number(perHour.rootComments || 0) - Number(metrics.currentHour?.rootComments || 0), 0),
        commentReplies: Math.max(Number(perHour.commentReplies || 0) - Number(metrics.currentHour?.commentReplies || 0), 0),
        dms: Math.max(Number(perHour.dms || 0) - Number(metrics.currentHour?.dms || 0), 0),
        totalTouches: Math.max(Number(perHour.totalTouches || 0) - Number(metrics.currentHour?.totalTouches || 0), 0),
      },
      nextWindowOpenAt: {
        videoCandidates: metrics.currentHour?.nextWindowOpenAt?.videoCandidates || '',
        rootComments: metrics.currentHour?.nextWindowOpenAt?.rootComments || '',
        commentReplies: metrics.currentHour?.nextWindowOpenAt?.commentReplies || '',
        dms: metrics.currentHour?.nextWindowOpenAt?.dms || '',
        totalTouches: metrics.currentHour?.nextWindowOpenAt?.totalTouches || '',
      },
    },
  };
}

function buildInboxPressure({ campaign, runtime, settings, now }) {
  const productSlug = String(campaign.summary?.productSlug || '').trim();
  const lastInboxCheckMs = parseTime(runtime.lastInboxCheckAt);
  const staleConversationMs = 72 * 60 * 60 * 1000;
  const items = listConversations()
    .map((conversation) => ({
      conversation,
      schedule: summarizeSchedule(conversation, settings, now),
    }))
    .filter(({ conversation, schedule }) => {
      const lastOutboundProduct = String(conversation.lastOutbound?.productSlug || '').trim();
      const productMatched = !productSlug || !lastOutboundProduct || lastOutboundProduct === productSlug;
      if (!productMatched) {
        return false;
      }
      const lastInboundMs = parseTime(conversation.lastInboundAt || '');
      const lastOutboundMs = parseTime(conversation.lastOutboundAt || '');
      const lastSessionMs = parseTime(conversation.lastSessionAt || '');
      const lastActivityMs = Math.max(
        lastInboundMs || 0,
        lastOutboundMs || 0,
        lastSessionMs || 0
      );
      if (Number(conversation.unreadCount || 0) > 0) {
        return true;
      }
      if (
        conversation.lastInbound?.type === 'comment_reply_notification' &&
        lastActivityMs >= now - staleConversationMs &&
        (!lastInboxCheckMs || lastInboundMs > lastInboxCheckMs)
      ) {
        return true;
      }
      return false;
    })
    .sort((a, b) => {
      const unreadDiff = Number(b.conversation.unreadCount || 0) - Number(a.conversation.unreadCount || 0);
      if (unreadDiff) {
        return unreadDiff;
      }
      return Math.max(
        parseTime(b.conversation.lastInboundAt || ''),
        parseTime(b.conversation.lastSessionAt || ''),
        parseTime(b.conversation.lastOutboundAt || '')
      ) - Math.max(
        parseTime(a.conversation.lastInboundAt || ''),
        parseTime(a.conversation.lastSessionAt || ''),
        parseTime(a.conversation.lastOutboundAt || '')
      );
    });
  return {
    requiresAttention: items.length > 0,
    items: items.slice(0, 5).map(({ conversation, schedule }) => ({
      mid: String(conversation.mid || ''),
      nickname: conversation.nickname || '',
      unreadCount: Number(conversation.unreadCount || 0),
      lastInboundType: conversation.lastInbound?.type || '',
      lastInboundAt: conversation.lastInboundAt || '',
      cooldownReason: schedule.cooldownReason || '',
    })),
  };
}

function summarizeActiveVideo(runtime, plan, now) {
  const activeVideoId = String(runtime.activeVideoId || '').trim();
  if (!activeVideoId) {
    return {
      active: false,
      videoId: '',
      dwellExpired: false,
      maxStayUntil: '',
      reason: '',
      state: null,
      qualityTier: '',
      budget: null,
    };
  }
  const state = runtime.videos?.[activeVideoId] || null;
  const qualityTier = normalizeQualityTier(state?.qualityTier || runtime.activeVideoQuality || 'medium');
  const budget = getPerVideoBudget(plan, qualityTier);
  const firstSeenAt = state?.firstSeenAt || runtime.lastCandidatePickAt || runtime.lastVideoSwitchAt || '';
  const maxStayMinutes = Math.max(...(budget?.stayMinutes || [0, 0]));
  const maxStayUntil = firstSeenAt && maxStayMinutes > 0
    ? new Date(parseTime(firstSeenAt) + maxStayMinutes * 60 * 1000).toISOString()
    : '';
  const dwellExpired = Boolean(maxStayUntil && parseTime(maxStayUntil) <= now);
  return {
    active: true,
    videoId: activeVideoId,
    dwellExpired,
    maxStayUntil,
    reason: state?.reason || runtime.activeVideoReason || '',
    state,
    qualityTier,
    budget,
  };
}

function buildIntentSignal({ targetMid = '', threadContext = null }) {
  const inboundText = String(
    threadContext?.conversationSummary?.lastInboundMessage ||
    threadContext?.replyNotifications?.[0]?.item?.targetReplyContent ||
    threadContext?.dmHistory?.items?.slice(-1)?.[0]?.content?.content ||
    ''
  ).trim();
  const hasExistingDm = Boolean(threadContext?.dmSession || (threadContext?.dmHistory?.items || []).length);
  const highIntentPattern = /(怎么联系|如何联系|怎么加|如何加|资料|群|vx|v信|微信|私信你|联系你|想试|想用|长期用|长期使用|合作|报价|多少钱|价格|套餐|购买|资源)/i;
  if (hasExistingDm || highIntentPattern.test(inboundText)) {
    return {
      level: 'high',
      reasons: hasExistingDm ? ['已存在私信上下文。'] : ['用户表达了明确的联系方式、试用、购买或资源需求。'],
      latestInboundText: inboundText,
      targetMid: String(targetMid || ''),
    };
  }
  if (inboundText) {
    return {
      level: 'medium',
      reasons: ['已有互动上下文，但尚未达到明确私信升级信号。'],
      latestInboundText: inboundText,
      targetMid: String(targetMid || ''),
    };
  }
  return {
    level: 'low',
    reasons: ['当前缺少可用于升级私信的明确上下文。'],
    latestInboundText: '',
    targetMid: String(targetMid || ''),
  };
}

function buildCampaignEvaluation(campaignOrId, options = {}) {
  const campaign = typeof campaignOrId === 'string' ? readCampaign(campaignOrId) : campaignOrId;
  if (!campaign) {
    throw new CliError('未找到 campaign。');
  }

  const actionKind = String(options.actionKind || '').trim();
  const videoId = String(options.videoId || '').trim();
  const commentTarget = options.commentTarget || null;
  const videoQuality = normalizeQualityTier(options.videoQuality || 'medium');
  const targetMid = String(options.targetMid || '').trim();
  const threadContext = options.threadContext || null;
  const settings = readEngagementSettings();
  const now = Date.now();
  const execution = summarizeExecution(campaign, now);
  const budget = summarizeBudgetState(campaign, execution.metrics);
  const phase = inferPhase(campaign, execution.metrics);
  const startMs = parseTime(campaign.createdAt) || now;
  const durationMs = Number(campaign.plan?.duration?.seconds || 0) * 1000;
  const endMs = durationMs ? startMs + durationMs : 0;
  const remainingRuntimeMs = endMs ? Math.max(endMs - now, 0) : 0;
  const runtime = normalizeRuntime(campaign.runtime);
  const currentVideo = summarizeActiveVideo(runtime, campaign.plan, now);
  const inboxPressure = buildInboxPressure({ campaign, runtime, settings, now });
  const nonCampaignPublicThrottle = getPublicSendThrottleStatus(settings);
  const blockedReasons = [];
  let primaryAction = null;

  if (remainingRuntimeMs <= 0) {
    blockedReasons.push('campaign 运行时长已结束');
    primaryAction = {
      kind: 'review',
      title: '结束当前 campaign 并复盘',
      reason: '当前 campaign 已达到计划运行时长。',
      command: `node scripts/bili.js campaign status --id "${campaign.id}"`,
    };
  } else if (budget.remaining.totalTouches <= 0) {
    blockedReasons.push('任务总预算已耗尽');
    primaryAction = {
      kind: 'review',
      title: '停止新增动作并进入复盘',
      reason: '当前 campaign 的总触达预算已经用完。',
      command: `node scripts/bili.js campaign status --id "${campaign.id}"`,
    };
  } else if (inboxPressure.requiresAttention) {
    blockedReasons.push('存在未处理的 inbox 线索，优先跟进');
    primaryAction = {
      kind: 'inbox',
      title: '优先处理收件箱与评论回复',
      reason: '检测到未读私信、评论回复或等待回复线程。',
      command: `node scripts/bili.js inbox list --product "${campaign.summary?.productSlug || ''}" --campaign "${campaign.id}"`,
    };
  } else if (!currentVideo.active) {
    const candidatePickGapUntil = addSeconds(runtime.lastCandidatePickAt, Number(campaign.plan?.pacing?.candidatePickEverySec || 120));
    if (budget.currentHour.remaining.videoCandidates <= 0) {
      blockedReasons.push('当前小时的视频候选预算已耗尽');
      primaryAction = {
        kind: 'cooldown',
        title: '等待下一轮候选视频窗口',
        reason: '当前小时候选视频切换次数已经达到上限。',
        command: `node scripts/bili.js campaign status --id "${campaign.id}"`,
        notBefore: budget.currentHour.nextWindowOpenAt.videoCandidates || '',
      };
    } else if (candidatePickGapUntil && parseTime(candidatePickGapUntil) > now) {
      blockedReasons.push('当前还处在候选视频切换间隔内');
      primaryAction = {
        kind: 'cooldown',
        title: '等待候选视频切换窗口',
        reason: '候选视频切换频率过高，暂不建议继续拿下一个视频。',
        command: `node scripts/bili.js campaign status --id "${campaign.id}"`,
        notBefore: candidatePickGapUntil,
      };
    } else {
      primaryAction = {
        kind: 'candidate-next',
        title: '从候选池预留下一个视频',
        reason: '当前没有聚焦视频，可以进入下一轮公开视频选择。',
        command: `node scripts/bili.js candidate next --product "${campaign.summary?.productSlug || ''}" --campaign "${campaign.id}"`,
      };
    }
  } else if (currentVideo.dwellExpired) {
    const hopUntil = addSeconds(runtime.lastVideoActionAt, Number(campaign.plan?.pacing?.betweenVideoHopSec?.min || 60));
    if (hopUntil && parseTime(hopUntil) > now) {
      blockedReasons.push('当前视频已到停留上限，且跨视频缓冲尚未结束');
      primaryAction = {
        kind: 'cooldown',
        title: '等待跨视频缓冲结束',
        reason: '当前视频停留已到上限，下一步应换视频，但还处在跨视频缓冲期。',
        command: `node scripts/bili.js campaign status --id "${campaign.id}"`,
        notBefore: hopUntil,
      };
    } else {
      primaryAction = {
        kind: 'candidate-next',
        title: '切换到下一个候选视频',
        reason: '当前视频停留时间已到上限，应结束当前视频的公开互动。',
        command: `node scripts/bili.js candidate next --product "${campaign.summary?.productSlug || ''}" --campaign "${campaign.id}"`,
      };
    }
  } else {
    const sameVideoGapUntil = addSeconds(runtime.lastVideoActionAt, Number(campaign.plan?.pacing?.commentReplyMinGapSec || 20));
    if (sameVideoGapUntil && parseTime(sameVideoGapUntil) > now) {
      blockedReasons.push('当前视频的公开互动仍在最小间隔窗口内');
      primaryAction = {
        kind: 'cooldown',
        title: '等待当前视频公开互动间隔',
        reason: '当前视频仍可继续处理，但还没到下一次公开视频动作时间。',
        command: `node scripts/bili.js campaign focus --id "${campaign.id}" --video "${currentVideo.videoId}" --video-quality ${currentVideo.qualityTier || 'medium'}`,
        notBefore: sameVideoGapUntil,
      };
    } else {
      primaryAction = {
        kind: 'focus-video',
        title: '继续处理当前聚焦视频',
        reason: currentVideo.reason || '当前视频仍在允许停留窗口内。',
        command: `node scripts/bili.js campaign focus --id "${campaign.id}" --video "${currentVideo.videoId}" --video-quality ${currentVideo.qualityTier || 'medium'}`,
      };
    }
  }

  if (actionKind === 'pickCandidate') {
    if (inboxPressure.requiresAttention) {
      throw new CliError(
        '当前存在未处理的 inbox 线索，候选视频选择已被收件箱优先级拦截。',
        1,
        { campaignId: campaign.id, inboxPressure, primaryAction },
        '先执行 `inbox list` / `thread continue` 处理当前消息，再继续候选视频选择。'
      );
    }
    if (currentVideo.active && !currentVideo.dwellExpired) {
      throw new CliError(
        '当前仍有聚焦视频可继续处理，不建议现在切到下一个候选视频。',
        1,
        { campaignId: campaign.id, currentVideo, primaryAction },
        '优先继续当前视频，只有停留上限到了或你明确决定放弃当前视频时再切换。'
      );
    }
    if (budget.currentHour.remaining.videoCandidates <= 0) {
      throw new CliError(
        '当前小时的视频候选预算已经耗尽。',
        1,
        { campaignId: campaign.id, budget, primaryAction },
        `建议至少等到 ${budget.currentHour.nextWindowOpenAt.videoCandidates || '下一小时窗口'} 再继续选择候选视频。`
      );
    }
  }

  if (actionKind === 'rootComment' || actionKind === 'commentReply' || actionKind === 'dm') {
    if (budget.currentHour.remaining.totalTouches <= 0) {
      throw new CliError(
        '当前小时的总触达预算已经耗尽。',
        1,
        { campaignId: campaign.id, budget, primaryAction },
        `建议至少等到 ${budget.currentHour.nextWindowOpenAt.totalTouches || '下一小时窗口'} 再继续执行新的触达动作。`
      );
    }
  }

  if (actionKind === 'rootComment' && budget.currentHour.remaining.rootComments <= 0) {
    throw new CliError(
      '当前小时的主评论预算已经耗尽。',
      1,
      { campaignId: campaign.id, budget, primaryAction },
      `建议至少等到 ${budget.currentHour.nextWindowOpenAt.rootComments || '下一小时窗口'} 再继续发新的主评论。`
    );
  }

  if (actionKind === 'commentReply' && budget.currentHour.remaining.commentReplies <= 0) {
    throw new CliError(
      '当前小时的评论回复预算已经耗尽。',
      1,
      { campaignId: campaign.id, budget, primaryAction },
      `建议至少等到 ${budget.currentHour.nextWindowOpenAt.commentReplies || '下一小时窗口'} 再继续评论区回复。`
    );
  }

  if (actionKind === 'dm' && budget.currentHour.remaining.dms <= 0) {
    throw new CliError(
      '当前小时的私信预算已经耗尽。',
      1,
      { campaignId: campaign.id, budget, primaryAction },
      `建议至少等到 ${budget.currentHour.nextWindowOpenAt.dms || '下一小时窗口'} 再继续私信。`
    );
  }

  if ((actionKind === 'rootComment' || actionKind === 'commentReply' || actionKind === 'pickCandidate') && inboxPressure.requiresAttention) {
    throw new CliError(
      '当前 campaign 已检测到需要优先处理的收件箱线索，公开动作已被暂时拦截。',
      1,
      { campaignId: campaign.id, inboxPressure, primaryAction },
      '先执行 `inbox list` / `thread continue` 处理已有线索，再继续公开触达。'
    );
  }

  if (actionKind === 'dm') {
    const signal = buildIntentSignal({ targetMid, threadContext });
    if (signal.level !== 'high') {
      throw new CliError(
        '当前线索尚未达到可升级私信的高意向门槛。',
        1,
        { campaignId: campaign.id, intent: signal, primaryAction },
        '中意向线索优先继续公开回复；只有高意向或已存在私信上下文时再升级到私信。'
      );
    }
  }

  return {
    campaign,
    execution,
    budget,
    runtime,
    phase,
    remainingRuntimeSec: Math.floor(remainingRuntimeMs / 1000),
    inboxPressure,
    currentVideo,
    nonCampaignPublicThrottle,
    blockedReasons,
    primaryAction,
  };
}

function buildCampaignStatus(campaignOrId) {
  const evaluation = buildCampaignEvaluation(campaignOrId);
  const campaign = evaluation.campaign;
  const runtime = evaluation.runtime || {};
  const currentVideoState = runtime.activeVideoId ? runtime.videos?.[runtime.activeVideoId] || null : null;
  const suggestedCommands = [
    `node scripts/bili.js campaign status --id "${campaign.id}"`,
    evaluation.primaryAction?.command || `node scripts/bili.js inbox list --product "${campaign.summary?.productSlug || ''}" --campaign "${campaign.id}"`,
    `node scripts/bili.js inbox list --product "${campaign.summary?.productSlug || ''}" --campaign "${campaign.id}"`,
  ].filter(Boolean);

  return {
    ...campaign,
    statusSummary: {
      phase: evaluation.phase,
      remainingRuntimeSec: evaluation.remainingRuntimeSec,
      publicThrottle: evaluation.nonCampaignPublicThrottle,
      blockedReasons: evaluation.blockedReasons,
      nextAction: evaluation.primaryAction?.title || '继续按 campaign 节奏执行。',
      nextActionReason: evaluation.primaryAction?.reason || '',
      nextActionNotBefore: evaluation.primaryAction?.notBefore || '',
    },
    budget: evaluation.budget,
    pacing: campaign.plan?.pacing || {},
    runtime,
    focus: {
      activeVideoId: runtime.activeVideoId || '',
      activeVideoQuality: runtime.activeVideoQuality || '',
      activeVideoReason: runtime.activeVideoReason || '',
      currentVideoState,
      lastInboxCheckAt: runtime.lastInboxCheckAt || '',
      lastCandidatePickAt: runtime.lastCandidatePickAt || '',
      dwellExpired: evaluation.currentVideo?.dwellExpired || false,
      maxStayUntil: evaluation.currentVideo?.maxStayUntil || '',
    },
    inboxPressure: evaluation.inboxPressure,
    primaryAction: evaluation.primaryAction,
    suggestedCommands,
    execution: {
      metrics: evaluation.execution.metrics,
      topVideos: evaluation.execution.metrics.touchedVideos.slice(0, 10),
      topUsers: evaluation.execution.metrics.touchedUsers.slice(0, 20),
    },
  };
}

function buildCampaignNext(campaignOrId) {
  const status = buildCampaignStatus(campaignOrId);
  const campaignId = status.id;
  const productSlug = status.summary?.productSlug || '';
  const focus = status.focus || {};
  const blocked = status.statusSummary?.blockedReasons || [];
  const runtime = status.runtime || {};
  const nextSteps = [];

  if (status.primaryAction) {
    nextSteps.push({
      kind: status.primaryAction.kind,
      title: status.primaryAction.title,
      reason: status.primaryAction.reason || blocked.join('；'),
      command: status.primaryAction.command,
      notBefore: status.primaryAction.notBefore || '',
    });
  }

  if (!runtime.lastInboxCheckAt) {
    nextSteps.push({
      kind: 'mark-inbox',
      title: '标记本轮已做收件箱检查',
      command: `node scripts/bili.js campaign inbox-check --id "${campaignId}"`,
    });
  }

  const activeVideoId = String(focus.activeVideoId || '').trim();
  const currentVideoState = focus.currentVideoState || null;
  const primaryKind = String(status.primaryAction?.kind || '').trim();
  if (primaryKind === 'focus-video' && activeVideoId) {
    const hasRootComment = Number(currentVideoState?.rootComments || 0) > 0;
    if (!hasRootComment) {
      nextSteps.push({
        kind: 'root-comment-draft',
        title: '先给当前视频生成主评论草稿',
        reason: '当前视频还没有主评论，优先先发一条主评论建立公开存在感。',
        command: `node scripts/bili.js thread draft --id "${activeVideoId}" --product "${productSlug}" --channel comment --objective "video-root-comment"`,
      });
      nextSteps.push({
        kind: 'root-comment-send',
        title: '发送当前视频主评论',
        reason: '草稿确认后，用 campaign 入口正式发出主评论。',
        command: `node scripts/bili.js thread send --channel comment --campaign "${campaignId}" --id "${activeVideoId}" --product "${productSlug}" --content "<text>" --yes`,
      });
    }
    nextSteps.push({
      kind: 'discover-comments',
      title: '扫描当前视频评论区高意向评论',
      reason: '围绕当前聚焦视频继续挖掘可回复的评论线索。',
      command: `node scripts/bili.js thread discover-comments --id "${activeVideoId}" --product "${productSlug}" --limit 8`,
    });
  }

  return {
    campaignId,
    productSlug,
    phase: status.statusSummary?.phase || '',
    blockedReasons: blocked,
    notBefore: status.primaryAction?.notBefore || '',
    primaryAction: status.primaryAction || null,
    focus,
    nextSteps,
  };
}

function campaignActionKind({ channel, commentTarget }) {
  if (channel === 'dm') {
    return 'dm';
  }
  return commentTarget?.root ? 'commentReply' : 'rootComment';
}

function assertCampaignSendAllowed({ campaignId: id, channel, videoId = '', commentTarget = null, videoQuality = 'medium', targetMid = '', threadContext = null }) {
  const target = String(id || '').trim();
  if (!target) {
    return null;
  }

  const kind = campaignActionKind({ channel, commentTarget });
  const evaluation = buildCampaignEvaluation(target, {
    actionKind: kind,
    videoId,
    commentTarget,
    videoQuality,
    targetMid,
    threadContext,
  });
  const campaign = evaluation.campaign;
  const status = buildCampaignStatus(campaign);
  const remaining = status.budget?.remaining || {};
  const runtime = normalizeRuntime(campaign.runtime);
  const now = Date.now();
  const qualityTier = normalizeQualityTier(videoQuality);
  const perVideoBudget = getPerVideoBudget(status.plan, qualityTier);

  if (remaining.totalTouches <= 0) {
    throw new CliError(
      '当前 campaign 的总触达预算已经耗尽。',
      1,
      { campaignId: target, budget: status.budget },
      '先查看 `campaign status`，必要时新开一轮 campaign。'
    );
  }
  if (kind === 'rootComment' && remaining.rootComments <= 0) {
    throw new CliError(
      '当前 campaign 的主评论预算已经耗尽。',
      1,
      { campaignId: target, budget: status.budget },
      '暂停新增主评论，优先处理评论回复和私信。'
    );
  }
  if (kind === 'commentReply' && remaining.commentReplies <= 0) {
    throw new CliError(
      '当前 campaign 的评论回复预算已经耗尽。',
      1,
      { campaignId: target, budget: status.budget },
      '暂停新增评论回复，优先处理已有私信和回复。'
    );
  }
  if (kind === 'dm' && remaining.dms <= 0) {
    throw new CliError(
      '当前 campaign 的私信预算已经耗尽。',
      1,
      { campaignId: target, budget: status.budget },
      '暂停新增私信，优先等待已有用户回复。'
    );
  }

  if (channel === 'comment') {
    const targetVideo = String(videoId || '').trim();
    if (!targetVideo) {
      throw new CliError('comment 渠道接入 campaign 时必须提供明确的视频 id。');
    }
    const pacing = status.pacing || {};
    const minReplyGapSec = Number(pacing.commentReplyMinGapSec || 20);
    const hopMinSec = Number(pacing.betweenVideoHopSec?.min || 60);
    const activeVideoId = String(runtime.activeVideoId || '').trim();
    const lastVideoActionMs = parseTime(runtime.lastVideoActionAt);
    const currentVideoState = runtime.videos[targetVideo] || {
      rootComments: 0,
      commentReplies: 0,
    };

    if (!commentTarget?.root && Number(currentVideoState.rootComments || 0) >= 1) {
      throw new CliError(
        '当前 campaign 在这个视频下已经发过主评论，不建议重复发主评论。',
        1,
        {
          campaignId: target,
          videoId: targetVideo,
          videoState: currentVideoState,
        },
        '同一个视频优先继续评论区回复或私信跟进，不要重复刷主评论。'
      );
    }

    if (commentTarget?.root && perVideoBudget && Number(currentVideoState.commentReplies || 0) >= Number(perVideoBudget.maxCommentReplies || 0)) {
      throw new CliError(
        '当前 campaign 在这个视频下的评论回复预算已经达到当前质量档位上限。',
        1,
        {
          campaignId: target,
          videoId: targetVideo,
          videoQuality: qualityTier,
          videoState: currentVideoState,
          perVideoBudget,
        },
        '如果你确认这个视频评论区仍然值得继续停留，先提升 video-quality，再继续回复。'
      );
    }

    if (evaluation.currentVideo?.videoId === targetVideo && evaluation.currentVideo?.dwellExpired) {
      throw new CliError(
        '当前视频已经达到允许停留上限，不建议继续在这个视频下执行公开动作。',
        1,
        {
          campaignId: target,
          videoId: targetVideo,
          currentVideo: evaluation.currentVideo,
        },
        '优先切到下一个候选视频，或先处理 inbox 里的已有线索。'
      );
    }

    if (activeVideoId && activeVideoId === targetVideo && lastVideoActionMs && now - lastVideoActionMs < minReplyGapSec * 1000) {
      throw new CliError(
        '当前 campaign 在同一个视频里的公开互动间隔过短。',
        1,
        {
          campaignId: target,
          videoId: targetVideo,
          lastVideoActionAt: runtime.lastVideoActionAt,
          minReplyGapSec,
        },
        `建议至少等到 ${new Date(lastVideoActionMs + minReplyGapSec * 1000).toISOString()} 再继续在这个视频里回复。`
      );
    }

    if (activeVideoId && activeVideoId !== targetVideo && lastVideoActionMs && now - lastVideoActionMs < hopMinSec * 1000) {
      throw new CliError(
        '当前 campaign 还处在跨视频切换缓冲期。',
        1,
        {
          campaignId: target,
          fromVideoId: activeVideoId,
          toVideoId: targetVideo,
          lastVideoActionAt: runtime.lastVideoActionAt,
          hopMinSec,
        },
        `建议至少等到 ${new Date(lastVideoActionMs + hopMinSec * 1000).toISOString()} 再切到下一个视频。`
      );
    }
  }

  return {
    campaignId: target,
    campaign,
    status,
    qualityTier,
  };
}

function assertCampaignCandidatePickAllowed({ campaignId: id }) {
  const target = String(id || '').trim();
  if (!target) {
    return null;
  }
  const evaluation = buildCampaignEvaluation(target, {
    actionKind: 'pickCandidate',
  });
  return {
    campaignId: target,
    campaign: evaluation.campaign,
    primaryAction: evaluation.primaryAction,
    status: buildCampaignStatus(evaluation.campaign),
  };
}

function recordCampaignSend({ campaignId: id, channel, videoId = '', commentTarget = null, videoQuality = 'medium' }) {
  const target = String(id || '').trim();
  if (!target) {
    return null;
  }
  const campaign = readCampaign(target);
  if (!campaign) {
    return null;
  }
  const runtime = normalizeRuntime(campaign.runtime);
  const ts = nowIso();
  const targetVideo = String(videoId || '').trim();
  const qualityTier = normalizeQualityTier(videoQuality);
  if (channel === 'comment' && targetVideo) {
    const switchingVideo = runtime.activeVideoId && runtime.activeVideoId !== targetVideo;
    runtime.activeVideoId = targetVideo;
    runtime.activeVideoQuality = qualityTier;
    runtime.lastVideoActionAt = ts;
    runtime.lastVideoSwitchAt = switchingVideo ? ts : runtime.lastVideoSwitchAt || '';
    runtime.videos[targetVideo] = {
      firstSeenAt: runtime.videos[targetVideo]?.firstSeenAt || ts,
      lastSeenAt: ts,
      lastActionAt: ts,
      rootComments: Number(runtime.videos[targetVideo]?.rootComments || 0),
      commentReplies: Number(runtime.videos[targetVideo]?.commentReplies || 0),
      qualityTier,
      reason: runtime.videos[targetVideo]?.reason || runtime.activeVideoReason || '',
    };
    if (commentTarget?.root) {
      runtime.videos[targetVideo].commentReplies += 1;
    } else {
      runtime.videos[targetVideo].rootComments += 1;
    }
  }
  runtime.lastActionAt = ts;
  campaign.runtime = runtime;
  if (channel === 'dm') {
    campaign.phases = updatePhaseStatuses(campaign.phases, 'inbox_followup');
  } else if (channel === 'comment') {
    campaign.phases = updatePhaseStatuses(campaign.phases, 'engage_public');
  }
  writeCampaign(campaign);
  return runtime;
}

function markCampaignVideoFocus({ campaignId: id, videoId, videoQuality = 'medium', reason = '' }) {
  const target = String(id || '').trim();
  const bvid = String(videoId || '').trim();
  if (!target || !bvid) {
    throw new CliError('markCampaignVideoFocus 需要 campaignId 和 videoId。');
  }
  const campaign = readCampaign(target);
  if (!campaign) {
    throw new CliError(`未找到 campaign：${target}`);
  }
  const runtime = normalizeRuntime(campaign.runtime);
  const ts = nowIso();
  const qualityTier = normalizeQualityTier(videoQuality);
  runtime.activeVideoId = bvid;
  runtime.activeVideoQuality = qualityTier;
  runtime.activeVideoReason = String(reason || '').trim();
  runtime.lastCandidatePickAt = ts;
  runtime.videos[bvid] = {
    firstSeenAt: runtime.videos[bvid]?.firstSeenAt || ts,
    lastSeenAt: ts,
    lastActionAt: runtime.videos[bvid]?.lastActionAt || '',
    rootComments: Number(runtime.videos[bvid]?.rootComments || 0),
    commentReplies: Number(runtime.videos[bvid]?.commentReplies || 0),
    qualityTier,
    reason: runtime.activeVideoReason,
  };
  campaign.runtime = runtime;
  campaign.phases = updatePhaseStatuses(campaign.phases, 'pick_candidate');
  writeCampaign(campaign);
  return buildCampaignStatus(campaign);
}

function markCampaignInboxCheck({ campaignId: id }) {
  const target = String(id || '').trim();
  if (!target) {
    throw new CliError('markCampaignInboxCheck 需要 campaignId。');
  }
  const campaign = readCampaign(target);
  if (!campaign) {
    throw new CliError(`未找到 campaign：${target}`);
  }
  const runtime = normalizeRuntime(campaign.runtime);
  runtime.lastInboxCheckAt = nowIso();
  campaign.runtime = runtime;
  campaign.phases = updatePhaseStatuses(campaign.phases, 'inbox_followup');
  writeCampaign(campaign);
  return buildCampaignStatus(campaign);
}

function runCampaign({ productSlug, hours = 3, scheme = 'candidate-pool-v1' }) {
  const plan = buildCampaignPlan({ productSlug, hours, scheme });
  const id = campaignId(productSlug, scheme);
  const createdAt = nowIso();
  const payload = {
    id,
    status: 'prepared',
    createdAt,
    updatedAt: createdAt,
    plan,
    summary: {
      productSlug,
      scheme,
      hours: Number(hours),
    },
    phases: [
      { id: 'prepare', title: '准备', status: 'in_progress' },
      { id: 'pick_candidate', title: '选择候选视频', status: 'pending' },
      { id: 'engage_public', title: '公开互动', status: 'pending' },
      { id: 'inbox_followup', title: '回复跟进', status: 'pending' },
      { id: 'review', title: '总结复盘', status: 'pending' },
    ],
    nextSteps: [
      '先确认登录态和产品资料已经准备好。',
      '优先看 campaign status 里的剩余预算和下一步建议。',
      '严格按预算和间隔执行，不要自己扩大发送规模。',
      '先小范围验证话术，再继续循环。',
    ],
  };
  writeCampaign(payload);
  return buildCampaignStatus(payload);
}

function listCampaigns() {
  return readCampaignIndex().items || [];
}

function getCampaign(id) {
  return readCampaign(id);
}

module.exports = {
  CAMPAIGNS_DIR,
  buildCampaignPlan,
  buildCampaignNext,
  buildCampaignStatus,
  assertCampaignSendAllowed,
  assertCampaignCandidatePickAllowed,
  markCampaignInboxCheck,
  markCampaignVideoFocus,
  recordCampaignSend,
  runCampaign,
  listCampaigns,
  getCampaign,
};
