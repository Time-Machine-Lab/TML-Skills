'use strict';

const fs = require('fs');
const {
  SKILL_ROOT_DIR,
  RUNTIME_ROOT_DIR,
  PRODUCTS_DIR,
  DATA_DIR,
  VIDEO_POOLS_DIR,
  CREDENTIALS_PATH,
  SECRETS_PATH,
  SESSION_PATH,
  ensureDir,
  readJson,
} = require('./config');
const { OPERATIONS_LOG_PATH } = require('./tracker');
const { buildSessionSummary } = require('./session');
const { listProducts, ensureProductsDir } = require('./products');

function fileExists(path) {
  try {
    return fs.existsSync(path);
  } catch {
    return false;
  }
}

function buildSetupStatus() {
  ensureDir(RUNTIME_ROOT_DIR);
  ensureDir(DATA_DIR);
  ensureProductsDir();

  const credentials = readJson(CREDENTIALS_PATH, {});
  const secrets = readJson(SECRETS_PATH, {});
  const session = readJson(SESSION_PATH, {});
  const products = listProducts();
  const sessionSummary = buildSessionSummary(session);

  const checks = [
    {
      id: 'runtime_dir',
      ok: fileExists(RUNTIME_ROOT_DIR),
      label: '运行目录已就绪',
      detail: RUNTIME_ROOT_DIR,
    },
    {
      id: 'cookie',
      ok: Boolean(credentials.cookie || secrets.cookie || session.cookie),
      label: 'B 站 Cookie 已配置',
      detail: CREDENTIALS_PATH,
      fix: '执行 `node scripts/bili.js auth qr-generate` 后扫码，再执行 `node scripts/bili.js auth qr-poll`。',
    },
    {
      id: 'refresh_token',
      ok: Boolean(secrets.refreshToken || session.refreshToken),
      label: 'refresh_token 已配置',
      detail: SECRETS_PATH,
      fix: '完成一次二维码登录，登录成功后会自动写入。',
    },
    {
      id: 'products_dir',
      ok: fileExists(PRODUCTS_DIR),
      label: '产品资料目录已存在',
      detail: PRODUCTS_DIR,
      fix: '先执行 `node scripts/bili.js init start --runtime-root <绝对路径> --reset true` 初始化运行目录。',
    },
    {
      id: 'product_count',
      ok: products.length > 0,
      label: '至少存在一个产品资料',
      detail: `${products.length} 个产品`,
      fix: '执行 `node scripts/bili.js product setup --title "你的产品名" --intro "<产品介绍>" ...` 建立一个可推广的产品。',
    },
    {
      id: 'video_pools_dir',
      ok: fileExists(VIDEO_POOLS_DIR),
      label: '候选池目录已存在',
      detail: VIDEO_POOLS_DIR,
      fix: '执行 `node scripts/bili.js init start --runtime-root <绝对路径> --reset true` 重新初始化运行目录。',
    },
    {
      id: 'operations_log',
      ok: fileExists(OPERATIONS_LOG_PATH),
      label: '操作日志文件已存在',
      detail: OPERATIONS_LOG_PATH,
    },
    {
      id: 'watch_state',
      ok: fileExists(pathJoin(DATA_DIR, 'watch-state.json')),
      label: 'watch 状态文件已存在',
      detail: pathJoin(DATA_DIR, 'watch-state.json'),
      fix: '如果准备长时间跑任务，先执行 `node scripts/bili.js watch prime` 建立增量基线。',
    },
  ];

  const nextSteps = [];
  if (!checks.find((item) => item.id === 'cookie')?.ok) {
    nextSteps.push('先完成二维码登录，让 skill 具备完整会话。');
  }
  if (!checks.find((item) => item.id === 'product_count')?.ok) {
    nextSteps.push('用 product setup 建一个产品，把介绍、图片、群二维码这些资料放进产品目录。');
  }
  if (checks.find((item) => item.id === 'product_count')?.ok) {
    nextSteps.push('正式引流前先建立候选池：`node scripts/bili.js candidate collect --product "<slug>" --target-count 30`。');
  }
  if (checks.find((item) => item.id === 'cookie')?.ok) {
    nextSteps.push('登录完成后优先测试 `watch state`、`inbox unread`、`inbox replies`、`thread continue` 这一条新链路。');
  }
  nextSteps.push('长时间任务优先走 `campaign run` + `campaign next` + `watch run` + `inbox unread` + `inbox list` 这一条链路。');
  nextSteps.push('如果是第一次使用，优先走 `init start` -> `auth qr-generate` -> `product setup` -> `campaign plan`。');
  nextSteps.push('同一账号只保持一个 `watch run` 在跑，避免重复轮询和状态写冲突。');
  nextSteps.push('如果要调整发送成功后的建议暂停时间，执行 `node scripts/bili.js system set-post-action-pauses --video-comment-sec 90 --comment-reply-sec 20 --dm-sec 20`。');
  nextSteps.push('用户最好直接用自然语言描述目标，agent 再根据状态选择 `inbox list`、`thread continue`、`thread draft`、`thread send`。');

  return {
    skillRoot: SKILL_ROOT_DIR,
    runtimeRoot: RUNTIME_ROOT_DIR,
    productsDir: PRODUCTS_DIR,
    checks,
    session: sessionSummary,
    products,
    nextSteps,
    reliabilityRules: [
      '优先使用 `thread send`。',
      '长时间运行前先执行 `watch prime`，正式运行时只保留一个 `watch run`。',
      '搜索命中 412、消息命中 403 或 352 时先退避，再考虑刷新会话或降低频率。',
      '命中发送冷却时不要绕过限制重复发送，优先等待用户回复或继续处理别的线程。',
    ],
    recommendedFlows: [
      {
        goal: '首次初始化',
        command: 'node scripts/bili.js init start --runtime-root <绝对路径> --reset true',
      },
      {
        goal: '建一个产品',
        command: 'node scripts/bili.js product setup --title "<产品名>" --intro "<介绍>" ...',
      },
      {
        goal: '先看推广预算',
        command: 'node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme candidate-pool-v1',
      },
      {
        goal: '先建候选池',
        command: 'node scripts/bili.js candidate collect --product "<slug>" --target-count 30',
      },
    ],
  };
}

function pathJoin(...parts) {
  return require('path').join(...parts);
}

function buildWorkflow(goal = '') {
  const normalized = String(goal || 'default').trim().toLowerCase();
  const base = {
    generatedAt: new Date().toISOString(),
    goal: normalized || 'default',
    note: '优先使用高层命令，不要一开始就猜测未记录的入口。',
  };

  if (['setup', 'init', 'login'].includes(normalized)) {
    return {
      ...base,
      title: '初始化与登录',
      summary: '先检查环境，再完成二维码登录，再确认产品资料目录。',
      steps: [
        '执行 `node scripts/bili.js system doctor` 查看当前缺口。',
        '首次使用时优先执行 `node scripts/bili.js init start --runtime-root <绝对路径> --reset true` 初始化运行目录。',
        '执行 `node scripts/bili.js auth qr-generate`，优先使用返回的本地二维码文件扫码。',
        '扫码后执行 `node scripts/bili.js auth qr-poll` 写入 cookie 和 refresh_token。',
        '执行 `node scripts/bili.js product setup --title "你的产品名" --intro "<介绍>" ...` 初始化产品目录。',
        '执行 `node scripts/bili.js product doctor --slug "<slug>"` 检查资料是否够 agent 用。',
        '执行 `node scripts/bili.js candidate collect --product "<slug>" --target-count 30` 建立候选池。',
      ],
      suggestedCommands: [
        'node scripts/bili.js init start --runtime-root <绝对路径> --reset true',
        'node scripts/bili.js system doctor',
        'node scripts/bili.js auth qr-generate',
        'node scripts/bili.js auth qr-poll',
        'node scripts/bili.js product setup --title "你的产品名" --intro "<介绍>" ...',
        'node scripts/bili.js candidate collect --product "<slug>" --target-count 30',
      ],
    };
  }

  if (['monitor', 'watch', 'inbox'].includes(normalized)) {
    return {
      ...base,
      title: '监听与收件箱',
      summary: '先建立增量基线，再持续轮询消息，优先处理高热度会话。',
      steps: [
        '第一次运行先执行 `node scripts/bili.js watch prime`，避免把历史消息当新增。',
        '执行 `node scripts/bili.js watch run --interval-sec 90 --iterations 0` 持续监听。',
        '执行 `node scripts/bili.js inbox unread` 先看未读摘要，再决定是否拉详情。',
        '执行 `node scripts/bili.js inbox replies` 或 `node scripts/bili.js inbox dm-sessions` 查看明确的评论回复 / 私信入口。',
        '执行 `node scripts/bili.js inbox list` 查看当前最值得继续聊的会话。',
        '优先处理 recommendedChannel 为 dm、并且 unreadDmCount > 0 的线程。',
      ],
      suggestedCommands: [
        'node scripts/bili.js watch prime',
        'node scripts/bili.js watch run --interval-sec 90 --iterations 0',
        'node scripts/bili.js watch state',
        'node scripts/bili.js inbox unread',
        'node scripts/bili.js inbox replies',
        'node scripts/bili.js inbox dm-sessions',
        'node scripts/bili.js inbox list',
      ],
    };
  }

  if (['reply', 'continue', 'chat'].includes(normalized)) {
    return {
      ...base,
      title: '续聊与回复',
      summary: '先拿线程上下文，再出草稿，再由统一发送入口发出。',
      steps: [
        '执行 `node scripts/bili.js thread continue --mid <mid> [--product <slug>]` 拉上下文。',
        '执行 `node scripts/bili.js thread draft --mid <mid> [--product <slug>]` 出草稿。',
        '确认推荐渠道是评论还是私信。',
        '执行 `node scripts/bili.js thread send ... --yes` 发送；如果命中冷却，先继续等待回复。',
      ],
      suggestedCommands: [
        'node scripts/bili.js thread continue --mid <mid> --product "<slug>"',
        'node scripts/bili.js thread draft --mid <mid> --product "<slug>"',
        'node scripts/bili.js thread send --channel dm --mid <mid> --content "<text>" --yes',
      ],
    };
  }

  if (['promote', 'outreach', 'campaign'].includes(normalized)) {
    return {
      ...base,
      title: '推广任务主流程',
      summary: '产品资料、监听、收件箱、续聊、发送，统一走高层链路。',
      steps: [
        '先用 `campaign plan` 看这次时长下的预算和节奏。',
        '确认产品资料完整：`product doctor` / `product summarize`。',
        '正式执行前先准备候选池，避免 campaign 运行时频繁 live search。',
        '执行 `campaign run` 只创建 campaign 上下文，真正下一步先看 `campaign next`。',
        '建立监听基线并启动 `watch run`。',
        '先通过 `inbox unread --product <slug>` 看未读摘要，再决定是否进入 `inbox replies` / `inbox dm-sessions` / `inbox list`。',
        '如果要执行公开动作，统一走 `thread send --channel comment --campaign "<campaign_id>" ...`。',
        '对具体用户执行 `thread continue` -> `thread draft` -> `thread send`。',
        '通过 `campaign status`、`trace recent` 和 `thread get --mid <mid>` 复盘执行过程。',
      ],
      suggestedCommands: [
        'node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme candidate-pool-v1',
        'node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme candidate-pool-v1',
        'node scripts/bili.js campaign next --id "<campaign_id>"',
        'node scripts/bili.js product summarize --slug "<slug>"',
        'node scripts/bili.js candidate collect --product "<slug>" --target-count 30',
        'node scripts/bili.js watch run --interval-sec 90 --iterations 0',
        'node scripts/bili.js inbox unread --product "<slug>"',
        'node scripts/bili.js inbox list --product "<slug>"',
        'node scripts/bili.js campaign status --id "<campaign_id>"',
      ],
    };
  }

  if (['stable', 'production', 'reliable'].includes(normalized)) {
    return {
      ...base,
      title: '稳定运行主流程',
      summary: '把登录、候选池、监听、收件箱、续聊和复盘串成一条可持续运行的主链路。',
      steps: [
        '先执行 `node scripts/bili.js system doctor`，确认 cookie、产品资料和运行目录都已就绪。',
        '执行 `node scripts/bili.js watch prime` 建立增量基线，只做一次。',
        '执行 `node scripts/bili.js candidate collect --product "<slug>" --target-count 30` 准备候选池。',
        '执行 `node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme candidate-pool-v1` 创建 campaign 上下文。',
        '执行 `node scripts/bili.js campaign next --id "<campaign_id>"`，判断现在该切候选视频、继续当前视频，还是先回 inbox。',
        '执行 `node scripts/bili.js watch run --interval-sec 90 --iterations 0` 持续监听，只保留一个 watcher。',
        '先执行 `node scripts/bili.js inbox unread --product "<slug>"` 看未读摘要，再执行 `inbox replies` / `inbox dm-sessions` / `inbox list`。',
        '如果要执行公开动作，走 `thread send --channel comment --campaign "<campaign_id>" ...`；不要把 `campaign run` 当成发送命令。',
        '对具体线程走 `thread continue` -> `thread draft` -> `thread send`。',
        '定期执行 `node scripts/bili.js watch state`、`node scripts/bili.js inbox unread --product "<slug>"`、`node scripts/bili.js campaign status --id "<campaign_id>"`、`node scripts/bili.js trace recent --limit 20` 做巡检。',
      ],
      suggestedCommands: [
        'node scripts/bili.js system doctor',
        'node scripts/bili.js watch prime',
        'node scripts/bili.js candidate collect --product "<slug>" --target-count 30',
        'node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme candidate-pool-v1',
        'node scripts/bili.js campaign next --id "<campaign_id>"',
        'node scripts/bili.js watch run --interval-sec 90 --iterations 0',
        'node scripts/bili.js inbox unread --product "<slug>"',
        'node scripts/bili.js inbox list --product "<slug>"',
      ],
      guardrails: [
        '只保留一个 `watch run` 实例。',
        '优先高层命令，低层命令只做兜底。',
        '发送命中冷却或风控时先退避，不要硬发。',
        '复盘优先看 `trace recent`、`watch state`、`campaign status`。',
      ],
    };
  }

  return {
    ...base,
    title: '默认工作流',
    summary: '优先走高层入口：doctor/onboard -> inbox -> thread continue -> thread draft -> thread send。',
    steps: [
      '执行 `node scripts/bili.js system onboard` 看当前环境和下一步。',
      '执行 `node scripts/bili.js inbox unread` 看未读摘要。',
      '执行 `node scripts/bili.js inbox list` 看有哪些值得处理的线程。',
      '对具体用户执行 `thread continue` 和 `thread draft`。',
      '最后用 `thread send` 发出，不要优先绕到底层 dm/comment 命令。',
    ],
    suggestedCommands: [
      'node scripts/bili.js system onboard',
      'node scripts/bili.js inbox unread',
      'node scripts/bili.js inbox list',
      'node scripts/bili.js thread continue --mid <mid>',
      'node scripts/bili.js thread draft --mid <mid>',
    ],
  };
}

function buildOnboardText() {
  const status = buildSetupStatus();
  const workflow = buildWorkflow('default');
  const lines = [];
  lines.push('Bilibili skill 当前状态：');
  for (const check of status.checks) {
    lines.push(`- ${check.ok ? '已完成' : '未完成'}：${check.label} (${check.detail})`);
    if (!check.ok && check.fix) {
      lines.push(`  建议：${check.fix}`);
    }
  }
  if (status.nextSteps.length) {
    lines.push('下一步建议：');
    for (const step of status.nextSteps) {
      lines.push(`- ${step}`);
    }
  }
  if (status.recommendedFlows?.length) {
    lines.push('推荐用法：');
    for (const item of status.recommendedFlows) {
      lines.push(`- ${item.goal}：${item.command}`);
    }
  }
  if (workflow.steps?.length) {
    lines.push('默认工作流：');
    for (const step of workflow.steps) {
      lines.push(`- ${step}`);
    }
  }
  return {
    text: lines.join('\n'),
    status,
    workflow,
  };
}

module.exports = {
  buildSetupStatus,
  buildOnboardText,
  buildWorkflow,
};
