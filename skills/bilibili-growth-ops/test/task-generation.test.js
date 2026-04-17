'use strict';

const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapTempRuntime, withContext } = require('../support');
const { createProductWorkspace, ingestProductMaterial } = require('../scripts/lib/workflows/product');
const { createTaskWorkspace, planNextTaskStep, reconcileTask } = require('../scripts/lib/workflows/task');
const { readText, writeText } = require('../scripts/lib/runtime/files');

test('task generation creates task files and transitions into review-required outbound stage', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ paths, store }) => {
    createProductWorkspace({
      paths,
      store,
      name: 'Task Product',
      summary: 'Task generation demo',
    });
    ingestProductMaterial({
      store,
      slug: 'task-product',
      text: '这个产品帮助 AI 编程团队更快整理工作流。',
      title: '概述',
    });

    const task = createTaskWorkspace({
      paths,
      store,
      productSlug: 'task-product',
      strategySlug: 'baseline-comment-reply-dm',
    });

    assert.equal(task.state.stages.length, 5);
    assert.equal(task.state.strategySections['Global Working Rules'].includes('不要一上来就外发'), true);
    const initialNext = planNextTaskStep(paths, task.taskId);
    assert.equal(initialNext.decision.kind, 'execute_stage');
    assert.equal(initialNext.decision.promptFocus.includes('关键词'), true);

    reconcileTask(paths, task.taskId, null, 'discover_videos', 'done', 'completed');
    reconcileTask(paths, task.taskId, null, 'mine_prospects', 'done', 'completed');

    const next = planNextTaskStep(paths, task.taskId);
    assert.equal(next.decision.kind, 'review_required');
    assert.equal(next.decision.stageId, 'public_comment_outreach');
    assert.equal(next.decision.promptFocus.includes('自然'), true);
  });
});

test('task reconcile stays conservative without explicit completion signal', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ paths, store }) => {
    createProductWorkspace({
      paths,
      store,
      name: 'Task Guard Product',
      summary: 'Task guard demo',
    });
    ingestProductMaterial({
      store,
      slug: 'task-guard-product',
      text: '这是一个测试产品。',
      title: '概述',
    });

    const task = createTaskWorkspace({
      paths,
      store,
      productSlug: 'task-guard-product',
      strategySlug: 'baseline-comment-reply-dm',
    });

    const reconciled = reconcileTask(paths, task.taskId, null, 'discover_videos', 'partial writeback');
    assert.equal(reconciled.stage.status, 'in_progress');
    assert.equal(reconciled.state.currentStageIndex, 0);

    const next = planNextTaskStep(paths, task.taskId);
    assert.equal(next.decision.stageId, 'discover_videos');
  });
});

test('task markdown renders from runtime task templates', () => {
  const runtimeRoot = bootstrapTempRuntime();
  const runtimeTaskTemplate = path.join(runtimeRoot, 'resources', 'templates', 'task', 'TASK.md.tmpl');
  const original = readText(runtimeTaskTemplate, '');
  writeText(runtimeTaskTemplate, `${original}\nRuntime Template Marker: {{taskTitle}}\n`);

  withContext(runtimeRoot, ({ paths, store }) => {
    createProductWorkspace({
      paths,
      store,
      name: 'Task Template Product',
      summary: 'Template demo',
    });
    ingestProductMaterial({
      store,
      slug: 'task-template-product',
      text: '用于验证 runtime 模板快照。',
      title: '概述',
    });

    const task = createTaskWorkspace({
      paths,
      store,
      productSlug: 'task-template-product',
      strategySlug: 'baseline-comment-reply-dm',
    });

    const taskMarkdown = readText(path.join(task.taskDir, 'TASK.md'), '');
    assert.equal(taskMarkdown.includes('Runtime Template Marker'), true);
  });
});
