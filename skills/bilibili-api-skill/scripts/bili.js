'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { parseArgs, toBoolean, toInt } = require('./lib/args');
const { updateCredentials, readCredentials, CREDENTIALS_PATH, SKILL_ROOT_DIR, RUNTIME_ROOT_DIR, PRODUCTS_DIR, DATA_DIR, VIDEO_POOLS_DIR, SESSION_PATH, SECRETS_PATH, SETTINGS_PATH, RUNTIME_CONFIG_PATH } = require('./lib/config');
const { ok, fail } = require('./lib/output');
const { CliError } = require('./lib/errors');
const { BilibiliClient } = require('./lib/client');
const { generateQrCode, pollQrCode, hydrateSession, checkCookieRefresh, refreshCookie } = require('./lib/auth');
const { readSession, readSecrets } = require('./lib/store');
const { buildSessionSummary } = require('./lib/session');
const { setCommandContext } = require('./lib/runtime-context');
const { OPERATIONS_LOG_PATH, listConversations, getConversationByMid, getPublicSendThrottleStatus } = require('./lib/tracker');
const { ensureProductsDir, listProducts, getProduct, initProduct, setupProduct, buildProductDoctor, summarizeProduct } = require('./lib/products');
const { buildSetupStatus, buildOnboardText, buildWorkflow } = require('./lib/doctor');
const { buildInboxOverview, buildInboxUnreadSummary, buildReplyNotificationFeed, buildDmSessionFeed, buildThreadContinuation } = require('./lib/orchestrator');
const { readEngagementSettings, patchEngagementSettings, normalizeMode, assessSendRisk, resolveConfirmationPolicy, buildThreadDraft, buildPostActionGuidance } = require('./lib/engagement');
const { WATCH_STATE_PATH, WATCH_EVENTS_LOG_PATH, WATCH_LOCK_PATH, readWatchState, readWatchLock, resetWatchState, readEventLog, primeWatchState, watchOnce, watchRun } = require('./lib/watch');
const { summarizeSchedule, getThreadSendStatus, rebalanceAllConversations } = require('./lib/scheduler');
const { buildCommentThreadContext, buildVideoCommentDiscovery } = require('./lib/comment-threads');
const { initSkill, getInitStatus } = require('./lib/init');
const { buildCampaignPlan, buildCampaignNext, buildCampaignStatus, assertCampaignSendAllowed, assertCampaignCandidatePickAllowed, markCampaignInboxCheck, markCampaignVideoFocus, recordCampaignSend, runCampaign, listCampaigns, getCampaign } = require('./lib/campaigns');
const { buildVideoPoolSummary, saveVideoPool, getVideoPool, listVideoPools, deriveProductKeywords, buildPoolFromCollection, reserveNextCandidate, finalizeCandidateConsumption, updateCandidateStatus } = require('./lib/video-pools');
const fs = require('fs');

function getClient(options) {
  return new BilibiliClient({
    cookie: options.cookie,
    userAgent: options['user-agent'],
  });
}

function requireOption(options, key, message) {
  if (options[key] == null || options[key] === '') {
    throw new CliError(message || `缺少参数 --${key}`);
  }
  return options[key];
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadBilibiliMcpLite() {
  const moduleUrl = pathToFileURL(path.join(SKILL_ROOT_DIR, 'scripts', 'bilibili-mcp-lite.mjs')).href;
  return import(moduleUrl);
}

function inferCandidateQuality(score) {
  const value = Number(score || 0);
  if (value >= 80) {
    return 'high';
  }
  if (value >= 55) {
    return 'medium';
  }
  return 'low';
}

function assertPublicCommentThrottle(options, settings) {
  const status = getPublicSendThrottleStatus(settings);
  if (!status.blocked) {
    return;
  }
  let hint = '建议先停一下，等公开触达节奏降下来之后再继续。';
  if (status.reason === 'public_min_gap') {
    hint = `上一条公开评论/回复刚发出不久，建议至少等到 ${status.nextAllowedAt || '冷却结束'} 再继续。`;
  } else if (status.reason === 'public_comment_hourly_cap') {
    hint = `当前 1 小时内主评论已达到上限（${status.commentCountPerHour}/${status.limits.publicCommentMaxPerHour}），建议暂停公开评论，先观察后续互动。`;
  } else if (status.reason === 'public_reply_hourly_cap') {
    hint = `当前 1 小时内评论回复已达到上限（${status.replyCountPerHour}/${status.limits.publicReplyMaxPerHour}），建议暂停公开回复，先观察后续互动。`;
  }
  throw new CliError(
    '当前未绑定 campaign 的公开评论/回复触达频次过高，已被全局公开护栏拦截。',
    1,
    status,
    `${hint} 如果这是候选池引流 campaign 里的公开动作，请确认发送命令带了 \`--campaign <campaign_id>\`。`
  );
}

function assertNonCampaignCommentAllowed({ options, productSlug, commentTarget = null }) {
  if (options.campaign) {
    return;
  }
  if (!productSlug) {
    throw new CliError(
      '未绑定 campaign 的公开发送必须提供产品上下文。',
      1,
      {
        channel: 'comment',
      },
      '请补上 `--product <slug>`；如果这是推广任务里的主评论，请改走 `campaign next` -> `thread send --channel comment --campaign "<campaign_id>" ...`。'
    );
  }
  if (!commentTarget?.root) {
    throw new CliError(
      '未绑定 campaign 时，不允许直接发送视频主评论。',
      1,
      {
        channel: 'comment',
        productSlug,
      },
      '视频主评论必须挂在 campaign 下执行；请先用 `campaign run` / `campaign next` 获取当前应处理的视频，再走 `thread send --channel comment --campaign "<campaign_id>" ...`。'
    );
  }
}

function printHelp() {
  process.stdout.write(`Usage:
  # High-level workflow
  node scripts/bili.js system onboard
  node scripts/bili.js system workflow [--goal setup|monitor|reply|promote|stable]
  node scripts/bili.js inbox unread [--product <slug>] [--limit 5]
  node scripts/bili.js inbox list [--limit 20] [--product <slug>]
  node scripts/bili.js inbox replies [--limit 20] [--product <slug>] [--mid <mid>]
  node scripts/bili.js inbox dm-sessions [--limit 20] [--product <slug>] [--mid <mid>]
  node scripts/bili.js thread continue --mid <mid> [--product <slug>] [--history-size 20]
  node scripts/bili.js thread draft [--mid <mid>] [--product <slug>] [--channel dm|comment]
  node scripts/bili.js thread discover-comments --id <BV|AV|URL> [--product <slug>] [--page 1] [--size 20] [--search-pages 2] [--limit 20]
  node scripts/bili.js thread send --channel dm|comment [--content "<text>"] [--image </abs/path/to/image.png>] [--mid <mid>] [--product <slug>] [--campaign <campaign_id>] [--video-quality low|medium|high] [--yes] [--ignore-cooldown true]

  # Setup and runtime
  node scripts/bili.js init status
  node scripts/bili.js init start [--runtime-root </abs/path>] [--reset true]
  node scripts/bili.js config set-cookie --cookie "<cookie>"
  node scripts/bili.js config show
  node scripts/bili.js auth qr-generate
  node scripts/bili.js auth qr-poll [--key <qrcode_key>]
  node scripts/bili.js auth refresh-check
  node scripts/bili.js auth refresh
  node scripts/bili.js system paths
  node scripts/bili.js system doctor
  node scripts/bili.js system onboard
  node scripts/bili.js system workflow [--goal setup|monitor|reply|promote|stable]
  node scripts/bili.js system settings
  node scripts/bili.js system set-mode --mode confirm|semi-auto|auto
  node scripts/bili.js system set-public-throttle [--comment-gap-sec 180] [--comment-max-per-hour 20] [--reply-max-per-hour 100]
  node scripts/bili.js system set-post-action-pauses [--video-comment-sec 90] [--comment-reply-sec 20] [--dm-sec 20]

  # Monitoring
  node scripts/bili.js watch state [--limit 20]
  node scripts/bili.js watch prime
  node scripts/bili.js watch once [--history-size 20]
  node scripts/bili.js watch run [--interval-sec 90] [--iterations 10] [--history-size 20]
  node scripts/bili.js watch reset

  # Product context
  node scripts/bili.js product list
  node scripts/bili.js product get --slug <slug>
  node scripts/bili.js product doctor [--slug <slug>]
  node scripts/bili.js product summarize --slug <slug>
  node scripts/bili.js product init --title "<product title>" [--slug <slug>]
  node scripts/bili.js product setup --title "<product title>" [--slug <slug>] [--intro "<介绍>"] [--audience "a,b"] [--selling-points "a,b"] [--group-number "<群号>"] [--group-link "<链接>"] [--qq-number "<QQ号>"] [--qr-image </abs/path/to/img>] [--product-images </a.png,/b.png>]
  node scripts/bili.js campaign plan --product <slug> [--hours 3] [--scheme candidate-pool-v1]
  node scripts/bili.js campaign run --product <slug> [--hours 3] [--scheme candidate-pool-v1]
  node scripts/bili.js campaign status --id <campaign_id>
  node scripts/bili.js campaign next --id <campaign_id>
  node scripts/bili.js campaign focus --id <campaign_id> --video <BV|AV|URL> [--video-quality low|medium|high] [--reason "<why stay>"]
  node scripts/bili.js campaign inbox-check --id <campaign_id>
  node scripts/bili.js campaign list
  node scripts/bili.js campaign get --id <campaign_id>

  # Candidate video pools
  node scripts/bili.js candidate collect [--product <slug>] [--keywords "词1,词2"] [--pages-per-keyword 2] [--page-size 20] [--target-count 30] [--max-age-days 90] [--manual-bvids "BV1...,BV2..."]
  node scripts/bili.js candidate list [--product <slug>]
  node scripts/bili.js candidate get --id <pool_id>
  node scripts/bili.js candidate next [--product <slug>] [--id <pool_id>] [--campaign <campaign_id>] [--video-quality low|medium|high]
  node scripts/bili.js candidate update-status --id <pool_id> --bvid <BV> --status new|approved|reserved|consumed|blacklisted [--reason "<why>"] [--campaign <campaign_id>]

  # Session and trace
  node scripts/bili.js session show
  node scripts/bili.js session hydrate [--cookie "..."]
  node scripts/bili.js session refresh-check
  node scripts/bili.js session refresh
  node scripts/bili.js trace recent [--limit 20]

  # Follow-up loop
  node scripts/bili.js thread list
  node scripts/bili.js thread get --mid <mid>
  node scripts/bili.js thread continue --mid <mid> [--product <slug>] [--history-size 20]
  node scripts/bili.js thread draft [--mid <mid>] [--inbound-text "<text>"] [--id <BV|AV|URL> --root <rpid>] [--product <slug>] [--channel dm|comment] [--objective "<goal>"]
  node scripts/bili.js thread discover-comments --id <BV|AV|URL> [--product <slug>] [--page 1] [--size 20] [--search-pages 2] [--limit 20] [--sort 1] [--nohot 0]
  node scripts/bili.js thread send --channel dm|comment [--content "<text>"] [--image </abs/path/to/image.png>] [--mid <mid>] [--product <slug>] [--campaign <campaign_id>] [--id <BV|AV|URL>] [--oid <aid>] [--root <rpid>] [--parent <rpid>] [--video-quality low|medium|high] [--mode confirm|semi-auto|auto] [--yes] [--ignore-cooldown true]
`);
}

async function handleConfig(action, options) {
  if (action === 'set-cookie') {
    const cookie = requireOption(options, 'cookie', '请通过 --cookie 提供完整的 Bilibili Cookie');
    const next = updateCredentials({ cookie });
    return ok({
      saved: true,
      path: CREDENTIALS_PATH,
      hasCookie: Boolean(next.cookie),
    });
  }

  if (action === 'show') {
    const credentials = readCredentials();
    return ok({
      path: CREDENTIALS_PATH,
      hasCookie: Boolean(credentials.cookie),
      userAgent: credentials.userAgent,
    });
  }

  throw new CliError(`不支持的 config action: ${action}`);
}

async function handleInit(action, options) {
  if (action === 'status') {
    return ok(getInitStatus());
  }
  if (action === 'start') {
    return ok(
      initSkill({
        runtimeRoot: options['runtime-root'] || '',
        reset: toBoolean(options.reset, false),
      })
    );
  }
  throw new CliError(`不支持的 init action: ${action}`);
}

async function handleSystem(action, options) {
  if (action === 'paths') {
    ensureProductsDir();
    return ok({
      skillRoot: SKILL_ROOT_DIR,
      runtimeConfigPath: RUNTIME_CONFIG_PATH,
      runtimeRoot: RUNTIME_ROOT_DIR,
      productsDir: PRODUCTS_DIR,
      videoPoolsDir: VIDEO_POOLS_DIR,
      dataDir: DATA_DIR,
      secretsPath: SECRETS_PATH,
      sessionPath: SESSION_PATH,
      settingsPath: SETTINGS_PATH,
      operationsLogPath: OPERATIONS_LOG_PATH,
    });
  }
  if (action === 'doctor') {
    return ok(buildSetupStatus());
  }
  if (action === 'onboard') {
    return ok(buildOnboardText());
  }
  if (action === 'workflow') {
    return ok(buildWorkflow(options.goal || 'default'));
  }
  if (action === 'settings') {
    return ok({
      path: SETTINGS_PATH,
      settings: readEngagementSettings(),
    });
  }
  if (action === 'set-mode') {
    const mode = normalizeMode(requireOption(options, 'mode'));
    return ok({
      path: SETTINGS_PATH,
      settings: patchEngagementSettings({ sendMode: mode }),
    });
  }
  if (action === 'set-public-throttle') {
    const patch = {};
    if (options['comment-gap-sec'] != null) {
      patch.publicCommentMinGapSec = Math.max(toInt(options['comment-gap-sec'], 180), 60);
    }
    if (options['comment-max-per-hour'] != null) {
      patch.publicCommentMaxPerHour = Math.max(toInt(options['comment-max-per-hour'], 20), 1);
    }
    if (options['reply-max-per-hour'] != null) {
      patch.publicReplyMaxPerHour = Math.max(toInt(options['reply-max-per-hour'], 100), 1);
    }
    return ok({
      path: SETTINGS_PATH,
      settings: patchEngagementSettings(patch),
    });
  }
  if (action === 'set-post-action-pauses') {
    const patch = {};
    if (options['video-comment-sec'] != null) {
      patch.postVideoCommentPauseSec = Math.max(toInt(options['video-comment-sec'], 90), 5);
    }
    if (options['comment-reply-sec'] != null) {
      patch.postCommentReplyPauseSec = Math.max(toInt(options['comment-reply-sec'], 20), 5);
    }
    if (options['dm-sec'] != null) {
      patch.postDmPauseSec = Math.max(toInt(options['dm-sec'], 20), 5);
    }
    return ok({
      path: SETTINGS_PATH,
      settings: patchEngagementSettings(patch),
    });
  }
  throw new CliError(`不支持的 system action: ${action}`);
}

async function handleProduct(action, options) {
  if (action === 'list') {
    return ok(listProducts());
  }
  if (action === 'get') {
    return ok(getProduct(requireOption(options, 'slug')));
  }
  if (action === 'doctor') {
    return ok(buildProductDoctor(options.slug || ''));
  }
  if (action === 'summarize') {
    return ok(summarizeProduct(requireOption(options, 'slug')));
  }
  if (action === 'init') {
    return ok(initProduct({ slug: options.slug, title: requireOption(options, 'title') }));
  }
  if (action === 'setup') {
    return ok(
      setupProduct({
        slug: options.slug,
        title: requireOption(options, 'title'),
        intro: options.intro || '',
        audience: options.audience || '',
        sellingPoints: options['selling-points'] || '',
        groupNumber: options['group-number'] || '',
        groupLink: options['group-link'] || '',
        qqNumber: options['qq-number'] || '',
        qrImagePath: options['qr-image'] || '',
        productImages: options['product-images'] || '',
      })
    );
  }
  throw new CliError(`不支持的 product action: ${action}`);
}

async function handleCampaign(action, options) {
  if (action === 'list') {
    return ok(listCampaigns());
  }
  if (action === 'status') {
    return ok(buildCampaignStatus(requireOption(options, 'id', '请通过 --id 指定 campaign id')));
  }
  if (action === 'next') {
    return ok(buildCampaignNext(requireOption(options, 'id', '请通过 --id 指定 campaign id')));
  }
  if (action === 'focus') {
    return ok(
      markCampaignVideoFocus({
        campaignId: requireOption(options, 'id', '请通过 --id 指定 campaign id'),
        videoId: requireOption(options, 'video', '请通过 --video 指定当前聚焦的视频'),
        videoQuality: options['video-quality'] || 'medium',
        reason: options.reason || '',
      })
    );
  }
  if (action === 'inbox-check') {
    return ok(
      markCampaignInboxCheck({
        campaignId: requireOption(options, 'id', '请通过 --id 指定 campaign id'),
      })
    );
  }
  if (action === 'get') {
    return ok(getCampaign(requireOption(options, 'id', '请通过 --id 指定 campaign id')));
  }
  const productSlug = requireOption(options, 'product', '请通过 --product 指定产品 slug');
  const hours = toInt(options.hours, 3);
  const scheme = options.scheme || 'candidate-pool-v1';
  if (action === 'plan') {
    return ok(buildCampaignPlan({ productSlug, hours, scheme }));
  }
  if (action === 'run') {
    return ok(runCampaign({ productSlug, hours, scheme }));
  }
  throw new CliError(`不支持的 campaign action: ${action}`);
}

async function handleCandidate(action, options) {
  if (action === 'collect') {
    const productSlug = options.product || '';
    const product = productSlug ? getProduct(productSlug) : null;
    if (productSlug && !product) {
      throw new CliError(`未找到产品资料：${productSlug}`);
    }
    const explicitKeywords = splitList(options.keywords || '');
    const manualBvids = splitList(options['manual-bvids'] || '');
    const keywords = product ? deriveProductKeywords(product, explicitKeywords) : explicitKeywords;
    if (!keywords.length && !manualBvids.length) {
      throw new CliError('请至少提供 --product 或 --keywords / --manual-bvids。');
    }
    const collector = await loadBilibiliMcpLite();
    const collection = await collector.collectVideoPool({
      keywords,
      pagesPerKeyword: toInt(options['pages-per-keyword'], 2),
      pageSize: toInt(options['page-size'], 20),
      targetCount: toInt(options['target-count'], 30),
      maxAgeDays: toInt(options['max-age-days'], 90),
      minIntervalSec: toInt(options['min-interval-sec'], 5),
      maxIntervalSec: toInt(options['max-interval-sec'], 10),
      keywordPauseMinSec: toInt(options['keyword-pause-min-sec'], 8),
      keywordPauseMaxSec: toInt(options['keyword-pause-max-sec'], 15),
      manualBvids,
    });
    const saved = saveVideoPool(
      buildPoolFromCollection({
        product,
        keywords,
        collection,
        params: {
          productSlug,
          explicitKeywords,
          manualBvids,
          pagesPerKeyword: toInt(options['pages-per-keyword'], 2),
          pageSize: toInt(options['page-size'], 20),
          targetCount: toInt(options['target-count'], 30),
          maxAgeDays: toInt(options['max-age-days'], 90),
        },
      })
    );
    return ok({
      pool: buildVideoPoolSummary(saved),
      keywords,
      warnings: collection.warnings || [],
      byKeyword: collection.byKeyword || [],
      itemsPreview: (saved.items || []).slice(0, 10),
    });
  }
  if (action === 'list') {
    return ok({
      productSlug: options.product || '',
      items: listVideoPools({ productSlug: options.product || '' }),
    });
  }
  if (action === 'get') {
    const pool = getVideoPool(requireOption(options, 'id', '请通过 --id 提供候选池 id'));
    if (!pool) {
      throw new CliError(`未找到候选池：${options.id}`);
    }
    return ok(pool);
  }
  if (action === 'next') {
    let excludeBvid = '';
    if (options.campaign) {
      assertCampaignCandidatePickAllowed({
        campaignId: options.campaign,
      });
      const campaignStatus = buildCampaignStatus(options.campaign);
      excludeBvid = String(campaignStatus.focus?.activeVideoId || '').trim();
    }
    const result = reserveNextCandidate({
      productSlug: options.product || '',
      poolId: options.id || '',
      campaignId: options.campaign || '',
      excludeBvid,
    });
    let focus = null;
    if (options.campaign) {
      const quality = options['video-quality'] || inferCandidateQuality(result.candidate.mergedScore);
      focus = markCampaignVideoFocus({
        campaignId: options.campaign,
        videoId: result.candidate.bvid,
        videoQuality: quality,
        reason: `候选池 ${result.pool.id}，分数 ${result.candidate.mergedScore}，关键词 ${result.candidate.sourceKeywords.slice(0, 3).join(' / ')}`,
      }).focus;
    }
    return ok({
      ...result,
      focus,
    });
  }
  if (action === 'update-status') {
    return ok(
      updateCandidateStatus({
        poolId: requireOption(options, 'id', '请通过 --id 提供候选池 id'),
        bvid: requireOption(options, 'bvid', '请通过 --bvid 提供视频 BV 号'),
        status: requireOption(options, 'status', '请通过 --status 提供 new|approved|reserved|consumed|blacklisted'),
        reason: options.reason || '',
        campaignId: options.campaign || '',
      })
    );
  }
  throw new CliError(`不支持的 candidate action: ${action}`);
}

async function handleAuth(action, options) {
  const credentials = readCredentials();
  const userAgent = options['user-agent'] || credentials.userAgent;
  if (action === 'qr-generate') {
    return ok(await generateQrCode({ userAgent }));
  }
  if (action === 'qr-poll') {
    return ok(await pollQrCode({ qrcodeKey: options.key, userAgent }));
  }
  if (action === 'refresh-check') {
    const session = readSession();
    return ok(await checkCookieRefresh({ cookie: options.cookie || credentials.cookie || session.cookie, userAgent }));
  }
  if (action === 'refresh') {
    const session = readSession();
    return ok(
      await refreshCookie({
        cookie: options.cookie || credentials.cookie || session.cookie,
        refreshToken: options['refresh-token'] || session.refreshToken || '',
        userAgent,
      })
    );
  }
  throw new CliError(`不支持的 auth action: ${action}`);
}

async function handleSession(action, options) {
  const credentials = readCredentials();
  const session = readSession();
  if (action === 'show') {
    return ok({
      summary: buildSessionSummary(session),
      hasSecrets: Boolean(readSecrets().cookie || readSecrets().refreshToken),
    });
  }
  if (action === 'hydrate') {
    return ok(
      await hydrateSession({
        cookie: options.cookie || credentials.cookie || session.cookie,
        refreshToken: options['refresh-token'] || session.refreshToken || '',
        userAgent: options['user-agent'] || credentials.userAgent,
        qrcodeKey: options.key || session.qrcodeKey || '',
        loginUrl: session.loginUrl || '',
      })
    );
  }
  if (action === 'refresh-check') {
    return ok(await checkCookieRefresh({ cookie: options.cookie || credentials.cookie || session.cookie, userAgent: options['user-agent'] || credentials.userAgent }));
  }
  if (action === 'refresh') {
    return ok(
      await refreshCookie({
        cookie: options.cookie || credentials.cookie || session.cookie,
        refreshToken: options['refresh-token'] || session.refreshToken || '',
        userAgent: options['user-agent'] || credentials.userAgent,
      })
    );
  }
  throw new CliError(`不支持的 session action: ${action}`);
}

async function handleTrace(action, options) {
  if (action !== 'recent') {
    throw new CliError(`不支持的 trace action: ${action}`);
  }
  const limit = toInt(options.limit, 20);
  let lines = [];
  try {
    lines = fs.readFileSync(OPERATIONS_LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    lines = [];
  }
  return ok(lines.slice(-limit).map((line) => JSON.parse(line)));
}

async function handleInbox(action, options) {
  const campaignId = options.campaign || '';
  const shared = {
    client: getClient(options),
    productSlug: options.product || '',
    limit: toInt(options.limit, action === 'unread' ? 5 : 20),
  };
  if (action === 'unread') {
    const data = await buildInboxUnreadSummary({
      ...shared,
      campaignId,
    });
    if (campaignId) {
      markCampaignInboxCheck({ campaignId });
      data.campaign = {
        ...(data.campaign || {}),
        id: campaignId,
        inboxCheckMarked: true,
      };
    }
    return ok(data);
  }
  if (action === 'replies') {
    return ok(
      await buildReplyNotificationFeed({
        ...shared,
        mid: options.mid || '',
      })
    );
  }
  if (action === 'dm-sessions') {
    return ok(
      await buildDmSessionFeed({
        ...shared,
        mid: options.mid || '',
      })
    );
  }
  if (action === 'list') {
    const data = await buildInboxOverview({
      ...shared,
      campaignId,
    });
    if (campaignId) {
      markCampaignInboxCheck({ campaignId });
      data.campaign = {
        ...(data.campaign || {}),
        id: campaignId,
        inboxCheckMarked: true,
      };
    }
    return ok(data);
  }
  throw new CliError(`不支持的 inbox action: ${action}`);
}

async function handleWatch(action, options) {
  if (action === 'state') {
    const settings = readEngagementSettings();
    const scheduled = rebalanceAllConversations(settings);
    const state = readWatchState();
    const recentEvents = readEventLog(toInt(options.limit, 20), { maxAgeHours: toInt(options['event-hours'], 24) });
    const unreadDmThreads = Object.values(state.dm.sessions || {}).filter((item) => Number(item?.unreadCount || 0) > 0);
    return ok({
      statePath: WATCH_STATE_PATH,
      eventsLogPath: WATCH_EVENTS_LOG_PATH,
      lockPath: WATCH_LOCK_PATH,
      lock: readWatchLock(),
      state: {
        updatedAt: state.updatedAt,
        replies: {
          cursorId: state.replies?.cursorId || 0,
          cursorTime: state.replies?.cursorTime || 0,
          processedCount: (state.replies?.processedIds || []).length,
          lastPollAt: state.replies?.lastPollAt || '',
        },
        dm: {
          sessionCount: Object.keys(state.dm.sessions || {}).length,
          unreadSessionCount: unreadDmThreads.length,
          processedMsgCount: (state.dm.processedMsgKeys || []).length,
          lastPollAt: state.dm.lastPollAt || '',
        },
        stats: state.stats || {},
        control: state.control || {},
      },
      summary: {
        unreadDmThreads: unreadDmThreads.length,
        unreadDmMessages: unreadDmThreads.reduce((total, item) => total + Number(item.unreadCount || 0), 0),
        trackedDmSessions: Object.keys(state.dm.sessions || {}).length,
        repliesCheckpoint: {
          cursorId: state.replies?.cursorId || 0,
          cursorTime: state.replies?.cursorTime || 0,
          lastPollAt: state.replies?.lastPollAt || '',
        },
        lastRunAt: state.stats?.lastRunAt || '',
        recentEventCount: recentEvents.length,
      },
      scheduler: {
        conversations: scheduled.length,
        hot: scheduled.filter((item) => item.engagementTier === 'hot').length,
        warm: scheduled.filter((item) => item.engagementTier === 'warm').length,
        cool: scheduled.filter((item) => item.engagementTier === 'cool').length,
        cold: scheduled.filter((item) => item.engagementTier === 'cold').length,
        top: scheduled
          .slice()
          .sort((a, b) => Number(b.engagementScore || 0) - Number(a.engagementScore || 0))
          .slice(0, 5)
          .map((item) => ({
            mid: item.mid || '',
            nickname: item.nickname || '',
            tier: item.engagementTier || '',
            score: item.engagementScore || 0,
            nextPollAt: item.nextPollAt || '',
            nextAllowedSendAt: item.nextAllowedSendAt || '',
        })),
      },
      recentEvents,
      nextSteps: [
        unreadDmThreads.length
          ? '当前存在私信未读线程，优先执行 `inbox unread` 或 `inbox dm-sessions`，再按返回命令继续。'
          : '如果要确认评论回复或私信未读的实时摘要，执行 `inbox unread`。',
      ],
    });
  }
  if (action === 'reset') {
    return ok({
      statePath: WATCH_STATE_PATH,
      state: resetWatchState(),
    });
  }
  if (action === 'prime') {
    return ok(
      await primeWatchState({
        client: getClient(options),
      })
    );
  }
  if (action === 'once') {
    return ok(
      await watchOnce({
        client: getClient(options),
        historySize: toInt(options['history-size'], 20),
      })
    );
  }
  if (action === 'run') {
    return ok(
      await watchRun({
        client: getClient(options),
        intervalSec: toInt(options['interval-sec'], 90),
        iterations: toInt(options.iterations, 1),
        historySize: toInt(options['history-size'], 20),
      })
    );
  }
  throw new CliError(`不支持的 watch action: ${action}`);
}

async function handleThread(action, options) {
  const client = getClient(options);
  if (action === 'list') {
    const settings = readEngagementSettings();
    return ok(listConversations().map((item) => ({ ...item, ...summarizeSchedule(item, settings) })));
  }
  if (action === 'get') {
    const conversation = getConversationByMid(requireOption(options, 'mid'));
    return ok(conversation ? { ...conversation, ...summarizeSchedule(conversation, readEngagementSettings()) } : null);
  }
  if (action === 'continue') {
    return ok(
      await buildThreadContinuation({
        client: getClient(options),
        mid: requireOption(options, 'mid'),
        productSlug: options.product || '',
        historySize: toInt(options['history-size'], 20),
      })
    );
  }
  if (action === 'draft') {
    let threadContext;
    if (options.mid) {
      threadContext = await buildThreadContinuation({
        client,
        mid: requireOption(options, 'mid'),
        productSlug: options.product || '',
        historySize: toInt(options['history-size'], 20),
      });
    } else if (options.id && options.root) {
      const commentThread = await buildCommentThreadContext({
        client,
        id: requireOption(options, 'id'),
        root: requireOption(options, 'root'),
        page: toInt(options.page, 1),
        size: toInt(options.size, 20),
        hotPage: toInt(options['hot-page'], 1),
        hotSize: toInt(options['hot-size'], 10),
        rootSearchPages: toInt(options['root-search-pages'], 3),
      });
      const latestReply = (commentThread.thread.replies || []).slice(-1)[0] || null;
      threadContext = {
        recommendedChannel: 'comment',
        conversationSummary: {
          lastInboundMessage: latestReply?.message || commentThread.thread.rootComment?.message || '',
          recentHistory: [
            commentThread.thread.rootComment
              ? {
                  direction: 'inbound',
                  type: 'comment_root',
                  payload: commentThread.thread.rootComment,
                }
              : null,
            ...(commentThread.thread.replies || []).slice(-5).map((item) => ({
              direction: 'inbound',
              type: 'comment_reply',
              payload: item,
            })),
          ].filter(Boolean),
        },
        replyNotifications: [],
        dmHistory: { items: [] },
        dmSession: null,
        product: options.product ? { selected: getProduct(options.product) } : { selected: null },
        commentThread,
      };
    } else if (options.id) {
      const detail = await client.getVideoDetail(requireOption(options, 'id'));
      threadContext = {
        recommendedChannel: 'comment',
        conversationSummary: {
          lastInboundMessage: detail.title || '',
          recentHistory: [
            {
              direction: 'inbound',
              type: 'video_context',
              payload: {
                bvid: detail.bvid,
                aid: detail.aid,
                title: detail.title,
                description: detail.description || '',
                owner: detail.owner || null,
                stat: detail.stat || null,
              },
            },
          ],
        },
        replyNotifications: [],
        dmHistory: { items: [] },
        dmSession: null,
        product: options.product ? { selected: getProduct(options.product) } : { selected: null },
        video: {
          bvid: detail.bvid,
          aid: detail.aid,
          title: detail.title,
          description: detail.description || '',
          owner: detail.owner || null,
          stat: detail.stat || null,
        },
      };
    } else if (options['inbound-text']) {
      threadContext = {
        recommendedChannel: options.channel || readEngagementSettings().defaultChannel,
        conversationSummary: {
          lastInboundMessage: options['inbound-text'],
        },
        replyNotifications: [],
        dmHistory: { items: [] },
        dmSession: null,
        product: options.product ? { selected: getProduct(options.product) } : { selected: null },
      };
    } else {
      throw new CliError('生成草稿时请提供 --mid 或 --inbound-text');
    }
    const settings = readEngagementSettings();
    return ok(
      buildThreadDraft({
        threadContext,
        product: threadContext.product,
        channel: options.channel || '',
        objective: options.objective || (options.id && !options.root ? 'video-root-comment' : ''),
        settings,
      })
    );
  }
  if (action === 'discover-comments') {
    return ok(
      await buildVideoCommentDiscovery({
        client,
        id: requireOption(options, 'id'),
        page: toInt(options.page, 1),
        size: toInt(options.size, 20),
        searchPages: toInt(options['search-pages'], 2),
        sort: toInt(options.sort, 1),
        nohot: toInt(options.nohot, 0),
        productSlug: options.product || '',
        limit: toInt(options.limit, 20),
      })
    );
  }
  if (action === 'send') {
    const channel = requireOption(options, 'channel', '请通过 --channel 指定 dm 或 comment');
    const content = options.content || '';
    const imagePath = options.image || '';
    const campaignId = options.campaign || '';
    if (!content && !imagePath) {
      throw new CliError('请至少提供 --content 或 --image');
    }
    const targetMid = options.mid || '';
    const productSlug = options.product || '';
    const threadContext = targetMid
      ? await buildThreadContinuation({
          client,
          mid: targetMid,
          productSlug,
          historySize: toInt(options['history-size'], 20),
        }).catch(() => ({
          recommendedChannel: channel,
          product: productSlug ? { selected: getProduct(productSlug) } : { selected: null },
        }))
      : {
          recommendedChannel: channel,
          product: productSlug ? { selected: getProduct(productSlug) } : { selected: null },
        };
    const settings = readEngagementSettings();
    if (targetMid && !toBoolean(options['ignore-cooldown'], false)) {
      const pacing = getThreadSendStatus(targetMid, settings);
      if (pacing.blocked) {
        throw new CliError(
          pacing.schedule?.cooldownReason === 'await_reply'
            ? '当前会话已经进入等待用户回复阶段，暂时不建议继续主动发送。'
            : '当前会话还在发送冷却窗口内。',
          1,
          {
            mid: String(targetMid),
            schedule: pacing.schedule,
          },
          pacing.schedule?.cooldownReason === 'await_reply'
            ? '先继续轮询该用户的回复；如果确实要强制发送，可以在命令里追加 `--ignore-cooldown true`。'
            : `建议等待到 ${pacing.schedule?.nextAllowedSendAt || '冷却结束'} 之后再发送；如确需跳过，可追加 \`--ignore-cooldown true\`。`
        );
      }
    }
    const risk = assessSendRisk({
      channel,
      content: content || imagePath,
      product: threadContext.product || { selected: null },
      threadContext,
    });
    const policy = resolveConfirmationPolicy({
      riskLevel: risk.level,
      options: {
        mode: options.mode,
        yes: toBoolean(options.yes, false),
        'auto-send': toBoolean(options['auto-send'], false),
      },
      settings,
    });

    if (policy.requiresConfirmation) {
      throw new CliError(
        `当前发送动作需要人工确认，风险等级为 ${risk.level}。`,
        1,
        {
          channel,
          risk,
          mode: policy.mode,
        },
        '先执行 `node scripts/bili.js thread draft --mid <mid> [--product <slug>]` 查看草稿；确认后在发送命令里追加 `--yes`。'
      );
    }

    if (channel === 'dm') {
      assertCampaignSendAllowed({
        campaignId,
        channel: 'dm',
        targetMid,
        threadContext,
      });
      const mid = requireOption(options, 'mid', '发送私信时必须提供 --mid');
      const result = imagePath
        ? await client.sendDmImage({
            receiverId: mid,
            imagePath,
          })
        : await client.sendDmText({
            receiverId: mid,
            content,
          });
      recordCampaignSend({ campaignId, channel: 'dm' });
      const postActionGuidance = buildPostActionGuidance({
        channel: 'dm',
        settings,
      });
      return ok({
        campaignId,
        channel,
        targetMid: String(mid),
        productSlug,
        message: content,
        imagePath,
        schedule: targetMid ? getThreadSendStatus(targetMid, settings).schedule : null,
        risk,
        confirmationPolicy: policy,
        postActionGuidance,
        nextSteps: [
          postActionGuidance.prompt,
          `建议至少等到 ${postActionGuidance.resumeAfter} 再继续下一条高风险发送动作。`,
        ],
        result,
      });
    }

    if (channel === 'comment') {
      const resolvedVideoId = String(options.id || options.oid || '').trim();
      const replyRoot = options.root || '';
      const replyParent = options.parent || (replyRoot ? replyRoot : '');
      assertNonCampaignCommentAllowed({
        options,
        productSlug,
        commentTarget: {
          root: replyRoot || '',
          parent: replyParent || '',
        },
      });
      assertCampaignSendAllowed({
        campaignId,
        channel: 'comment',
        videoId: resolvedVideoId,
        commentTarget: {
          root: replyRoot,
        },
        videoQuality: options['video-quality'] || 'medium',
      });
      if (!campaignId) {
        assertPublicCommentThrottle(options, settings);
      }
      if (!options.id && !options.oid) {
        throw new CliError('发送评论时必须提供 --id 或 --oid');
      }
      const result = await client.sendComment({
        oid: options.oid,
        id: options.id,
        message: content,
        root: replyRoot,
        parent: replyParent,
      });
      recordCampaignSend({
        campaignId,
        channel: 'comment',
        videoId: resolvedVideoId,
        commentTarget: {
          root: replyRoot,
          parent: replyParent,
        },
        videoQuality: options['video-quality'] || 'medium',
      });
      if (campaignId && resolvedVideoId) {
        finalizeCandidateConsumption({
          campaignId,
          bvid: resolvedVideoId,
        });
      }
      const commentTarget = {
        id: options.id || '',
        oid: options.oid || '',
        root: replyRoot || null,
        parent: replyParent || null,
      };
      const postActionGuidance = buildPostActionGuidance({
        channel: 'comment',
        commentTarget,
        settings,
      });
      return ok({
        campaignId,
        channel,
        targetMid: targetMid ? String(targetMid) : '',
        productSlug,
        message: content,
        imagePath: '',
        commentTarget,
        schedule: targetMid ? getThreadSendStatus(targetMid, settings).schedule : null,
        risk,
        confirmationPolicy: policy,
        postActionGuidance,
        nextSteps: [
          postActionGuidance.prompt,
          `建议至少等到 ${postActionGuidance.resumeAfter} 再继续下一条公开触达动作。`,
        ],
        result,
      });
    }

    throw new CliError('不支持的 channel，请使用 dm 或 comment');
  }
  throw new CliError(`不支持的 thread action: ${action}`);
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [resource, action] = positionals;
  setCommandContext({
    resource,
    action,
    options,
    positionals,
  });

  if (!resource || options.help || !action) {
    printHelp();
    process.exit(resource && action ? 0 : 1);
  }

  if (resource === 'init') {
    await handleInit(action, options);
    return;
  }
  if (resource === 'config') {
    await handleConfig(action, options);
    return;
  }
  if (resource === 'system') {
    await handleSystem(action, options);
    return;
  }
  if (resource === 'product') {
    await handleProduct(action, options);
    return;
  }
  if (resource === 'campaign') {
    await handleCampaign(action, options);
    return;
  }
  if (resource === 'trace') {
    await handleTrace(action, options);
    return;
  }
  if (resource === 'inbox') {
    await handleInbox(action, options);
    return;
  }
  if (resource === 'watch') {
    await handleWatch(action, options);
    return;
  }
  if (resource === 'thread') {
    await handleThread(action, options);
    return;
  }
  if (resource === 'auth') {
    await handleAuth(action, options);
    return;
  }
  if (resource === 'session') {
    await handleSession(action, options);
    return;
  }
  if (resource === 'candidate') {
    await handleCandidate(action, options);
    return;
  }
  throw new CliError(`不支持的 resource: ${resource}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error : new Error(String(error)));
  process.exit(error.exitCode || 1);
});
