'use strict';

const fs = require('fs');
const path = require('path');
const { TASKS_DIR, ensureDir, readJson, writeJson } = require('./config');
const { CliError } = require('./errors');
const { summarizeProduct } = require('./products');
const { getPlaybook, listPlaybooks } = require('./playbooks');
const { buildWorkflow } = require('./doctor');
const { readEngagementSettings } = require('./engagement');

const TASK_INDEX_PATH = path.join(TASKS_DIR, 'index.json');

function ensureTasksDir() {
  ensureDir(TASKS_DIR);
  return TASKS_DIR;
}

function taskFilePath(id) {
  ensureTasksDir();
  return path.join(TASKS_DIR, `${id}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function makeTaskId({ productSlug, playbookSlug }) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `task-${productSlug}-${playbookSlug}-${stamp}`;
}

function buildTaskPhases({ productSlug, playbook }) {
  const watchInterval = Number(playbook.meta?.watch?.intervalSec || 90);
  return [
    {
      id: 'prepare',
      title: '准备上下文',
      status: 'pending',
      actions: [
        `node scripts/bili.js product summarize --slug "${productSlug}"`,
        `node scripts/bili.js playbook get --slug "${playbook.slug}"`,
      ],
    },
    {
      id: 'monitor',
      title: '建立监听',
      status: 'pending',
      actions: playbook.meta?.watch?.enable
        ? [
            playbook.meta?.watch?.primeOnStart ? 'node scripts/bili.js watch prime' : '按当前状态直接继续 watch',
            `node scripts/bili.js watch run --interval-sec ${watchInterval} --iterations 0`,
          ]
        : ['当前模板未启用 watch，可按需手动执行 inbox list。'],
    },
    {
      id: 'triage',
      title: '筛选待处理会话',
      status: 'pending',
      actions: [
        `node scripts/bili.js inbox list --product "${productSlug}"`,
        '优先选择 recommendedChannel 与模板偏好渠道一致、并且存在未读或最近互动的线程。',
      ],
    },
    {
      id: 'engage',
      title: '续聊与发送',
      status: 'pending',
      actions: [
        `node scripts/bili.js thread continue --mid <mid> --product "${productSlug}"`,
        `node scripts/bili.js thread draft --mid <mid> --product "${productSlug}"`,
        `node scripts/bili.js thread send --channel ${playbook.meta?.execution?.preferredChannel || 'dm'} --mid <mid> --product "${productSlug}" --content "<text>" --yes`,
      ],
    },
    {
      id: 'review',
      title: '复盘与巡检',
      status: 'pending',
      actions: [
        'node scripts/bili.js trace recent --limit 20',
        'node scripts/bili.js watch state',
        'node scripts/bili.js thread get --mid <mid>',
      ],
    },
  ];
}

function loadContext({ productSlug, playbookSlug }) {
  const product = summarizeProduct(productSlug);
  if (!product) {
    throw new CliError(
      `未找到产品资料：${productSlug}`,
      1,
      { productSlug },
      '先执行 `node scripts/bili.js product list` 查看产品，或执行 `node scripts/bili.js product init --title "你的产品名"` 初始化。'
    );
  }
  const playbook = getPlaybook(playbookSlug);
  if (!playbook) {
    throw new CliError(
      `未找到任务模板：${playbookSlug}`,
      1,
      {
        playbookSlug,
        available: listPlaybooks().map((item) => item.slug),
      },
      '先执行 `node scripts/bili.js playbook list` 查看模板，或执行 `node scripts/bili.js playbook init-defaults` 初始化。'
    );
  }
  return { product, playbook };
}

function buildTaskPlan({ productSlug, playbookSlug }) {
  const { product, playbook } = loadContext({ productSlug, playbookSlug });
  const workflow = buildWorkflow('promote');
  const settings = readEngagementSettings();
  const preferredChannel = playbook.meta?.execution?.preferredChannel || settings.defaultChannel || 'dm';

  return {
    generatedAt: nowIso(),
    product: {
      slug: product.slug,
      title: product.title,
      path: product.path,
      readiness: product.readiness,
    },
    playbook: {
      slug: playbook.slug,
      title: playbook.meta?.title || playbook.slug,
      path: playbook.path,
      meta: playbook.meta,
      strategy: playbook.strategy,
      guardrails: playbook.guardrails,
      prompts: playbook.prompts,
    },
    execution: {
      preferredChannel,
      requireDraftBeforeSend: Boolean(playbook.meta?.execution?.requireDraftBeforeSend),
      watchEnabled: Boolean(playbook.meta?.watch?.enable),
      watchIntervalSec: Number(playbook.meta?.watch?.intervalSec || 90),
      sendMode: settings.sendMode,
    },
    workflow,
    phases: buildTaskPhases({ productSlug: product.slug, playbook }),
    preferredEntrySequence: [
      'node scripts/bili.js system doctor',
      playbook.meta?.watch?.primeOnStart ? 'node scripts/bili.js watch prime' : '按当前状态继续 watch',
      `node scripts/bili.js task run --product "${product.slug}" --playbook "${playbook.slug}"`,
      playbook.meta?.watch?.enable
        ? `node scripts/bili.js watch run --interval-sec ${Number(playbook.meta?.watch?.intervalSec || 90)} --iterations 0`
        : `node scripts/bili.js inbox list --product "${product.slug}"`,
      `node scripts/bili.js inbox list --product "${product.slug}"`,
    ],
    healthChecks: [
      'watch 是否只有一个实例在运行',
      'watch state 是否存在连续失败或退避',
      'trace recent 是否出现持续 403/352/412',
      'thread send 是否经常命中 cooldown，若是则放缓节奏',
    ],
    reliabilityRules: [
      '优先高层命令：inbox、thread、task、watch。',
      '发送前优先出草稿，命中冷却时不强发。',
      '风控或鉴权错误优先退避、刷新会话、降低频率。',
      '同一任务周期内避免多个 agent 同时操作同一账号。',
    ],
    nextSteps: [
      product.readiness.ready
        ? '产品资料已具备基础可用性，可以直接按模板执行。'
        : '先补齐产品资料缺口，再启动正式推广任务。',
      '优先让 agent 按模板走高层链路，不要一上来直接调用底层 dm/comment 接口。',
      '正式发送前优先使用 thread draft；命中发送冷却时继续等待回复。',
    ],
  };
}

function readTask(id) {
  return readJson(taskFilePath(id), null);
}

function writeTask(task) {
  ensureTasksDir();
  writeJson(taskFilePath(task.id), task);
  return task;
}

function readTaskIndex() {
  return readJson(TASK_INDEX_PATH, { items: [] });
}

function writeTaskIndex(data) {
  ensureTasksDir();
  writeJson(TASK_INDEX_PATH, data);
  return data;
}

function upsertTaskIndex(task) {
  const db = readTaskIndex();
  const items = Array.isArray(db.items) ? db.items : [];
  const index = items.findIndex((item) => item.id === task.id);
  const summary = {
    id: task.id,
    productSlug: task.product.slug,
    playbookSlug: task.playbook.slug,
    status: task.status,
    currentPhaseId: task.currentPhaseId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    path: taskFilePath(task.id),
  };
  if (index >= 0) {
    items[index] = summary;
  } else {
    items.push(summary);
  }
  writeTaskIndex({ items });
  return summary;
}

function listTasks() {
  return readTaskIndex().items || [];
}

function buildTaskRun({ productSlug, playbookSlug }) {
  const plan = buildTaskPlan({ productSlug, playbookSlug });
  const id = makeTaskId({ productSlug, playbookSlug });
  const createdAt = nowIso();
  const task = {
    id,
    status: 'prepared',
    createdAt,
    updatedAt: createdAt,
    currentPhaseId: plan.phases[0]?.id || '',
    product: plan.product,
    playbook: {
      slug: plan.playbook.slug,
      title: plan.playbook.title,
      path: plan.playbook.path,
      meta: plan.playbook.meta,
    },
    execution: plan.execution,
    phases: plan.phases,
    workflow: plan.workflow,
    preferredEntrySequence: plan.preferredEntrySequence,
    healthChecks: plan.healthChecks,
    reliabilityRules: plan.reliabilityRules,
    nextSteps: plan.nextSteps,
    operatorGuidance: {
      preferredLoop: 'doctor -> task run -> watch run -> inbox list -> thread continue -> thread draft -> thread send',
      whenBlocked: [
        '命中发送冷却：继续等待用户回复，或切换处理别的线程。',
        '命中 403/352：先看 watch state 和 trace recent，必要时 refresh 会话并降低频率。',
        '命中 412：降低搜索频率，缩小关键词范围，稍后重试。',
      ],
      avoid: [
        '不要并发启动多个 watch run。',
        '不要长期绕过 thread send 直接调底层发送接口。',
        '不要在产品资料不完整时直接自动化批量触达。',
      ],
    },
    note: '当前 task run 会创建一个可追踪的任务实例，后续可查看状态并手动推进阶段。',
    activity: [
      {
        ts: createdAt,
        type: 'task_created',
        message: `任务已创建：${plan.product.slug} / ${plan.playbook.slug}`,
      },
    ],
    entryCommands: [
      ...plan.phases[0].actions,
      ...plan.phases[1].actions,
      ...plan.phases[2].actions,
    ],
  };
  writeTask(task);
  upsertTaskIndex(task);
  return task;
}

function taskStatusUpdate({ id, phaseId, status, note = '' }) {
  const task = readTask(id);
  if (!task) {
    throw new CliError(`未找到任务实例：${id}`, 1, { id }, '先执行 `node scripts/bili.js task list` 查看已有任务。');
  }
  const allowed = new Set(['prepared', 'running', 'paused', 'completed']);
  if (status && !allowed.has(status)) {
    throw new CliError('不支持的任务状态，请使用 prepared、running、paused、completed。');
  }
  if (phaseId) {
    task.phases = (task.phases || []).map((phase) => {
      if (phase.id === phaseId) {
        return {
          ...phase,
          status: status === 'completed' ? 'completed' : 'in_progress',
        };
      }
      if (phase.status === 'in_progress' && phase.id !== phaseId && status !== 'completed') {
        return {
          ...phase,
          status: 'pending',
        };
      }
      return phase;
    });
    task.currentPhaseId = phaseId;
  }
  if (status) {
    task.status = status;
  }
  task.updatedAt = nowIso();
  if (note) {
    task.activity = [
      ...(task.activity || []),
      {
        ts: task.updatedAt,
        type: 'status_update',
        message: note,
      },
    ].slice(-100);
  }
  writeTask(task);
  upsertTaskIndex(task);
  return task;
}

function buildTaskStatus(id) {
  const task = readTask(id);
  if (!task) {
    throw new CliError(`未找到任务实例：${id}`, 1, { id }, '先执行 `node scripts/bili.js task list` 查看已有任务。');
  }
  return task;
}

module.exports = {
  ensureTasksDir,
  buildTaskPlan,
  buildTaskRun,
  buildTaskStatus,
  taskStatusUpdate,
  listTasks,
};
