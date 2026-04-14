'use strict';

const { parseArgs, toBoolean, toInt } = require('./lib/args');
const { updateCredentials, readCredentials, CREDENTIALS_PATH, SKILL_ROOT_DIR, RUNTIME_ROOT_DIR, PRODUCTS_DIR, PLAYBOOKS_DIR, DATA_DIR, TASKS_DIR, SESSION_PATH, SECRETS_PATH, SETTINGS_PATH, RUNTIME_CONFIG_PATH } = require('./lib/config');
const { ok, fail } = require('./lib/output');
const { CliError } = require('./lib/errors');
const { BilibiliClient } = require('./lib/client');
const { DEFAULT_COMMENT_PAGE_SIZE, DEFAULT_RE_SRC } = require('./lib/constants');
const { generateQrCode, pollQrCode, hydrateSession, checkCookieRefresh, refreshCookie } = require('./lib/auth');
const { readSession, readSecrets } = require('./lib/store');
const { buildSessionSummary } = require('./lib/session');
const { setCommandContext } = require('./lib/runtime-context');
const { OPERATIONS_LOG_PATH, listConversations, getConversationByMid, getPublicSendThrottleStatus } = require('./lib/tracker');
const { ensureProductsDir, listProducts, getProduct, initProduct, setupProduct, buildProductDoctor, summarizeProduct } = require('./lib/products');
const { ensurePlaybooksDir, listPlaybooks, getPlaybook, initPlaybook, initDefaultPlaybooks } = require('./lib/playbooks');
const { buildSetupStatus, buildOnboardText, buildWorkflow } = require('./lib/doctor');
const { buildInboxOverview, buildThreadContinuation } = require('./lib/orchestrator');
const { readEngagementSettings, patchEngagementSettings, normalizeMode, assessSendRisk, resolveConfirmationPolicy, buildThreadDraft } = require('./lib/engagement');
const { WATCH_STATE_PATH, WATCH_EVENTS_LOG_PATH, WATCH_LOCK_PATH, readWatchState, readWatchLock, resetWatchState, readEventLog, primeWatchState, watchOnce, watchRun } = require('./lib/watch');
const { summarizeSchedule, getThreadSendStatus, rebalanceAllConversations } = require('./lib/scheduler');
const { buildTaskPlan, buildTaskRun, buildTaskStatus, taskStatusUpdate, listTasks } = require('./lib/tasks');
const { discoverPromotionVideos, discoverPromotionComments, findPromotionLeads, buildCommentThreadContext } = require('./lib/discovery');
const { initSkill, getInitStatus } = require('./lib/init');
const { buildCampaignPlan, buildCampaignNext, buildCampaignStatus, assertCampaignSendAllowed, assertCampaignDiscoveryAllowed, markCampaignInboxCheck, markCampaignVideoFocus, recordCampaignSend, runCampaign, listCampaigns, getCampaign } = require('./lib/campaigns');
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

function assertPublicCommentThrottle(options, settings) {
  if (toBoolean(options['ignore-public-throttle'], false)) {
    return;
  }
  const status = getPublicSendThrottleStatus(settings);
  if (!status.blocked) {
    return;
  }
  let hint = '建议先停一下，等公开触达节奏降下来之后再继续。';
  if (status.reason === 'public_min_gap') {
    hint = `上一条公开评论/回复刚发出不久，建议至少等到 ${status.nextAllowedAt || '冷却结束'} 再继续；如确需跳过，可追加 \`--ignore-public-throttle true\`。`;
  } else if (status.reason === 'public_comment_hourly_cap') {
    hint = `当前 1 小时内主评论已达到上限（${status.commentCountPerHour}/${status.limits.publicCommentMaxPerHour}），建议暂停公开评论，先观察后续互动。`;
  } else if (status.reason === 'public_reply_hourly_cap') {
    hint = `当前 1 小时内评论回复已达到上限（${status.replyCountPerHour}/${status.limits.publicReplyMaxPerHour}），建议暂停公开回复，先观察后续互动。`;
  }
  throw new CliError(
    '当前未绑定 campaign 的公开评论/回复触达频次过高，已被全局公开护栏拦截。',
    1,
    status,
    `${hint} 如果这是方案一里的公开动作，请确认发送命令带了 \`--campaign <campaign_id>\`。`
  );
}

function printHelp() {
  process.stdout.write(`Usage:
  # High-level workflow
  node scripts/bili.js system onboard
  node scripts/bili.js system workflow [--goal setup|monitor|reply|promote]
  node scripts/bili.js inbox list [--limit 20] [--product <slug>]
  node scripts/bili.js thread continue --mid <mid> [--product <slug>] [--history-size 20]
  node scripts/bili.js thread draft [--mid <mid>] [--product <slug>] [--channel dm|comment]
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
  node scripts/bili.js system workflow [--goal setup|monitor|reply|promote]
  node scripts/bili.js system settings
  node scripts/bili.js system set-mode --mode confirm|semi-auto|auto
  node scripts/bili.js system set-public-throttle [--comment-gap-sec 180] [--comment-max-per-hour 20] [--reply-max-per-hour 100]

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
  node scripts/bili.js playbook list
  node scripts/bili.js playbook get --slug <slug>
  node scripts/bili.js playbook init --title "<playbook title>" [--slug <slug>] [--type campaign|comment|dm]
  node scripts/bili.js playbook init-defaults
  node scripts/bili.js task plan --product <slug> --playbook <slug>
  node scripts/bili.js task run --product <slug> --playbook <slug>
  node scripts/bili.js task list
  node scripts/bili.js task status --id <task_id>
  node scripts/bili.js task update --id <task_id> [--phase <phase_id>] [--status prepared|running|paused|completed] [--note "<text>"]
  node scripts/bili.js campaign plan --product <slug> [--hours 3] [--scheme scheme1]
  node scripts/bili.js campaign run --product <slug> [--hours 3] [--scheme scheme1]
  node scripts/bili.js campaign status --id <campaign_id>
  node scripts/bili.js campaign next --id <campaign_id>
  node scripts/bili.js campaign focus --id <campaign_id> --video <BV|AV|URL> [--video-quality low|medium|high] [--reason "<why stay>"]
  node scripts/bili.js campaign inbox-check --id <campaign_id>
  node scripts/bili.js campaign list
  node scripts/bili.js campaign get --id <campaign_id>

  # Session and trace
  node scripts/bili.js session show
  node scripts/bili.js session hydrate [--cookie "..."]
  node scripts/bili.js session refresh-check
  node scripts/bili.js session refresh
  node scripts/bili.js trace recent [--limit 20]

  # Thread and inbox
  node scripts/bili.js thread list
  node scripts/bili.js thread get --mid <mid>
  node scripts/bili.js thread continue --mid <mid> [--product <slug>] [--history-size 20]
  node scripts/bili.js thread draft [--mid <mid>] [--inbound-text "<text>"] [--id <BV|AV|URL> --root <rpid>] [--product <slug>] [--channel dm|comment] [--objective "<goal>"]
  node scripts/bili.js thread send --channel dm|comment [--content "<text>"] [--image </abs/path/to/image.png>] [--mid <mid>] [--product <slug>] [--campaign <campaign_id>] [--id <BV|AV|URL>] [--oid <aid>] [--root <rpid>] [--parent <rpid>] [--video-quality low|medium|high] [--mode confirm|semi-auto|auto] [--yes] [--ignore-cooldown true]

  # Low-level APIs
  node scripts/bili.js user info [--cookie "..."]
  node scripts/bili.js user follow --mid 123456 [--re-src 11]
  node scripts/bili.js notify unread
  node scripts/bili.js notify replies [--id <cursor_id>] [--reply-time <unix_ts>]
  node scripts/bili.js dm sessions
  node scripts/bili.js dm history --mid <talker_mid> [--begin-seqno 0] [--size 20]
  node scripts/bili.js dm send --mid <target_mid> --content "<text>" [--campaign <campaign_id>]
  node scripts/bili.js dm upload-image --path </abs/path/to/image.png>
  node scripts/bili.js dm send-image --mid <target_mid> --path </abs/path/to/image.png> [--campaign <campaign_id>]
  node scripts/bili.js dm ack --mid <talker_mid> --ack-seqno <seqno>
  node scripts/bili.js video detail --id <BV|AV|URL>
  node scripts/bili.js video summary --id <BV|AV|URL>
  node scripts/bili.js video like --id <BV|AV|URL> [--like 1|2]
  node scripts/bili.js video coin --id <BV|AV|URL> [--count 1|2] [--also-like true]
  node scripts/bili.js video triple --id <BV|AV|URL>
  node scripts/bili.js search hot
  node scripts/bili.js search videos --keyword "<keyword>" [--order totalrank|click|pubdate] [--page 1] [--page-size 10]
  node scripts/bili.js discovery videos --keyword "<keyword>" [--product <slug>] [--order totalrank|click|pubdate] [--days-within 30] [--min-play 3000] [--min-favorites 0] [--min-comments 3] [--page-size 20] [--pages 1]
  node scripts/bili.js discovery comments --id <BV|AV|URL> [--product <slug>] [--keyword "<keyword>"] [--days-within 30] [--min-like 0] [--min-replies 0] [--min-length 6] [--pages 1] [--size 20]
  node scripts/bili.js discovery leads --keyword "<keyword>" [--product <slug>] [--order pubdate] [--days-within 30] [--min-play 5000] [--candidate-videos 3] [--comment-pages 1] [--comment-size 20]
  node scripts/bili.js discovery thread --id <BV|AV|URL> --root <rpid> [--page 1] [--size 20] [--hot-page 1] [--hot-size 10] [--root-search-pages 3]
  node scripts/bili.js comment list (--id <BV|AV|URL> | --oid <aid>) [--page 1] [--size 20] [--sort 1] [--nohot 1]
  node scripts/bili.js comment scan-main (--id <BV|AV|URL> | --oid <aid>) [--mode 3] [--next-offset "<json string>"] [--seek-rpid <rpid>]
  node scripts/bili.js comment hot (--id <BV|AV|URL> | --oid <aid>) --root <rpid> [--page 1] [--size 20]
  node scripts/bili.js comment replies (--id <BV|AV|URL> | --oid <aid>) --root <rpid> [--page 1] [--size 20]
  node scripts/bili.js comment send (--id <BV|AV|URL> | --oid <aid>) --message "<content>" [--root <rpid>] [--parent <rpid>] [--campaign <campaign_id>] [--video-quality low|medium|high]
  node scripts/bili.js comment like (--id <BV|AV|URL> | --oid <aid>) --rpid <rpid>
  node scripts/bili.js comment dislike (--id <BV|AV|URL> | --oid <aid>) --rpid <rpid>
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
      playbooksDir: PLAYBOOKS_DIR,
      dataDir: DATA_DIR,
      tasksDir: TASKS_DIR,
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

async function handlePlaybook(action, options) {
  if (action === 'list') {
    return ok(listPlaybooks());
  }
  if (action === 'get') {
    return ok(getPlaybook(requireOption(options, 'slug')));
  }
  if (action === 'init-defaults') {
    return ok(initDefaultPlaybooks());
  }
  if (action === 'init') {
    return ok(initPlaybook({ slug: options.slug, title: requireOption(options, 'title'), type: options.type || 'campaign' }));
  }
  throw new CliError(`不支持的 playbook action: ${action}`);
}

async function handleTask(action, options) {
  if (action === 'list') {
    return ok(listTasks());
  }
  if (action === 'status') {
    return ok(buildTaskStatus(requireOption(options, 'id', '请通过 --id 指定任务实例 id')));
  }
  if (action === 'update') {
    return ok(
      taskStatusUpdate({
        id: requireOption(options, 'id', '请通过 --id 指定任务实例 id'),
        phaseId: options.phase || '',
        status: options.status || '',
        note: options.note || '',
      })
    );
  }
  const productSlug = requireOption(options, 'product', '请通过 --product 指定产品 slug');
  const playbookSlug = requireOption(options, 'playbook', '请通过 --playbook 指定任务模板 slug');
  if (action === 'plan') {
    return ok(buildTaskPlan({ productSlug, playbookSlug }));
  }
  if (action === 'run') {
    return ok(buildTaskRun({ productSlug, playbookSlug }));
  }
  throw new CliError(`不支持的 task action: ${action}`);
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
  const scheme = options.scheme || 'scheme1';
  if (action === 'plan') {
    return ok(buildCampaignPlan({ productSlug, hours, scheme }));
  }
  if (action === 'run') {
    return ok(runCampaign({ productSlug, hours, scheme }));
  }
  throw new CliError(`不支持的 campaign action: ${action}`);
}

async function handleUser(action, options) {
  const client = getClient(options);
  if (action === 'info') {
    return ok(await client.getUserInfo());
  }
  if (action === 'follow') {
    return ok(await client.followUser(requireOption(options, 'mid'), toInt(options['re-src'], DEFAULT_RE_SRC)));
  }
  throw new CliError(`不支持的 user action: ${action}`);
}

async function handleNotify(action, options) {
  const client = getClient(options);
  if (action === 'unread') {
    return ok(await client.getUnreadNotifications());
  }
  if (action === 'replies') {
    return ok(
      await client.getReplyNotifications({
        id: options.id ? toInt(options.id, undefined) : undefined,
        replyTime: options['reply-time'] ? toInt(options['reply-time'], undefined) : undefined,
      })
    );
  }
  throw new CliError(`不支持的 notify action: ${action}`);
}

async function handleDm(action, options) {
  const client = getClient(options);
  const settings = readEngagementSettings();
  const campaignId = options.campaign || '';
  if (action === 'sessions') {
    return ok(await client.listDmSessions());
  }
  if (action === 'history') {
    return ok(
      await client.getDmMessages({
        talkerId: requireOption(options, 'mid'),
        beginSeqno: toInt(options['begin-seqno'], 0),
        size: toInt(options.size, 20),
      })
    );
  }
  if (action === 'send') {
    assertCampaignSendAllowed({
      campaignId,
      channel: 'dm',
    });
    const pacing = getThreadSendStatus(requireOption(options, 'mid'), settings);
    if (pacing.blocked && !toBoolean(options['ignore-cooldown'], false)) {
      throw new CliError(
        pacing.schedule?.cooldownReason === 'await_reply'
          ? '当前会话已经进入等待用户回复阶段，暂时不建议继续主动发送。'
          : '当前会话还在发送冷却窗口内。',
        1,
        {
          mid: String(options.mid),
          schedule: pacing.schedule,
        },
        pacing.schedule?.cooldownReason === 'await_reply'
          ? '先继续轮询该用户的回复；如果确实要强制发送，可以在命令里追加 `--ignore-cooldown true`。'
          : `建议等待到 ${pacing.schedule?.nextAllowedSendAt || '冷却结束'} 之后再发送；如确需跳过，可追加 \`--ignore-cooldown true\`。`
      );
    }
    const receiverId = requireOption(options, 'mid');
    const result = await client.sendDmText({ receiverId, content: requireOption(options, 'content') });
    recordCampaignSend({ campaignId, channel: 'dm' });
    return ok({
      campaignId,
      receiverId: String(receiverId),
      result,
    });
  }
  if (action === 'upload-image') {
    return ok(await client.uploadDmImage(requireOption(options, 'path', '请通过 --path 提供图片绝对路径')));
  }
  if (action === 'send-image') {
    assertCampaignSendAllowed({
      campaignId,
      channel: 'dm',
    });
    const pacing = getThreadSendStatus(requireOption(options, 'mid'), settings);
    if (pacing.blocked && !toBoolean(options['ignore-cooldown'], false)) {
      throw new CliError(
        pacing.schedule?.cooldownReason === 'await_reply'
          ? '当前会话已经进入等待用户回复阶段，暂时不建议继续主动发送。'
          : '当前会话还在发送冷却窗口内。',
        1,
        {
          mid: String(options.mid),
          schedule: pacing.schedule,
        },
        pacing.schedule?.cooldownReason === 'await_reply'
          ? '先继续轮询该用户的回复；如果确实要强制发送，可以在命令里追加 `--ignore-cooldown true`。'
          : `建议等待到 ${pacing.schedule?.nextAllowedSendAt || '冷却结束'} 之后再发送；如确需跳过，可追加 \`--ignore-cooldown true\`。`
      );
    }
    const receiverId = requireOption(options, 'mid');
    const result = await client.sendDmImage({
      receiverId,
      imagePath: requireOption(options, 'path', '请通过 --path 提供图片绝对路径'),
    });
    recordCampaignSend({ campaignId, channel: 'dm' });
    return ok({
      campaignId,
      receiverId: String(receiverId),
      result,
    });
  }
  if (action === 'ack') {
    return ok(
      await client.ackDmSession({
        talkerId: requireOption(options, 'mid'),
        ackSeqno: requireOption(options, 'ack-seqno'),
      })
    );
  }
  throw new CliError(`不支持的 dm action: ${action}`);
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
  if (action !== 'list') {
    throw new CliError(`不支持的 inbox action: ${action}`);
  }
  const campaignId = options.campaign || '';
  const data = await buildInboxOverview({
    client: getClient(options),
    productSlug: options.product || '',
    limit: toInt(options.limit, 20),
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

async function handleWatch(action, options) {
  if (action === 'state') {
    const settings = readEngagementSettings();
    const scheduled = rebalanceAllConversations(settings);
    return ok({
      statePath: WATCH_STATE_PATH,
      eventsLogPath: WATCH_EVENTS_LOG_PATH,
      lockPath: WATCH_LOCK_PATH,
      lock: readWatchLock(),
      state: readWatchState(),
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
      recentEvents: readEventLog(toInt(options.limit, 20)),
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
        objective: options.objective || '',
        settings,
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
        result,
      });
    }

    if (channel === 'comment') {
      const resolvedVideoId = String(options.id || options.oid || '').trim();
      assertCampaignSendAllowed({
        campaignId,
        channel: 'comment',
        videoId: resolvedVideoId,
        commentTarget: {
          root: options.root || '',
        },
        videoQuality: options['video-quality'] || 'medium',
      });
      if (!campaignId) {
        assertPublicCommentThrottle(options, settings);
      }
      if (!options.id && !options.oid) {
        throw new CliError('发送评论时必须提供 --id 或 --oid');
      }
      const replyRoot = options.root || '';
      const replyParent = options.parent || (replyRoot ? replyRoot : '');
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
      return ok({
        campaignId,
        channel,
        targetMid: targetMid ? String(targetMid) : '',
        productSlug,
        message: content,
        imagePath: '',
        commentTarget: {
          id: options.id || '',
          oid: options.oid || '',
          root: replyRoot || null,
          parent: replyParent || null,
        },
        schedule: targetMid ? getThreadSendStatus(targetMid, settings).schedule : null,
        risk,
        confirmationPolicy: policy,
        result,
      });
    }

    throw new CliError('不支持的 channel，请使用 dm 或 comment');
  }
  throw new CliError(`不支持的 thread action: ${action}`);
}

async function handleVideo(action, options) {
  const client = getClient(options);
  const id = requireOption(options, 'id', '请通过 --id 提供 BV、AV、数字 aid 或视频 URL');

  if (action === 'detail') {
    return ok(await client.getVideoDetail(id));
  }
  if (action === 'summary') {
    return ok(await client.getVideoSummary(id));
  }
  if (action === 'like') {
    return ok(await client.likeVideo(id, toInt(options.like, 1)));
  }
  if (action === 'coin') {
    return ok(await client.coinVideo(id, toInt(options.count, 1), toBoolean(options['also-like'], false)));
  }
  if (action === 'triple') {
    return ok(await client.tripleVideo(id));
  }
  throw new CliError(`不支持的 video action: ${action}`);
}

async function handleSearch(action, options) {
  const client = getClient(options);
  if (action === 'hot') {
    return ok(await client.getHotSearch());
  }
  if (action === 'videos') {
    return ok(
      await client.searchVideos({
        keyword: requireOption(options, 'keyword', '请通过 --keyword 提供搜索词'),
        order: options.order || 'totalrank',
        duration: toInt(options.duration, 0),
        tids: toInt(options.tids, 0),
        page: toInt(options.page, 1),
        pageSize: toInt(options['page-size'], 10),
      })
    );
  }
  throw new CliError(`不支持的 search action: ${action}`);
}

async function handleDiscovery(action, options) {
  const client = getClient(options);
  const campaignId = options.campaign || '';
  if (action === 'videos') {
    if (campaignId) {
      assertCampaignDiscoveryAllowed({
        campaignId,
        forceNextVideo: toBoolean(options['force-next-video'], false),
      });
    }
    const data = await discoverPromotionVideos({
      client,
      keyword: requireOption(options, 'keyword', '请通过 --keyword 提供搜索词'),
      productSlug: options.product || '',
      order: options.order || 'totalrank',
      duration: toInt(options.duration, 0),
      tids: toInt(options.tids, 0),
      page: toInt(options.page, 1),
      pageSize: toInt(options['page-size'], 20),
      pages: toInt(options.pages, 1),
      daysWithin: toInt(options['days-within'], 30),
      minPlay: toInt(options['min-play'], 3000),
      maxPlay: toInt(options['max-play'], 0),
      minFavorites: toInt(options['min-favorites'], 0),
      minComments: toInt(options['min-comments'], 3),
    });
    if (campaignId && data.items?.[0]?.bvid) {
      data.campaign = markCampaignVideoFocus({
        campaignId,
        videoId: data.items[0].bvid,
        videoQuality: options['video-quality'] || (data.items[0].scoring?.promotionScore >= 60 ? 'high' : 'medium'),
        reason: `候选视频得分 ${data.items[0].scoring?.promotionScore || 0}，${(data.items[0].whySelected || []).slice(0, 2).join('，')}`,
      }).focus;
    }
    return ok(data);
  }
  if (action === 'comments') {
    const targetId = requireOption(options, 'id', '请通过 --id 提供 BV、AV、数字 aid 或视频 URL');
    const data = await discoverPromotionComments({
      client,
      id: targetId,
      productSlug: options.product || '',
      keyword: options.keyword || '',
      pages: toInt(options.pages, 1),
      size: toInt(options.size, 20),
      daysWithin: toInt(options['days-within'], 30),
      minLike: toInt(options['min-like'], 0),
      minReplies: toInt(options['min-replies'], 0),
      minLength: toInt(options['min-length'], 6),
      requireKeyword: toBoolean(options['require-keyword'], false),
    });
    if (campaignId) {
      data.campaign = markCampaignVideoFocus({
        campaignId,
        videoId: data.video?.bvid || targetId,
        videoQuality: options['video-quality'] || (data.items?.[0]?.scoring?.leadScore >= 45 ? 'high' : 'medium'),
        reason: data.items?.[0]?.whySelected?.slice(0, 2).join('，') || '当前视频评论区值得继续观察',
      }).focus;
    }
    return ok(data);
  }
  if (action === 'leads') {
    return ok(
      await findPromotionLeads({
        client,
        keyword: requireOption(options, 'keyword', '请通过 --keyword 提供搜索词'),
        productSlug: options.product || '',
        order: options.order || 'pubdate',
        daysWithin: toInt(options['days-within'], 30),
        minPlay: toInt(options['min-play'], 5000),
        minFavorites: toInt(options['min-favorites'], 0),
        candidateVideos: toInt(options['candidate-videos'], 3),
        commentPages: toInt(options['comment-pages'], 1),
        commentSize: toInt(options['comment-size'], 20),
      })
    );
  }
  if (action === 'thread') {
    return ok(
      await buildCommentThreadContext({
        client,
        id: requireOption(options, 'id', '请通过 --id 提供 BV、AV、数字 aid 或视频 URL'),
        root: requireOption(options, 'root', '请通过 --root 提供主评论 rpid'),
        page: toInt(options.page, 1),
        size: toInt(options.size, 20),
        hotPage: toInt(options['hot-page'], 1),
        hotSize: toInt(options['hot-size'], 10),
        rootSearchPages: toInt(options['root-search-pages'], 3),
      })
    );
  }
  throw new CliError(`不支持的 discovery action: ${action}`);
}

async function handleComment(action, options) {
  const client = getClient(options);
  const settings = readEngagementSettings();
  const campaignId = options.campaign || '';
  const payload = {
    oid: options.oid,
    id: options.id,
    page: toInt(options.page, 1),
    size: toInt(options.size, DEFAULT_COMMENT_PAGE_SIZE),
  };

  if (action === 'list') {
    return ok(
      await client.listComments({
        ...payload,
        sort: toInt(options.sort, 1),
        nohot: toInt(options.nohot, 1),
      })
    );
  }
  if (action === 'scan-main') {
    return ok(
      await client.scanMainComments({
        oid: options.oid,
        id: options.id,
        mode: toInt(options.mode, 3),
        nextOffset: options['next-offset'] || '',
        seekRpid: options['seek-rpid'] || '',
      })
    );
  }
  if (action === 'hot') {
    return ok(await client.listHotReplies({ ...payload, root: requireOption(options, 'root') }));
  }
  if (action === 'replies') {
    return ok(await client.listReplies({ ...payload, root: requireOption(options, 'root') }));
  }
  if (action === 'send') {
    assertCampaignSendAllowed({
      campaignId,
      channel: 'comment',
      videoId: String(options.id || options.oid || '').trim(),
      commentTarget: {
        root: options.root || '',
      },
      videoQuality: options['video-quality'] || 'medium',
    });
    if (!campaignId) {
      assertPublicCommentThrottle(options, settings);
    }
    const result = await client.sendComment({
      oid: options.oid,
      id: options.id,
      message: requireOption(options, 'message'),
      root: options.root,
      parent: options.parent,
    });
    recordCampaignSend({
      campaignId,
      channel: 'comment',
      videoId: String(options.id || options.oid || '').trim(),
      commentTarget: {
        root: options.root || '',
        parent: options.parent || '',
      },
      videoQuality: options['video-quality'] || 'medium',
    });
    return ok({
      campaignId,
      result,
    });
  }
  if (action === 'like') {
    return ok(await client.likeComment({ oid: options.oid, id: options.id, rpid: requireOption(options, 'rpid'), action: 'like' }));
  }
  if (action === 'dislike') {
    return ok(
      await client.likeComment({ oid: options.oid, id: options.id, rpid: requireOption(options, 'rpid'), action: 'dislike' })
    );
  }
  throw new CliError(`不支持的 comment action: ${action}`);
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

  if (!resource || !action || options.help) {
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
  if (resource === 'playbook') {
    await handlePlaybook(action, options);
    return;
  }
  if (resource === 'task') {
    await handleTask(action, options);
    return;
  }
  if (resource === 'campaign') {
    await handleCampaign(action, options);
    return;
  }
  if (resource === 'user') {
    await handleUser(action, options);
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
  if (resource === 'notify') {
    await handleNotify(action, options);
    return;
  }
  if (resource === 'dm') {
    await handleDm(action, options);
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
  if (resource === 'video') {
    await handleVideo(action, options);
    return;
  }
  if (resource === 'search') {
    await handleSearch(action, options);
    return;
  }
  if (resource === 'discovery') {
    await handleDiscovery(action, options);
    return;
  }
  if (resource === 'comment') {
    await handleComment(action, options);
    return;
  }

  throw new CliError(`不支持的 resource: ${resource}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error : new Error(String(error)));
  process.exit(error.exitCode || 1);
});
