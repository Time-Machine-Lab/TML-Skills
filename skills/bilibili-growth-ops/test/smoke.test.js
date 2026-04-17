'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapTempRuntime, withContext } = require('../support');
const { createProductWorkspace, ingestProductMaterial } = require('../scripts/lib/workflows/product');
const { readText } = require('../scripts/lib/runtime/files');
const {
  createTaskWorkspace,
  planNextTaskStep,
  prepareDelegation,
  reconcileTask,
  startStageReview,
  approveStageReview,
  getTaskStatus,
} = require('../scripts/lib/workflows/task');

test('baseline strategy smoke path covers comment outreach, reply follow-up, and high-intent DM escalation', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ paths, store }) => {
    const product = createProductWorkspace({
      paths,
      store,
      name: 'Smoke Product',
      summary: 'Smoke validation product',
    });
    ingestProductMaterial({
      store,
      slug: product.product.slug,
      text: '面向 AI 编程用户，强调交付速度、案例沉淀和协作体验。',
      title: '产品说明',
    });

    const account = store.upsertAccount({
      id: 'account:smoke',
      bilibiliMid: '9001',
      displayName: 'smoke-runner',
      profile: {
        mid: '9001',
        uname: 'smoke-runner',
      },
    });

    const task = createTaskWorkspace({
      paths,
      store,
      productSlug: product.product.slug,
      strategySlug: 'baseline-comment-reply-dm',
    });

    assert.equal(planNextTaskStep(paths, task.taskId).decision.kind, 'execute_stage');
    const delegation = prepareDelegation(paths, task.taskId);
    const delegationBody = readText(delegation.delegation.filePath, '');
    assert.equal(delegationBody.includes('## 策略提示词导向'), true);
    assert.equal(delegationBody.includes('不要像模板化营销文案'), true);
    reconcileTask(paths, task.taskId, null, 'discover_videos', 'done', 'completed');
    reconcileTask(paths, task.taskId, null, 'mine_prospects', 'done', 'completed');

    let next = planNextTaskStep(paths, task.taskId);
    assert.equal(next.decision.kind, 'review_required');
    const review = startStageReview(paths, task.taskId, 'public_comment_outreach');
    const reviewBody = readText(review.reviewPath, '');
    assert.equal(reviewBody.includes('## 策略提示词导向'), true);
    assert.equal(reviewBody.includes('评论要自然、短、贴上下文'), true);
    approveStageReview(paths, task.taskId, 'public_comment_outreach', 'approved');
    store.insertOperationRecord({
      accountId: account.id,
      taskId: task.taskId,
      stageId: 'public_comment_outreach',
      operationType: 'video_comment',
      channelType: 'comment',
      targetType: 'video',
      targetId: 'BV-comment-1',
      targetVideoBvid: 'BV-comment-1',
      content: '公开评论触达',
      reason: '该视频与产品场景高度相关，先用自然评论建立公开讨论入口。',
      dedupeKey: 'comment:BV-comment-1',
      riskLevel: 'medium',
      status: 'sent',
      metadata: {},
    });
    reconcileTask(paths, task.taskId, null, 'public_comment_outreach', 'done', 'completed');

    next = planNextTaskStep(paths, task.taskId);
    assert.equal(next.decision.kind, 'review_required');
    startStageReview(paths, task.taskId, 'reply_follow_up');
    approveStageReview(paths, task.taskId, 'reply_follow_up', 'approved');
    store.insertOperationRecord({
      accountId: account.id,
      taskId: task.taskId,
      stageId: 'reply_follow_up',
      operationType: 'comment_reply',
      channelType: 'reply',
      targetType: 'comment',
      targetId: 'reply-1',
      targetCommentRpid: 'reply-1',
      content: '评论区跟进',
      reason: '对方已表现出继续交流意愿，顺着原问题在评论区继续承接。',
      dedupeKey: 'reply:reply-1',
      riskLevel: 'medium',
      status: 'sent',
      metadata: {},
    });
    reconcileTask(paths, task.taskId, null, 'reply_follow_up', 'done', 'completed');

    next = planNextTaskStep(paths, task.taskId);
    assert.equal(next.decision.kind, 'review_required');
    startStageReview(paths, task.taskId, 'high_intent_dm');
    approveStageReview(paths, task.taskId, 'high_intent_dm', 'approved');
    store.insertOperationRecord({
      accountId: account.id,
      taskId: task.taskId,
      stageId: 'high_intent_dm',
      operationType: 'direct_message',
      channelType: 'dm',
      targetType: 'user',
      targetId: 'user-1',
      targetUserMid: 'user-1',
      content: '高意向私信升级',
      reason: '用户已明确追问细节，适合从公开区升级到私信继续沟通。',
      dedupeKey: 'dm:user-1',
      riskLevel: 'high',
      status: 'sent',
      metadata: {},
    });
    reconcileTask(paths, task.taskId, null, 'high_intent_dm', 'done', 'completed');

    const status = getTaskStatus(paths, task.taskId);
    assert.equal(status.state.status, 'completed');
    assert.equal(store.listOperationRecords({ accountId: account.id, limit: 10 }).length, 3);
  });
});
