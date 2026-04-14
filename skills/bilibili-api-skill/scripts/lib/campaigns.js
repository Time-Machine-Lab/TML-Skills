'use strict';

const path = require('path');
const { DATA_DIR, ensureDir, writeJson, readJson } = require('./config');
const { CliError } = require('./errors');
const { summarizeProduct } = require('./products');
const { readRecentOperations, filterOperationsByCampaign, getPublicSendThrottleStatus } = require('./tracker');
const { readEngagementSettings } = require('./engagement');

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

function schemePreset(name) {
  const normalized = String(name || 'scheme1').trim().toLowerCase();
  if (normalized !== 'scheme1') {
    throw new CliError('当前只支持 scheme1。');
  }
  return {
    key: 'scheme1',
    title: '方案一-广撒网引流',
    description: '围绕单个产品按小步快跑的方式做公开评论、评论回复和私信跟进，优先保证节奏稳定和低重复。',
    cadence: {
      discoverVideoEverySec: 120,
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
      '不要机械地每 2 分钟都重新搜索；只有当前视频评论区质量差、已榨干或命中黑名单时，才换下一个视频。',
      '优先挑播放量、收藏量、互动密度都更高的视频；宁可少搜，也不要一直翻低质量长尾视频。',
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
    lastActionAt: '',
    lastVideoActionAt: '',
    lastVideoSwitchAt: '',
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
    lastDiscoveryAt: '',
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

function buildCampaignPlan({ productSlug, hours = 3, scheme = 'scheme1' }) {
  const product = summarizeProduct(productSlug);
  if (!product) {
    throw new CliError(`未找到产品资料：${productSlug}`);
  }
  const preset = schemePreset(scheme);
  const settings = readEngagementSettings();
  const durationHours = clamp(Number(hours || 3), 1, 72);
  const durationSec = durationHours * 3600;
  const budget = buildBudgetSummary({ preset, durationHours, settings });
  const discoverCycles = Math.max(Math.floor(durationSec / preset.cadence.discoverVideoEverySec), 1);
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
        '不要把搜索当主动作；先处理当前聚焦视频和 inbox，只有当前视频价值不高时才搜索下一个。',
        '优先挑播放量、收藏量、互动质量都更高的视频候选，不要在低播放视频上浪费动作预算。',
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
      discoveryEverySec: preset.cadence.discoverVideoEverySec,
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
      discoverCycles,
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
      discovery: [
        `node scripts/bili.js discovery videos --keyword "<product keyword>" --product "${product.slug}" --order click --days-within 30 --min-play 3000 --min-comments 3 --page-size 8 --pages 1`,
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
  const sinceMs = Date.parse(String(campaign.createdAt || '')) || 0;
  const recent = readRecentOperations(2000).filter((item) => {
    const ts = Date.parse(String(item.ts || '')) || 0;
    return ts >= sinceMs && item.status === 'ok';
  });
  const campaignSpecific = filterOperationsByCampaign(recent, campaign.id);
  return campaignSpecific.length ? campaignSpecific : recent;
}

function summarizeExecution(campaign) {
  const operations = campaignWindowOperations(campaign);
  const commentOps = operations.filter((item) => item.command?.resource === 'comment' && item.command?.action === 'send');
  const threadCommentOps = operations.filter((item) => item.command?.resource === 'thread' && item.command?.action === 'send' && item.payload?.data?.channel === 'comment');
  const publicOps = [...commentOps, ...threadCommentOps];
  const dmOps = operations.filter((item) => {
    const resource = item.command?.resource;
    const action = item.command?.action;
    if (resource === 'dm' && (action === 'send' || action === 'send-image')) {
      return true;
    }
    return resource === 'thread' && action === 'send' && item.payload?.data?.channel === 'dm';
  });

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

  return {
    operations,
    metrics: {
      publicComments: rootComments,
      publicReplies: commentReplies,
      dms: dmOps.length,
      totalTouches: rootComments + commentReplies + dmOps.length,
      touchedVideos: buildTouchedVideos(publicOps),
      touchedUsers: buildTouchedUsers(dmOps),
      recentOperationCount: operations.length,
    },
  };
}

function inferPhase(campaign, metrics) {
  if (!metrics.totalTouches) {
    return 'prepare';
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
    const preset = schemePreset(campaign.summary?.scheme || 'scheme1');
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
      rootComments: metrics.publicComments,
      commentReplies: metrics.publicReplies,
      dms: metrics.dms,
      totalTouches: metrics.totalTouches,
    },
    remaining: {
      rootComments: Math.max(Number(total.rootComments || 0) - metrics.publicComments, 0),
      commentReplies: Math.max(Number(total.commentReplies || 0) - metrics.publicReplies, 0),
      dms: Math.max(Number(total.dms || 0) - metrics.dms, 0),
      totalTouches: Math.max(Number(total.totalTouches || 0) - metrics.totalTouches, 0),
    },
  };
}

function buildCampaignStatus(campaignOrId) {
  const campaign = typeof campaignOrId === 'string' ? readCampaign(campaignOrId) : campaignOrId;
  if (!campaign) {
    throw new CliError('未找到 campaign。');
  }
  const settings = readEngagementSettings();
  const execution = summarizeExecution(campaign);
  const budget = summarizeBudgetState(campaign, execution.metrics);
  const publicThrottle = getPublicSendThrottleStatus(settings);
  const phase = inferPhase(campaign, execution.metrics);
  const startMs = Date.parse(String(campaign.createdAt || '')) || Date.now();
  const durationMs = Number(campaign.plan?.duration?.seconds || 0) * 1000;
  const endMs = durationMs ? startMs + durationMs : 0;
  const now = Date.now();
  const remainingRuntimeMs = endMs ? Math.max(endMs - now, 0) : 0;

  const blockedReasons = [];
  if (publicThrottle.blocked) {
    blockedReasons.push(`公开动作节流：${publicThrottle.reason || 'throttled'}`);
  }
  if (budget.remaining.totalTouches <= 0) {
    blockedReasons.push('任务预算已耗尽');
  }

  const nextAction = blockedReasons.length
    ? '暂停新增公开动作，优先 inbox、thread continue 和复盘。'
    : phase === 'prepare'
      ? '先确认产品资料、登录态和 watcher 已就绪，再开始第一轮探索。'
      : phase === 'engage_public'
        ? '当前已有公开动作，先看当前视频评论区和 inbox，不要急着继续搜索新视频。'
        : phase === 'engage_dm'
          ? '当前已进入私信阶段，优先继续已有会话，不要继续扩大触达面。'
          : '优先继续 watch 和 inbox，等待新的用户反馈。';

  const runtime = normalizeRuntime(campaign.runtime);
  const currentVideoState = runtime.activeVideoId ? runtime.videos?.[runtime.activeVideoId] || null : null;

  return {
    ...campaign,
    statusSummary: {
      phase,
      remainingRuntimeSec: Math.floor(remainingRuntimeMs / 1000),
      publicThrottle,
      blockedReasons,
      nextAction,
    },
    budget,
    pacing: campaign.plan?.pacing || {},
    runtime,
    focus: {
      activeVideoId: runtime.activeVideoId || '',
      activeVideoQuality: runtime.activeVideoQuality || '',
      activeVideoReason: runtime.activeVideoReason || '',
      currentVideoState,
      lastInboxCheckAt: runtime.lastInboxCheckAt || '',
      lastDiscoveryAt: runtime.lastDiscoveryAt || '',
    },
    suggestedCommands: blockedReasons.length
      ? [
          `node scripts/bili.js campaign status --id "${campaign.id}"`,
          'node scripts/bili.js inbox list --product "<slug>"',
          'node scripts/bili.js thread continue --mid <mid> --product "<slug>"',
        ]
      : [
          `node scripts/bili.js campaign status --id "${campaign.id}"`,
          runtime.activeVideoId
            ? `node scripts/bili.js discovery comments --id "${runtime.activeVideoId}" --product "${campaign.summary?.productSlug || ''}" --pages 1 --size 20`
            : `node scripts/bili.js discovery videos --keyword "<product keyword>" --product "${campaign.summary?.productSlug || ''}" --order click --days-within 30 --min-play 3000 --min-comments 3 --page-size 8 --pages 1`,
          `node scripts/bili.js inbox list --product "${campaign.summary?.productSlug || ''}"`,
        ],
    execution: {
      metrics: execution.metrics,
      topVideos: execution.metrics.touchedVideos.slice(0, 10),
      topUsers: execution.metrics.touchedUsers.slice(0, 20),
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

  if (blocked.length) {
    nextSteps.push({
      kind: 'cooldown',
      title: '先暂停新增公开动作',
      reason: blocked.join('；'),
      command: `node scripts/bili.js inbox list --product "${productSlug}" --campaign "${campaignId}"`,
    });
    nextSteps.push({
      kind: 'status',
      title: '查看当前 campaign 状态',
      command: `node scripts/bili.js campaign status --id "${campaignId}"`,
    });
  } else if (focus.activeVideoId) {
    nextSteps.push({
      kind: 'focus-video',
      title: '继续处理当前聚焦视频',
      reason: focus.activeVideoReason || '当前视频仍在停留期内',
      command: `node scripts/bili.js discovery comments --id "${focus.activeVideoId}" --product "${productSlug}" --campaign "${campaignId}" --video-quality ${focus.activeVideoQuality || 'medium'} --pages 1 --size 20`,
    });
    nextSteps.push({
      kind: 'inbox',
      title: '检查是否有新回复需要优先处理',
      command: `node scripts/bili.js inbox list --product "${productSlug}" --campaign "${campaignId}"`,
    });
  } else {
    nextSteps.push({
      kind: 'discover-video',
      title: '先找下一个候选视频',
      command: `node scripts/bili.js discovery videos --keyword "<product keyword>" --product "${productSlug}" --campaign "${campaignId}" --order click --days-within 30 --min-play 3000 --min-comments 3 --page-size 8 --pages 1`,
    });
    nextSteps.push({
      kind: 'inbox',
      title: '同时检查当前是否有新消息',
      command: `node scripts/bili.js inbox list --product "${productSlug}" --campaign "${campaignId}"`,
    });
  }

  if (!runtime.lastInboxCheckAt) {
    nextSteps.push({
      kind: 'mark-inbox',
      title: '标记本轮已做收件箱检查',
      command: `node scripts/bili.js campaign inbox-check --id "${campaignId}"`,
    });
  }

  return {
    campaignId,
    productSlug,
    phase: status.statusSummary?.phase || '',
    blockedReasons: blocked,
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

function assertCampaignSendAllowed({ campaignId: id, channel, videoId = '', commentTarget = null, videoQuality = 'medium' }) {
  const target = String(id || '').trim();
  if (!target) {
    return null;
  }
  const campaign = readCampaign(target);
  if (!campaign) {
    throw new CliError(`未找到 campaign：${target}`);
  }
  const status = buildCampaignStatus(campaign);
  const kind = campaignActionKind({ channel, commentTarget });
  const remaining = status.budget?.remaining || {};
  const runtime = normalizeRuntime(campaign.runtime);
  const now = Date.now();
  const qualityTier = normalizeQualityTier(videoQuality);
  const perVideoBudget = status.plan?.budgets?.perVideoQualityBudget?.[qualityTier] || status.plan?.budgets?.perVideoQualityBudget?.medium || null;

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
    if (switchingVideo) {
      runtime.lastVideoSwitchAt = ts;
    }
    runtime.activeVideoId = targetVideo;
    runtime.activeVideoQuality = qualityTier;
    runtime.lastVideoActionAt = ts;
    runtime.videos[targetVideo] = {
      firstSeenAt: runtime.videos[targetVideo]?.firstSeenAt || ts,
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
  runtime.lastDiscoveryAt = ts;
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
  campaign.phases = updatePhaseStatuses(campaign.phases, 'discover');
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

function assertCampaignDiscoveryAllowed({ campaignId: id, forceNextVideo = false }) {
  const target = String(id || '').trim();
  if (!target) {
    return null;
  }
  const campaign = readCampaign(target);
  if (!campaign) {
    throw new CliError(`未找到 campaign：${target}`);
  }
  const runtime = normalizeRuntime(campaign.runtime);
  const activeVideoId = String(runtime.activeVideoId || '').trim();
  if (!activeVideoId || forceNextVideo) {
    return buildCampaignStatus(campaign);
  }
  const currentVideoState = runtime.videos?.[activeVideoId] || {};
  throw new CliError(
    '当前 campaign 已经有一个活跃视频，默认不继续搜索新视频。',
    1,
    {
      campaignId: target,
      activeVideoId,
      currentVideoState,
      lastVideoActionAt: runtime.lastVideoActionAt || '',
      activeVideoReason: runtime.activeVideoReason || '',
    },
    `先继续处理当前视频 ${activeVideoId}，只有确认这个视频评论区质量不高、已处理完，或要主动放弃时，才重新搜索；如确需切换，可追加 \`--force-next-video true\`。`
  );
}

function runCampaign({ productSlug, hours = 3, scheme = 'scheme1' }) {
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
      { id: 'discover', title: '找视频', status: 'pending' },
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
  markCampaignInboxCheck,
  assertCampaignDiscoveryAllowed,
  markCampaignVideoFocus,
  recordCampaignSend,
  runCampaign,
  listCampaigns,
  getCampaign,
};
