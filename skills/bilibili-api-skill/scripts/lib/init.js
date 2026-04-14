'use strict';

const fs = require('fs');
const path = require('path');
const {
  BUNDLED_CONFIG_DIR,
  RUNTIME_ROOT_DIR,
  RUNTIME_CONFIG_PATH,
  buildRuntimePaths,
  writeRuntimeConfig,
  ensureDir,
  writeJson,
  readJson,
} = require('./config');

const DEFAULT_SETTINGS = {
  sendMode: 'confirm',
  autoSendMaxRisk: 'low',
  draftCount: 3,
  defaultChannel: 'dm',
  sendMinGapSec: 600,
  publicCommentMinGapSec: 180,
  publicCommentMaxPerHour: 20,
  publicReplyMaxPerHour: 100,
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

function removeDirIfExists(target) {
  if (!target || !fs.existsSync(target)) {
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
  if (fs.existsSync(target)) {
    throw new Error(`未能清空运行目录：${target}`);
  }
}

function buildInitBundle(runtimeRoot) {
  const paths = buildRuntimePaths(runtimeRoot);
  return {
    runtimeRoot: paths.runtimeRoot,
    config: paths.configDir,
    cache: paths.cacheDir,
    data: paths.dataDir,
    tasks: paths.tasksDir,
    products: paths.productsDir,
    playbooks: paths.playbooksDir,
  };
}

function writeDefaultFiles(runtimeRoot) {
  const paths = buildRuntimePaths(runtimeRoot);
  Object.values(buildInitBundle(runtimeRoot)).forEach((dir) => ensureDir(dir));
  writeJson(paths.credentialsPath, {});
  writeJson(paths.secretsPath, {});
  writeJson(paths.sessionPath, {});
  writeJson(paths.settingsPath, DEFAULT_SETTINGS);
}

function seedSchemeOnePlaybook(runtimeRoot) {
  const paths = buildRuntimePaths(runtimeRoot);
  const dir = path.join(paths.playbooksDir, '方案一-广撒网引流');
  ensureDir(dir);
  writeJson(path.join(dir, 'playbook.json'), {
    title: '方案一-广撒网引流',
    category: 'campaign',
    objective: '按固定节奏搜索相关热门视频，先做公开评论，再按意向分层回复评论和私信，持续检查回复并尽快转群。',
    channels: ['comment', 'dm'],
    watch: {
      enable: true,
      intervalSec: 180,
      primeOnStart: true,
    },
    execution: {
      defaultEntry: 'campaign',
      preferredChannel: 'comment',
      requireDraftBeforeSend: true,
    },
    slug: '方案一-广撒网引流',
  });
  fs.writeFileSync(
    path.join(dir, 'strategy.md'),
    '# 方案一-广撒网引流\n\n- 每 2 分钟找 1 个相关热门视频候选。\n- 每个视频先发 1 条主评论。\n- 先判断评论区质量和与产品的相关度，再决定是否继续停留。\n- 高质量评论区可以停留更久，持续回复更多高意向评论。\n- 同一个视频里连续回复不同评论时，至少间隔 20 秒。\n- 从一个视频切到下一个视频前，至少等待 1 到 2 分钟。\n- 高意向：回复评论 + 可直接私信。\n- 中意向：只回复评论。\n- 每 3 分钟检查一次私信和评论回复。\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'guardrails.md'),
    '# Guardrails\n\n- 带 campaign 的公开动作按 campaign 自己的预算和节奏运行；不带 campaign 时，才走全局公开护栏。\n- 所有公开评论和回复都必须保留间隔，且优先短句真人风格。\n- 公开区不直接发群链接或二维码。\n- 私信优先先聊 1 到 2 轮，再发群入口。\n- 新用户首次运行时，先做小规模测试，不要一上来把预算打满。\n- 评论区质量高时允许多停留，但不要突破单视频内 20 秒回复间隔。\n- 从当前视频切换到下一个视频前，至少保留 1 到 2 分钟缓冲。\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'prompts.md'),
    '# Prompt Hints\n\n- 先判断用户意向强弱再决定公开回复还是私信。\n- 公开区回复要像 B 站真人，不像销售模板。\n- 私信尽量快进入有效沟通，并尽早给群入口。\n',
    'utf8'
  );
}

function initSkill({ runtimeRoot = '', reset = false }) {
  const targetRoot = runtimeRoot ? path.resolve(runtimeRoot) : RUNTIME_ROOT_DIR;
  if (reset) {
    removeDirIfExists(targetRoot);
  }
  writeRuntimeConfig({ runtimeRoot: targetRoot });
  writeDefaultFiles(targetRoot);
  seedSchemeOnePlaybook(targetRoot);
  return {
    runtimeConfigPath: RUNTIME_CONFIG_PATH,
    runtimeRoot: targetRoot,
    paths: buildInitBundle(targetRoot),
    profile: {
      mode: 'safe-default',
      note: '首次初始化默认使用保守频率和 confirm 发送模式，先确保稳定性。',
      settings: DEFAULT_SETTINGS,
    },
    nextSteps: [
      '先执行 `node scripts/bili.js auth qr-generate` 扫码登录 B 站账号。',
      '扫码后执行 `node scripts/bili.js auth qr-poll`，确认 cookie 和 refresh_token 已写入。',
      '再执行 `node scripts/bili.js product setup --title "<产品名>" --intro "<介绍>" ...` 建立产品资料。',
      '然后执行 `node scripts/bili.js product doctor --slug "<slug>"` 检查产品是否可用于推广。',
      '正式推广前先执行 `node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme scheme1` 看预算，再决定是否启动。',
      '最后执行 `node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme scheme1` 发起推广。',
    ],
    operatorGuidance: [
      '首次使用不要直接批量发评论或私信，先看 campaign plan 和当前默认节流。',
      '默认优先使用高层命令：campaign、task、watch、inbox、thread。',
      '如果要切回别的运行目录，再次执行 init start 指定新的 runtime-root 即可。',
    ],
  };
}

function getInitStatus() {
  const persisted = readJson(RUNTIME_CONFIG_PATH, {});
  const currentRoot = persisted.runtimeRoot || RUNTIME_ROOT_DIR;
  const paths = buildRuntimePaths(currentRoot);
  return {
    runtimeConfigPath: RUNTIME_CONFIG_PATH,
    currentRuntimeRoot: currentRoot,
    initialized: fs.existsSync(currentRoot),
    paths: buildInitBundle(currentRoot),
    hasCredentials: fs.existsSync(paths.credentialsPath),
    hasProductsDir: fs.existsSync(paths.productsDir),
    hasPlaybooksDir: fs.existsSync(paths.playbooksDir),
    hint: '新用户首次使用时，先执行 `node scripts/bili.js init start --runtime-root <绝对路径> --reset true`。',
    recommendedSequence: [
      'node scripts/bili.js init start --runtime-root <绝对路径> --reset true',
      'node scripts/bili.js auth qr-generate',
      'node scripts/bili.js auth qr-poll',
      'node scripts/bili.js product setup --title "<产品名>" --intro "<介绍>" ...',
      'node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme scheme1',
    ],
  };
}

module.exports = {
  initSkill,
  getInitStatus,
};
