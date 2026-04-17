'use strict';

const fs = require('fs');
const path = require('path');
const { CliError } = require('../errors');
const { nowIso } = require('../output');
const { ensureDir, exists, readJson, writeJson, readText, writeText, uniqueId, copyFile } = require('../runtime/files');
const { loadRuntimeTemplate, renderTemplate } = require('../runtime/templates');
const { getCapability, getStrategy } = require('./catalog');
const { findTaskDir } = require('../runtime/bootstrap');

const TERMINAL_STAGE_STATUSES = new Set(['completed', 'blocked', 'failed']);
const RECONCILE_STAGE_STATUSES = new Set(['completed', 'in_progress', 'blocked', 'failed']);

function getCurrentStage(state) {
  return state.stages[state.currentStageIndex] || null;
}

function renderSection(value, fallback = '- 暂无') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function renderList(items, fallback = '- 暂无') {
  if (!Array.isArray(items) || !items.length) {
    return fallback;
  }
  return items.map((item) => `- ${item}`).join('\n');
}

function buildStageChecklist(stages) {
  return stages
    .map((stage) => {
      const checked = stage.status === 'completed' ? 'x' : ' ';
      const review = stage.reviewRequired ? `, review=${stage.reviewApproved ? 'approved' : 'pending'}` : '';
      return `- [${checked}] ${stage.title} (\`${stage.id}\`) - ${stage.status}${review}`;
    })
    .join('\n');
}

function appendWorklog(taskDir, line) {
  const logPath = path.join(taskDir, 'WORKLOG.md');
  const current = readText(logPath, '');
  writeText(logPath, `${current.trimEnd()}\n- \`${nowIso()}\` ${line}\n`);
}

function readTaskState(taskDir) {
  const statePath = path.join(taskDir, 'task-state.json');
  const state = readJson(statePath, null);
  if (!state) {
    throw new CliError(`任务状态文件不存在: ${statePath}`);
  }
  return state;
}

function writeTaskState(paths, taskDir, state) {
  const statePath = path.join(taskDir, 'task-state.json');
  const currentStage = getCurrentStage(state);
  state.updatedAt = nowIso();
  writeJson(statePath, state);

  const taskMarkdown = renderTemplate(loadRuntimeTemplate(paths, 'task', 'TASK.md.tmpl'), {
    taskTitle: state.title,
    taskId: state.taskId,
    productSlug: state.productSlug,
    strategySlug: state.strategySlug,
    mode: state.mode,
    status: state.status,
    createdAt: state.createdAt,
    goal: state.goal,
    stageChecklist: buildStageChecklist(state.stages),
    currentStageId: currentStage ? currentStage.id : 'completed',
    currentStageNote: currentStage ? currentStage.goal : '任务已完成。',
  });
  writeText(path.join(taskDir, 'TASK.md'), taskMarkdown);
  return state;
}

function normalizeReconcileStatus(result, explicitStatus = '') {
  const value = String(explicitStatus || result.status || '').trim().toLowerCase();
  if (value) {
    if (!RECONCILE_STAGE_STATUSES.has(value)) {
      throw new CliError(`不支持的阶段回写状态: ${value}`);
    }
    return value;
  }
  if (result.completed === true) {
    return 'completed';
  }
  if (result.completed === false) {
    return 'in_progress';
  }
  return '';
}

function createTaskWorkspace({ paths, store, productSlug, strategySlug, title }) {
  const product = store.getProductBySlug(productSlug);
  if (!product) {
    throw new CliError(`产品不存在: ${productSlug}`);
  }

  const strategy = getStrategy(paths, strategySlug);
  if (!strategy) {
    throw new CliError(`策略不存在: ${strategySlug}`);
  }

  const taskId = uniqueId('task');
  const taskTitle = title || `${product.title} - ${strategy.slug}`;
  const productTaskRoot = path.join(product.resource_path, 'tasks');
  const taskDir = path.join(productTaskRoot, taskId);
  ensureDir(taskDir);
  ensureDir(path.join(taskDir, 'outputs'));
  ensureDir(path.join(taskDir, 'delegations'));
  ensureDir(path.join(taskDir, 'reviews'));

  const stages = (strategy.strategy.stages || []).map((stage) => {
    ensureDir(path.join(taskDir, 'outputs', stage.id));
    return {
      id: stage.id,
      title: stage.title,
      type: stage.type,
      capability: stage.capability,
      goal: stage.goal,
      outputKey: stage.outputKey || '',
      promptFocus: stage.promptFocus || '',
      entryCriteria: stage.entryCriteria || [],
      exitCriteria: stage.exitCriteria || [],
      status: 'pending',
      reviewRequired: Boolean(stage.reviewRequired),
      reviewApproved: false,
      reviewFile: '',
      delegation: null,
      outputDir: path.join(taskDir, 'outputs', stage.id),
    };
  });

  const state = {
    taskId,
    title: taskTitle,
    productSlug,
    productId: product.id,
    strategySlug,
    strategyDisplayName: strategy.strategy.displayName || strategy.slug,
    mode: strategy.strategy.mode || 'review-first',
    status: 'active',
    goal: `基于策略 \`${strategy.slug}\` 推进产品 \`${productSlug}\` 的一次完整增长任务。`,
    currentStageIndex: 0,
    paused: false,
    pauseReason: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    strategySections: strategy.sections || {},
    stages,
  };

  writeJson(path.join(taskDir, 'task-spec.json'), {
    productSlug,
    strategySlug,
    strategy: strategy.strategy,
    strategySections: strategy.sections || {},
    createdAt: state.createdAt,
  });

  writeTaskState(paths, taskDir, state);
  const worklog = renderTemplate(loadRuntimeTemplate(paths, 'task', 'WORKLOG.md.tmpl'), {
    taskTitle,
    taskId,
    status: state.status,
    currentStageId: stages[0]?.id || 'completed',
    updatedAt: state.updatedAt,
    createdAt: state.createdAt,
  });
  writeText(path.join(taskDir, 'WORKLOG.md'), worklog);
  appendWorklog(taskDir, `已创建任务：产品 \`${productSlug}\`，策略 \`${strategySlug}\`。`);

  return {
    taskId,
    taskDir,
    state,
  };
}

function locateTask(paths, taskId) {
  const taskDir = findTaskDir(paths, taskId);
  if (!taskDir) {
    throw new CliError(`任务不存在: ${taskId}`);
  }
  return {
    taskDir,
    state: readTaskState(taskDir),
  };
}

function getTaskStatus(paths, taskId) {
  const { taskDir, state } = locateTask(paths, taskId);
  const currentStage = getCurrentStage(state);
  return {
    taskDir,
    state,
    currentStage,
  };
}

function planNextTaskStep(paths, taskId) {
  const { taskDir, state } = locateTask(paths, taskId);
  if (state.paused || state.status === 'paused') {
    return {
      taskDir,
      state,
      decision: {
        kind: 'paused',
        message: `任务当前已暂停：${state.pauseReason || '未填写暂停原因'}`,
      },
    };
  }

  const currentStage = getCurrentStage(state);
  if (!currentStage) {
    return {
      taskDir,
      state,
      decision: {
        kind: 'completed',
        message: '所有阶段均已完成。',
      },
    };
  }

  if (currentStage.type === 'outbound' && currentStage.reviewRequired && !currentStage.reviewApproved) {
    return {
      taskDir,
      state,
      decision: {
        kind: 'review_required',
        stageId: currentStage.id,
        capability: currentStage.capability,
        promptFocus: currentStage.promptFocus || '',
        message: '当前阶段属于首轮外发，继续执行前需要先完成审核。',
      },
    };
  }

  return {
    taskDir,
    state,
    decision: {
      kind: 'execute_stage',
      stageId: currentStage.id,
      capability: currentStage.capability,
      promptFocus: currentStage.promptFocus || '',
      entryCriteria: currentStage.entryCriteria || [],
      exitCriteria: currentStage.exitCriteria || [],
      message: currentStage.goal,
    },
  };
}

function prepareDelegation(paths, taskId, stageId) {
  const { taskDir, state } = locateTask(paths, taskId);
  const currentStage = stageId ? state.stages.find((stage) => stage.id === stageId) : getCurrentStage(state);
  if (!currentStage) {
    throw new CliError(`找不到阶段: ${stageId}`);
  }
  const capability = getCapability(paths, currentStage.capability);
  const strategy = getStrategy(paths, state.strategySlug);
  const delegationId = uniqueId('delegation');
  const filePath = path.join(taskDir, 'delegations', `${delegationId}.md`);
  const content = renderTemplate(loadRuntimeTemplate(paths, 'task', 'DELEGATION.md.tmpl'), {
    delegationId,
    taskId: state.taskId,
    stageId: currentStage.id,
    capabilitySlug: currentStage.capability,
    createdAt: nowIso(),
    scope: currentStage.goal,
    strategyPositioning: renderSection(strategy?.sections?.Positioning),
    strategyWorkingRules: renderSection(strategy?.sections?.['Global Working Rules']),
    strategyPromptGuidance: renderSection(strategy?.sections?.['Prompt Guidance']),
    stagePromptFocus: renderSection(currentStage.promptFocus),
    stageEntryCriteria: renderList(currentStage.entryCriteria),
    stageExitCriteria: renderList(currentStage.exitCriteria),
    capabilityPurpose: renderSection(capability?.sections?.Purpose),
    whenToUse: renderSection(capability?.sections?.['When To Use']),
    preconditions: renderSection(capability?.sections?.Preconditions),
    executionSteps: renderSection(capability?.sections?.['Execution Steps']),
    decisionRules: renderSection(capability?.sections?.['Decision Rules']),
    allowedCommands: (capability?.metadata?.commands || []).map((item) => `- \`${item}\``).join('\n') || '- 暂无',
    doNot: renderSection(capability?.sections?.['Do Not']),
    outputExpectations: renderSection(capability?.sections?.Outputs),
    doneWhen: renderSection(capability?.sections?.['Done When']),
    ifBlocked: renderSection(capability?.sections?.['If Blocked']),
    expectedResult: `请将结果写入 \`outputs/${currentStage.id}/\`，并返回可供 task reconcile 使用的结果文件。`,
  });
  writeText(filePath, content);
  currentStage.status = currentStage.status === 'pending' ? 'in_progress' : currentStage.status;
  currentStage.delegation = {
    delegationId,
    filePath,
    issuedAt: nowIso(),
    status: 'issued',
  };
  writeTaskState(paths, taskDir, state);
  appendWorklog(taskDir, `已为阶段 \`${currentStage.id}\` 生成派工单：\`${path.basename(filePath)}\`。`);
  return {
    taskDir,
    state,
    delegation: currentStage.delegation,
  };
}

function startStageReview(paths, taskId, stageId) {
  const { taskDir, state } = locateTask(paths, taskId);
  const stage = state.stages.find((item) => item.id === stageId);
  if (!stage) {
    throw new CliError(`找不到阶段: ${stageId}`);
  }
  const strategy = getStrategy(paths, state.strategySlug);
  const reviewPath = path.join(taskDir, 'reviews', `${stage.id}-round-1.md`);
  const content = renderTemplate(loadRuntimeTemplate(paths, 'task', 'REVIEW.md.tmpl'), {
    taskId: state.taskId,
    stageId: stage.id,
    strategySlug: state.strategySlug,
    createdAt: nowIso(),
    draftScope: stage.goal,
    stagePromptFocus: renderSection(stage.promptFocus),
    stageEntryCriteria: renderList(stage.entryCriteria),
    stageExitCriteria: renderList(stage.exitCriteria),
    strategyPromptGuidance: renderSection(strategy?.sections?.['Prompt Guidance']),
  });
  writeText(reviewPath, content);
  stage.reviewFile = reviewPath;
  stage.reviewStartedAt = nowIso();
  writeTaskState(paths, taskDir, state);
  appendWorklog(taskDir, `已为阶段 \`${stage.id}\` 启动审核。`);
  return {
    taskDir,
    state,
    reviewPath,
  };
}

function approveStageReview(paths, taskId, stageId, note = '') {
  const { taskDir, state } = locateTask(paths, taskId);
  const stage = state.stages.find((item) => item.id === stageId);
  if (!stage) {
    throw new CliError(`找不到阶段: ${stageId}`);
  }
  stage.reviewApproved = true;
  stage.reviewApprovedAt = nowIso();
  writeTaskState(paths, taskDir, state);
  appendWorklog(taskDir, `阶段 \`${stage.id}\` 已审核通过${note ? `：${note}` : ''}。`);
  return {
    taskDir,
    state,
    stage,
  };
}

function reconcileTask(paths, taskId, resultFile, stageId, note = '', explicitStatus = '') {
  const { taskDir, state } = locateTask(paths, taskId);
  const stage = stageId ? state.stages.find((item) => item.id === stageId) : getCurrentStage(state);
  if (!stage) {
    throw new CliError('没有可回写的阶段。');
  }

  let result = {};
  let copiedResultPath = '';
  if (resultFile) {
    if (!exists(resultFile)) {
      throw new CliError(`结果文件不存在: ${resultFile}`);
    }
    copiedResultPath = path.join(stage.outputDir, `${Date.now()}-${path.basename(resultFile)}`);
    copyFile(resultFile, copiedResultPath);
    if (path.extname(resultFile).toLowerCase() === '.json') {
      result = readJson(resultFile, {});
    } else {
      result = {
        note: readText(resultFile, '').slice(0, 1000),
      };
    }
  }

  const resolvedStatus = normalizeReconcileStatus(result, explicitStatus);
  stage.status = resolvedStatus || (stage.status === 'completed' ? 'completed' : 'in_progress');
  stage.lastResultFile = copiedResultPath || '';
  stage.lastReconciledAt = nowIso();
  if (stage.delegation) {
    stage.delegation.status = 'reconciled';
  }

  if (stage.status === 'completed') {
    while (state.stages[state.currentStageIndex] && state.stages[state.currentStageIndex].status === 'completed') {
      state.currentStageIndex += 1;
    }
    state.status = state.currentStageIndex >= state.stages.length ? 'completed' : 'active';
    state.paused = false;
    state.pauseReason = '';
  } else if (TERMINAL_STAGE_STATUSES.has(stage.status)) {
    state.status = 'paused';
    state.paused = true;
    state.pauseReason = note || `Stage ${stage.id} ${stage.status}`;
  } else {
    state.status = 'active';
    state.paused = false;
    state.pauseReason = '';
  }

  writeTaskState(paths, taskDir, state);
  appendWorklog(
    taskDir,
    `阶段 \`${stage.id}\` 已回写为 \`${stage.status}\`${resolvedStatus ? '' : '（未提供明确完成信号）'}${note ? `：${note}` : ''}${copiedResultPath ? `，结果文件：\`${path.basename(copiedResultPath)}\`` : ''}。`
  );

  return {
    taskDir,
    state,
    stage,
    copiedResultPath,
  };
}

function pauseTask(paths, taskId, reason = '') {
  const { taskDir, state } = locateTask(paths, taskId);
  state.status = 'paused';
  state.paused = true;
  state.pauseReason = reason;
  writeTaskState(paths, taskDir, state);
  appendWorklog(taskDir, `任务已暂停${reason ? `：${reason}` : ''}。`);
  return {
    taskDir,
    state,
  };
}

function resumeTask(paths, taskId, reason = '') {
  const { taskDir, state } = locateTask(paths, taskId);
  state.status = 'active';
  state.paused = false;
  state.pauseReason = '';
  writeTaskState(paths, taskDir, state);
  appendWorklog(taskDir, `任务已恢复${reason ? `：${reason}` : ''}。`);
  return {
    taskDir,
    state,
  };
}

function recoverTask(paths, store, taskId) {
  const { taskDir, state } = locateTask(paths, taskId);
  const account = store.getManagedAccount();
  const currentStage = getCurrentStage(state);
  const recentRecords = account
    ? store.listOperationRecords({
        accountId: account.id,
        taskId: state.taskId,
        limit: 20,
      })
    : [];
  const currentStageRecords = account && currentStage
    ? store.listOperationRecords({
        accountId: account.id,
        taskId: state.taskId,
        stageId: currentStage.id,
        limit: 10,
      })
    : [];
  state.lastRecoveredAt = nowIso();
  writeTaskState(paths, taskDir, state);
  appendWorklog(
    taskDir,
    `任务恢复检查已完成。已检查当前任务关联事实 ${recentRecords.length} 条${currentStage ? `，当前阶段（${currentStage.id}）关联事实 ${currentStageRecords.length} 条` : ''}。`
  );
  return {
    taskDir,
    state,
    recentRecords,
    currentStageRecords,
  };
}

module.exports = {
  createTaskWorkspace,
  locateTask,
  getTaskStatus,
  planNextTaskStep,
  prepareDelegation,
  startStageReview,
  approveStageReview,
  reconcileTask,
  pauseTask,
  resumeTask,
  recoverTask,
};
