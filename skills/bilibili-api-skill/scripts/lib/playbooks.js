'use strict';

const fs = require('fs');
const path = require('path');
const { PLAYBOOKS_DIR, ensureDir } = require('./config');

function ensurePlaybooksDir() {
  ensureDir(PLAYBOOKS_DIR);
  return PLAYBOOKS_DIR;
}

function safeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJsonIfExists(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function listPlaybooks() {
  ensurePlaybooksDir();
  const entries = fs.readdirSync(PLAYBOOKS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return entries.map((entry) => {
    const dir = path.join(PLAYBOOKS_DIR, entry.name);
    const meta = readJsonIfExists(path.join(dir, 'playbook.json'));
    return {
      slug: entry.name,
      title: meta.title || entry.name,
      path: dir,
      category: meta.category || 'generic',
      objective: meta.objective || '',
      channels: Array.isArray(meta.channels) ? meta.channels : [],
      files: fs.readdirSync(dir).sort(),
    };
  });
}

function getPlaybook(slug) {
  ensurePlaybooksDir();
  const dir = path.join(PLAYBOOKS_DIR, slug);
  if (!fs.existsSync(dir)) {
    return null;
  }
  const meta = readJsonIfExists(path.join(dir, 'playbook.json'));
  return {
    slug,
    path: dir,
    meta,
    strategy: readTextIfExists(path.join(dir, 'strategy.md')),
    guardrails: readTextIfExists(path.join(dir, 'guardrails.md')),
    prompts: readTextIfExists(path.join(dir, 'prompts.md')),
    files: fs.readdirSync(dir).sort(),
  };
}

function playbookPreset(type) {
  const normalized = String(type || 'campaign').trim().toLowerCase();
  if (normalized === 'warmup') {
    return {
      title: '产品冷启动',
      category: 'warmup',
      objective: '先低频观察与轻量互动，避免一上来进入高强度推广。',
      channels: ['comment'],
      watch: {
        enable: true,
        intervalSec: 180,
        primeOnStart: true,
      },
      execution: {
        defaultEntry: 'inbox',
        preferredChannel: 'comment',
        requireDraftBeforeSend: true,
      },
    };
  }
  if (normalized === 'comment') {
    return {
      title: '评论区引流',
      category: 'comment',
      objective: '优先从评论区发现和跟进高意向用户，再判断是否引导到私信。',
      channels: ['comment', 'dm'],
      watch: {
        enable: true,
        intervalSec: 90,
        primeOnStart: true,
      },
      execution: {
        defaultEntry: 'inbox',
        preferredChannel: 'comment',
        requireDraftBeforeSend: true,
      },
    };
  }
  if (normalized === 'dm') {
    return {
      title: '私信转化',
      category: 'dm',
      objective: '优先处理私信会话与回复，把高意向用户推进到更深入的一对一沟通。',
      channels: ['dm'],
      watch: {
        enable: true,
        intervalSec: 60,
        primeOnStart: true,
      },
      execution: {
        defaultEntry: 'inbox',
        preferredChannel: 'dm',
        requireDraftBeforeSend: true,
      },
    };
  }
  if (normalized === 'revive') {
    return {
      title: '沉默用户唤醒',
      category: 'revive',
      objective: '对历史上有过互动、但近期沉默的用户做低频、克制的再次触达。',
      channels: ['dm'],
      watch: {
        enable: true,
        intervalSec: 240,
        primeOnStart: false,
      },
      execution: {
        defaultEntry: 'inbox',
        preferredChannel: 'dm',
        requireDraftBeforeSend: true,
      },
    };
  }
  return {
    title: '综合推广',
    category: 'campaign',
    objective: '围绕指定产品持续监听评论和私信，跟进高意向用户，并统一通过 thread 流程回复。',
    channels: ['comment', 'dm'],
    watch: {
      enable: true,
      intervalSec: 90,
      primeOnStart: true,
    },
    execution: {
      defaultEntry: 'inbox',
      preferredChannel: 'dm',
      requireDraftBeforeSend: true,
    },
  };
}

function initDefaultPlaybooks() {
  const presets = [
    { title: '产品冷启动', type: 'warmup' },
    { title: '评论区引流', type: 'comment' },
    { title: '私信转化', type: 'dm' },
    { title: '综合推广', type: 'campaign' },
    { title: '沉默用户唤醒', type: 'revive' },
  ];
  return presets.map((item) => initPlaybook(item));
}

function initPlaybook({ slug, title, type }) {
  ensurePlaybooksDir();
  const preset = playbookPreset(type);
  const finalSlug = safeSlug(slug || title || preset.title);
  const dir = path.join(PLAYBOOKS_DIR, finalSlug);
  ensureDir(dir);
  const meta = {
    ...preset,
    title: title || preset.title,
    slug: finalSlug,
  };
  const files = {
    'playbook.json': JSON.stringify(meta, null, 2) + '\n',
    'strategy.md': `# ${meta.title}\n\n## 目标\n\n${meta.objective}\n\n## 执行顺序\n\n1. 先确认产品资料完整。\n2. 建立 watch 基线并持续监听。\n3. 用 inbox 选出值得处理的会话。\n4. 用 thread continue -> thread draft -> thread send 完成跟进。\n`,
    'guardrails.md': `# Guardrails\n\n- 不要跳过产品资料直接硬推。\n- 不要绕过 thread send 直接批量发私信。\n- 命中发送冷却时优先等待，不要频繁强制 ignore-cooldown。\n- 涉及价格、强承诺、外链或导流时先人工确认。\n`,
    'prompts.md': `# Prompt Hints\n\n- 先判断这个用户当前表达的是提问、兴趣、质疑还是闲聊。\n- 回复时优先回应对方最近一句，而不是重复模板。\n- 如果用户兴趣明确，再自然引导到更深入沟通或私信。\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
  return getPlaybook(finalSlug);
}

module.exports = {
  ensurePlaybooksDir,
  listPlaybooks,
  getPlaybook,
  initPlaybook,
  initDefaultPlaybooks,
};
