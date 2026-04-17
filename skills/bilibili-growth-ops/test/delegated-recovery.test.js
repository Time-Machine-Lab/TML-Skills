'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapTempRuntime, withContext } = require('../support');
const { createProductWorkspace } = require('../scripts/lib/workflows/product');
const { createTaskWorkspace, prepareDelegation, pauseTask, resumeTask, recoverTask } = require('../scripts/lib/workflows/task');
const { readText } = require('../scripts/lib/runtime/files');

test('delegated task segments can be paused, resumed, and recovered', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ paths, store }) => {
    const account = store.upsertAccount({
      id: 'account:recovery',
      bilibiliMid: '9101',
      displayName: 'recovery-runner',
      profile: {
        mid: '9101',
        uname: 'recovery-runner',
      },
    });
    const product = createProductWorkspace({
      paths,
      store,
      name: 'Recovery Product',
      summary: 'Recovery demo',
    });
    const task = createTaskWorkspace({
      paths,
      store,
      productSlug: product.product.slug,
      strategySlug: 'baseline-comment-reply-dm',
    });

    const delegation = prepareDelegation(paths, task.taskId);
    assert.equal(Boolean(delegation.delegation.filePath), true);
    const delegationBody = readText(delegation.delegation.filePath, '');
    assert.equal(delegationBody.includes('## 策略定位'), true);
    assert.equal(delegationBody.includes('## 阶段提示词重点'), true);
    assert.equal(delegationBody.includes('## 前置条件'), true);
    assert.equal(delegationBody.includes('## 执行步骤'), true);
    assert.equal(delegationBody.includes('基础增长运营策略'), true);
    assert.equal(delegationBody.includes('- `product.get`'), true);
    assert.equal(delegationBody.includes('- `video.search`'), true);
    assert.equal(delegationBody.includes('如果产品资料不足以支撑关键词提炼'), true);

    pauseTask(paths, task.taskId, 'manual stop');
    resumeTask(paths, task.taskId, 'continue');
    store.insertOperationRecord({
      accountId: account.id,
      taskId: task.taskId,
      stageId: 'discover_videos',
      operationType: 'video_comment',
      channelType: 'comment',
      targetType: 'video',
      targetId: 'BV-recovery-1',
      targetVideoBvid: 'BV-recovery-1',
      content: 'task-linked record',
      reason: '用于验证任务恢复只读取当前任务范围内的关键动作。',
      dedupeKey: 'recovery:task',
      riskLevel: 'medium',
      status: 'sent',
      metadata: {},
    });
    store.insertOperationRecord({
      accountId: account.id,
      taskId: 'task_other',
      stageId: 'discover_videos',
      operationType: 'video_comment',
      channelType: 'comment',
      targetType: 'video',
      targetId: 'BV-recovery-2',
      targetVideoBvid: 'BV-recovery-2',
      content: 'other task record',
      reason: '用于验证 recover 不会扫描到其他任务的关键动作。',
      dedupeKey: 'recovery:other',
      riskLevel: 'medium',
      status: 'sent',
      metadata: {},
    });
    const recovered = recoverTask(paths, store, task.taskId);

    assert.equal(recovered.state.status, 'active');
    assert.equal(Array.isArray(recovered.recentRecords), true);
    assert.equal(recovered.recentRecords.length, 1);
    assert.equal(recovered.currentStageRecords.length, 1);
  });
});
