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
const { DEFAULT_SETTINGS } = require('./engagement');

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
    videoPools: paths.videoPoolsDir,
    products: paths.productsDir,
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

function removeUnexpectedRuntimeArtifacts(runtimeRoot) {
  const paths = buildRuntimePaths(runtimeRoot);
  const allowedRootNames = new Set(['config', 'cache', 'data', 'products']);
  const allowedDataNames = new Set(['campaigns', 'video-pools']);

  try {
    const rootEntries = fs.readdirSync(paths.runtimeRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (allowedRootNames.has(entry.name)) {
        continue;
      }
      fs.rmSync(path.join(paths.runtimeRoot, entry.name), { recursive: true, force: true });
    }
  } catch {}

  try {
    const dataEntries = fs.readdirSync(paths.dataDir, { withFileTypes: true });
    for (const entry of dataEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (allowedDataNames.has(entry.name)) {
        continue;
      }
      fs.rmSync(path.join(paths.dataDir, entry.name), { recursive: true, force: true });
    }
  } catch {}
}

function initSkill({ runtimeRoot = '', reset = false }) {
  const targetRoot = runtimeRoot ? path.resolve(runtimeRoot) : RUNTIME_ROOT_DIR;
  if (reset) {
    removeDirIfExists(targetRoot);
  }
  writeRuntimeConfig({ runtimeRoot: targetRoot });
  writeDefaultFiles(targetRoot);
  removeUnexpectedRuntimeArtifacts(targetRoot);
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
      '正式引流前先执行 `node scripts/bili.js candidate collect --product "<slug>" --target-count 30` 建立候选池。',
      '正式推广前先执行 `node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme candidate-pool-v1` 看预算，再决定是否启动。',
      '然后执行 `node scripts/bili.js campaign run --product "<slug>" --hours 3 --scheme candidate-pool-v1` 创建 campaign 上下文。',
      '最后执行 `node scripts/bili.js campaign next --id "<campaign_id>"`，再决定是否 `candidate next`、`inbox unread` 或 `thread send --channel comment --campaign ...`。',
    ],
    operatorGuidance: [
      '首次使用不要直接批量发评论或私信，先看 campaign plan 和当前默认节流。',
      '默认优先使用高层命令：campaign、watch、inbox、thread。',
      '跟进模块里先看 `inbox unread` / `inbox replies` / `inbox dm-sessions`，不要一上来就自己猜有没有未读。',
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
    hint: '新用户首次使用时，先执行 `node scripts/bili.js init start --runtime-root <绝对路径> --reset true`。',
    recommendedSequence: [
      'node scripts/bili.js init start --runtime-root <绝对路径> --reset true',
      'node scripts/bili.js auth qr-generate',
      'node scripts/bili.js auth qr-poll',
      'node scripts/bili.js product setup --title "<产品名>" --intro "<介绍>" ...',
      'node scripts/bili.js candidate collect --product "<slug>" --target-count 30',
      'node scripts/bili.js campaign plan --product "<slug>" --hours 3 --scheme candidate-pool-v1',
      'node scripts/bili.js inbox unread --product "<slug>"',
    ],
  };
}

module.exports = {
  initSkill,
  getInitStatus,
};
