'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapTempRuntime, withContext } = require('../support');

test('fact store persists core entities and supports dedupe lookup', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ store, paths }) => {
    const account = store.upsertAccount({
      id: 'account:1001',
      bilibiliMid: '1001',
      displayName: 'tester',
      profile: {
        mid: '1001',
        uname: 'tester',
      },
    });
    const product = store.upsertProduct({
      id: 'product:1',
      slug: 'demo-product',
      title: 'Demo Product',
      status: 'draft',
      summary: 'demo',
      resourcePath: `${paths.productsDir}/demo-product`,
      metadata: {},
    });
    store.upsertBilibiliUser({
      mid: '2002',
      uname: 'viewer',
    });
    store.upsertVideo({
      bvid: 'BV1xx411c7mD',
      aid: 123456,
      title: 'Demo Video',
      author_mid: '3003',
      author: 'up',
      raw: {
        bvid: 'BV1xx411c7mD',
      },
    });
    store.upsertComment({
      oid: '123456',
      rpid: '9001',
      root: '9001',
      parent: null,
      bvid: 'BV1xx411c7mD',
      mid: '2002',
      username: 'viewer',
      message: '这是什么产品？',
      raw: {},
    });
    const record = store.insertOperationRecord({
      accountId: account.id,
      taskId: 'task:demo',
      stageId: 'public_comment_outreach',
      operationType: 'video_comment',
      channelType: 'comment',
      targetType: 'video',
      targetId: 'BV1xx411c7mD',
      targetVideoBvid: 'BV1xx411c7mD',
      content: '欢迎了解一下',
      reason: '该评论区有人在问产品选择，先做自然触达并留下讨论入口。',
      dedupeKey: 'comment:BV1xx411c7mD:welcome',
      riskLevel: 'medium',
      status: 'sent',
      metadata: {
        productId: product.id,
      },
    });

    assert.equal(store.getManagedAccount().id, account.id);
    assert.equal(store.getProductBySlug('demo-product').id, product.id);
    assert.equal(store.listOperationRecords({ targetVideoBvid: 'BV1xx411c7mD' }).length, 1);
    assert.equal(store.listOperationRecords({ taskId: 'task:demo', stageId: 'public_comment_outreach' }).length, 1);
    assert.equal(
      store.findDuplicate({
        accountId: account.id,
        operationType: 'video_comment',
        targetType: 'video',
        targetVideoBvid: 'BV1xx411c7mD',
        dedupeKey: 'comment:BV1xx411c7mD:welcome',
        withinHours: 24,
      }).id,
      record.id
    );

    assert.throws(
      () =>
        store.insertOperationRecord({
          accountId: account.id,
          operationType: 'direct_message',
          channelType: 'dm',
          targetType: 'user',
          targetId: '2002',
          targetUserMid: '2002',
          content: 'hello',
          dedupeKey: 'dm:2002:hello',
          riskLevel: 'high',
          status: 'sent',
          metadata: {},
        }),
      /reason/
    );
  });
});

test('fact store can evaluate outbound cooldown and window guard', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ store }) => {
    const account = store.upsertAccount({
      id: 'account:guard',
      bilibiliMid: '4004',
      displayName: 'guard-tester',
      profile: {
        mid: '4004',
        uname: 'guard-tester',
      },
    });

    const now = Date.now();
    store.insertOperationRecord({
      accountId: account.id,
      operationType: 'video_comment',
      channelType: 'comment',
      targetType: 'video',
      targetId: 'BV-1',
      targetVideoBvid: 'BV-1',
      content: '最近一次评论',
      reason: '测试冷却判断。',
      dedupeKey: 'comment:BV-1',
      riskLevel: 'medium',
      status: 'sent',
      operationAt: new Date(now - 60 * 1000).toISOString(),
      metadata: {},
    });

    const cooldownBlocked = store.evaluateOutboundGuard({
      accountId: account.id,
      operationType: 'video_comment',
      cooldownSeconds: 90,
      windowMinutes: 30,
      maxInWindow: 20,
      recentLimit: 5,
    });
    assert.equal(cooldownBlocked.allowed, false);
    assert.equal(cooldownBlocked.reason, 'cooldown_active');

    store.insertOperationRecord({
      accountId: account.id,
      operationType: 'direct_message',
      channelType: 'dm',
      targetType: 'user',
      targetId: 'user-1',
      targetUserMid: 'user-1',
      content: '私信 1',
      reason: '测试窗口限制 1。',
      dedupeKey: 'dm:user-1',
      riskLevel: 'high',
      status: 'sent',
      operationAt: new Date(now - 50 * 60 * 1000).toISOString(),
      metadata: {},
    });
    store.insertOperationRecord({
      accountId: account.id,
      operationType: 'direct_message',
      channelType: 'dm',
      targetType: 'user',
      targetId: 'user-2',
      targetUserMid: 'user-2',
      content: '私信 2',
      reason: '测试窗口限制 2。',
      dedupeKey: 'dm:user-2',
      riskLevel: 'high',
      status: 'sent',
      operationAt: new Date(now - 30 * 60 * 1000).toISOString(),
      metadata: {},
    });
    store.insertOperationRecord({
      accountId: account.id,
      operationType: 'direct_message',
      channelType: 'dm',
      targetType: 'user',
      targetId: 'user-3',
      targetUserMid: 'user-3',
      content: '私信 3',
      reason: '测试窗口限制 3。',
      dedupeKey: 'dm:user-3',
      riskLevel: 'high',
      status: 'sent',
      operationAt: new Date(now - 10 * 60 * 1000).toISOString(),
      metadata: {},
    });

    const windowBlocked = store.evaluateOutboundGuard({
      accountId: account.id,
      operationType: 'direct_message',
      cooldownSeconds: 0,
      windowMinutes: 60,
      maxInWindow: 3,
      recentLimit: 5,
    });
    assert.equal(windowBlocked.allowed, false);
    assert.equal(windowBlocked.reason, 'window_limit_reached');

    const allowed = store.evaluateOutboundGuard({
      accountId: account.id,
      operationType: 'comment_reply',
      cooldownSeconds: 20,
      windowMinutes: 30,
      maxInWindow: 60,
      recentLimit: 5,
    });
    assert.equal(allowed.allowed, true);
    assert.equal(Array.isArray(allowed.recentItems), true);
  });
});

test('fact store persists centralized outbound guard policy', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ store }) => {
    const initial = store.resolveOutboundGuardPolicy('direct_message');
    assert.equal(initial.policySource, 'default');
    assert.equal(initial.effectivePolicy.cooldownSeconds, 120);
    assert.deepEqual(initial.persistedPolicy, {});

    const updated = store.setOutboundGuardPolicy('direct_message', {
      cooldownSeconds: 180,
      windowMinutes: 60,
      maxInWindow: 20,
    });
    assert.equal(updated.policySource, 'persisted');
    assert.deepEqual(updated.persistedPolicy, {
      cooldownSeconds: 180,
      windowMinutes: 60,
      maxInWindow: 20,
    });
    assert.equal(updated.effectivePolicy.cooldownSeconds, 180);

    const overridden = store.resolveOutboundGuardPolicy('direct_message', {
      cooldownSeconds: 240,
    });
    assert.equal(overridden.policySource, 'override');
    assert.equal(overridden.effectivePolicy.cooldownSeconds, 240);
    assert.equal(overridden.effectivePolicy.maxInWindow, 20);

    const reset = store.resetOutboundGuardPolicy('direct_message');
    assert.equal(reset.policySource, 'default');
    assert.deepEqual(reset.persistedPolicy, {});
    assert.equal(reset.effectivePolicy.cooldownSeconds, 120);
  });
});
