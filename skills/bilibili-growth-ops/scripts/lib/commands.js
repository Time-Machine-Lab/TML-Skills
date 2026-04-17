'use strict';

const path = require('path');
const { CliError } = require('./errors');
const { createResult } = require('./output');
const { toInt, toBool, requireOption } = require('./args');
const { listCommands, explainCommands } = require('./command-catalog');
const { getRuntimePaths } = require('./runtime/paths');
const { bootstrapRuntime, doctorRuntime, repairRuntime } = require('./runtime/bootstrap');
const { createRuntimeContext } = require('./runtime/context');
const { readSession, summarizeSession } = require('./session-store');
const { createProductWorkspace, ingestProductMaterial } = require('./workflows/product');
const { listCapabilities, getCapability, listStrategies, getStrategy } = require('./workflows/catalog');
const {
  createTaskWorkspace,
  getTaskStatus,
  planNextTaskStep,
  prepareDelegation,
  startStageReview,
  approveStageReview,
  reconcileTask,
  pauseTask,
  resumeTask,
  recoverTask,
} = require('./workflows/task');
const { generateQrCode, pollQrCode, refreshCookie, checkCookieRefresh } = require('./bilibili/auth');
const { BilibiliClient } = require('./bilibili/client');
const { uniqueId } = require('./runtime/files');

function createClient(paths) {
  const session = readSession(paths);
  return new BilibiliClient({
    cookie: session.cookie || '',
    userAgent: session.userAgent || undefined,
    paths,
  });
}

function ensureManagedAccount(store) {
  const account = store.getManagedAccount();
  if (!account) {
    throw new CliError('当前还没有已管理的账号，请先完成扫码登录。');
  }
  return account;
}

function requireOutboundReason(reason) {
  const value = String(reason || '').trim();
  if (!value) {
    throw new CliError('真实外发动作必须附带 `reason`，用 100 字内说明发送依据、目的或意义。');
  }
  return value;
}

function pickOutboundGuardOverrides(options = {}) {
  const fields = ['cooldownSeconds', 'windowMinutes', 'maxInWindow', 'recentLimit'];
  const overrides = {};
  for (const key of fields) {
    if (options[key] !== undefined && options[key] !== '') {
      overrides[key] = options[key];
    }
  }
  return overrides;
}

function resolveOutboundGuardPolicy(store, operationType, options = {}) {
  return store.resolveOutboundGuardPolicy(operationType, pickOutboundGuardOverrides(options));
}

function evaluateOutboundGuard(store, accountId, operationType, options = {}) {
  const policy = resolveOutboundGuardPolicy(store, operationType, options);
  const evaluation = store.evaluateOutboundGuard({
    accountId,
    operationType,
    ...policy.effectivePolicy,
    policySource: policy.policySource,
  });
  return {
    ...evaluation,
    defaultPolicy: policy.defaultPolicy,
    persistedPolicy: policy.persistedPolicy,
    overridePolicy: policy.overridePolicy,
    policyUpdatedAt: policy.updatedAt,
  };
}

function buildOutboundGuardRiskHint(operationType, evaluation) {
  const labels = {
    video_comment: '评论',
    comment_reply: '评论回复',
    direct_message: '私信',
  };
  const label = labels[operationType] || '外发动作';
  if (evaluation.reason === 'cooldown_active') {
    return `距离该账号上一次${label}仍过近，建议至少等待 ${evaluation.waitSeconds} 秒后再继续。`;
  }
  if (evaluation.reason === 'window_limit_reached') {
    return `该账号在最近 ${evaluation.policy.windowMinutes} 分钟内的${label}次数已达到 ${evaluation.policy.maxInWindow} 次，建议等待 ${evaluation.waitSeconds} 秒后再继续。`;
  }
  return '';
}

async function handleRuntime(command, options) {
  if (command === 'paths') {
    const paths = getRuntimePaths(options);
    return createResult({
      command: 'runtime.paths',
      runtimeRoot: paths.runtimeRoot,
      data: paths,
    });
  }
  if (command === 'bootstrap') {
    const result = bootstrapRuntime(options);
    return createResult({
      command: 'runtime.bootstrap',
      runtimeRoot: result.paths.runtimeRoot,
      data: {
        checks: result.checks,
      },
      writes: result.writes,
      nextSteps: ['运行 `auth qr-start`，开始创建当前受管账号的登录态。'],
    });
  }
  if (command === 'doctor') {
    const result = doctorRuntime(options);
    return createResult({
      command: 'runtime.doctor',
      runtimeRoot: result.paths.runtimeRoot,
      data: result,
      riskHints: result.checks.filter((item) => !item.ok).map((item) => item.message),
    });
  }
  if (command === 'repair') {
    const result = repairRuntime(options);
    return createResult({
      command: 'runtime.repair',
      runtimeRoot: result.paths.runtimeRoot,
      data: {
        checks: result.checks,
        repaired: true,
      },
      writes: result.writes,
    });
  }
  throw new CliError(`未知的 runtime 指令: ${command}`);
}

async function handleCommandCatalog(command, options) {
  if (command === 'list') {
    const items = listCommands({
      group: options.group || '',
    });
    return createResult({
      command: 'command.list',
      runtimeRoot: options.runtimeRoot || '',
      data: {
        items,
      },
      nextSteps: items.length ? ['如需进一步理解命令作用，可使用 `command explain` 批量查看说明。'] : [],
    });
  }

  if (command === 'explain') {
    const ids = requireOption(options, 'ids', '缺少必填参数 `--ids`，请传入逗号分隔的命令 id。');
    const result = explainCommands({
      ids,
      group: options.group || '',
    });
    return createResult({
      command: 'command.explain',
      runtimeRoot: options.runtimeRoot || '',
      data: result,
      riskHints: result.missing.length ? ['部分命令 id 未在命令目录中找到，请检查拼写或分组。'] : [],
    });
  }

  throw new CliError(`未知的 command 指令: ${command}`);
}

async function handleProduct(command, options) {
  const context = createRuntimeContext(options);
  try {
    if (command === 'create') {
      const name = requireOption(options, 'name');
      const result = createProductWorkspace({
        paths: context.paths,
        store: context.store,
        name,
        slug: options.slug,
        summary: options.summary || '',
      });
      return createResult({
        command: 'product.create',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          product: result.product,
          productRoot: result.productRoot,
          insightPath: result.insightPath,
          insightGuidePath: result.insightGuidePath,
        },
        writes: [result.productRoot],
        nextSteps: ['继续使用 `product ingest` 导入产品资料，再按照产品信息提炼指引完善 `PRODUCT-INSIGHT.md`，最后再创建任务。'],
      });
    }
    if (command === 'list') {
      return createResult({
        command: 'product.list',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          items: context.store.listProducts({ status: options.status }),
        },
      });
    }
    if (command === 'get') {
      const slug = requireOption(options, 'slug');
      const product = context.store.getProductBySlug(slug);
      if (!product) {
        throw new CliError(`产品不存在: ${slug}`);
      }
      return createResult({
        command: 'product.get',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          product,
        },
      });
    }
    if (command === 'ingest') {
      const slug = requireOption(options, 'slug');
      const result = ingestProductMaterial({
        store: context.store,
        slug,
        source: options.source,
        text: options.text,
        title: options.title,
        kind: options.kind || 'auto',
      });
      return createResult({
        command: 'product.ingest',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
        writes: [result.materialPath],
        nextSteps: ['先结合 `PRODUCT.md`、产品信息提炼指引和 `PRODUCT-INSIGHT.md` 完成产品提炼，再继续创建任务。'],
      });
    }
    throw new CliError(`未知的 product 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function handleAuth(command, options) {
  const context = createRuntimeContext(options);
  try {
    if (command === 'qr-start') {
      const result = await generateQrCode({ paths: context.paths });
      return createResult({
        command: 'auth.qr_start',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
        nextSteps: ['扫码后使用 `auth qr-poll` 继续轮询登录结果。'],
      });
    }
    if (command === 'qr-poll') {
      const result = await pollQrCode({
        paths: context.paths,
        qrcodeKey: options.qrcodeKey || options.key,
      });
      if (result.status === 'success' && result.userInfo) {
        context.store.upsertAccount({
          id: `account:${result.userInfo.mid}`,
          bilibiliMid: String(result.userInfo.mid),
          displayName: result.userInfo.uname,
          status: 'active',
          profile: result.userInfo,
        });
      }
      return createResult({
        command: 'auth.qr_poll',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
        nextSteps:
          result.status === 'success'
            ? ['登录成功后运行 `account self-get`，同步当前账号资料。']
            : ['继续轮询，直到扫码登录流程结束。'],
      });
    }
    if (command === 'session-get') {
      const session = readSession(context.paths);
      let refreshInfo = null;
      if (session.cookie) {
        try {
          refreshInfo = await checkCookieRefresh({ cookie: session.cookie, userAgent: session.userAgent });
        } catch {
          refreshInfo = null;
        }
      }
      return createResult({
        command: 'auth.session_get',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          session: summarizeSession(session),
          refreshInfo,
        },
      });
    }
    if (command === 'session-refresh') {
      const session = readSession(context.paths);
      const result = await refreshCookie({
        paths: context.paths,
        cookie: session.cookie || '',
        refreshToken: session.refreshToken || '',
        userAgent: session.userAgent,
      });
      return createResult({
        command: 'auth.session_refresh',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    throw new CliError(`未知的 auth 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function handleAccount(command, options) {
  const context = createRuntimeContext(options);
  try {
    if (command !== 'self-get') {
      throw new CliError(`未知的 account 指令: ${command}`);
    }
    const client = createClient(context.paths);
    const profile = await client.getUserInfo();
    const account = context.store.upsertAccount({
      id: `account:${profile.mid}`,
      bilibiliMid: String(profile.mid),
      displayName: profile.uname,
      status: 'active',
      profile,
    });
    return createResult({
      command: 'account.self_get',
      runtimeRoot: context.paths.runtimeRoot,
      data: {
        account,
      },
    });
  } finally {
    context.close();
  }
}

async function handleVideo(command, options) {
  const context = createRuntimeContext(options);
  try {
    const client = createClient(context.paths);
    if (command === 'search') {
      const items = await client.searchVideos({
        keyword: requireOption(options, 'keyword'),
        page: toInt(options.page, 1),
        limit: toInt(options.limit, 10),
        raw: toBool(options.raw, false),
      });
      if (!toBool(options.raw, false)) {
        items.forEach((item) => {
          context.store.upsertVideo(item);
          if (item.author_mid) {
            context.store.upsertBilibiliUser({
              mid: String(item.author_mid),
              uname: item.author,
            });
          }
        });
      }
      return createResult({
        command: 'video.search',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          items,
          page: toInt(options.page, 1),
          limit: toInt(options.limit, 10),
        },
      });
    }
    if (command === 'get') {
      const detail = await client.getVideoDetail(requireOption(options, 'id'));
      context.store.upsertVideo({
        ...detail,
        bvid: detail.bvid,
        aid: detail.aid,
        owner_mid: detail.owner?.mid,
        owner_name: detail.owner?.name,
        description: detail.desc,
        publish_ts: detail.pubdate,
        duration_sec: detail.duration_sec,
        stat: detail.stat,
      });
      if (detail.owner?.mid) {
        context.store.upsertBilibiliUser({
          mid: String(detail.owner.mid),
          uname: detail.owner.name,
        });
      }
      return createResult({
        command: 'video.get',
        runtimeRoot: context.paths.runtimeRoot,
        data: detail,
      });
    }
    throw new CliError(`未知的 video 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function handleComment(command, options) {
  const context = createRuntimeContext(options);
  try {
    const client = createClient(context.paths);
    if (command === 'list') {
      const result = await client.listComments({
        id: options.id,
        oid: options.oid,
        page: toInt(options.page, 1),
        size: toInt(options.size, 20),
        sort: toInt(options.sort, 1),
      });
      const bvid = options.id && String(options.id).startsWith('BV') ? String(options.id) : null;
      result.items.forEach((item) => {
        context.store.upsertComment({
          ...item,
          oid: result.oid,
          bvid,
        });
        if (item.mid) {
          context.store.upsertBilibiliUser({
            mid: String(item.mid),
            uname: item.username,
            sign: item.sign,
            level: item.level,
          });
        }
      });
      return createResult({
        command: 'comment.list',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    if (command === 'scan') {
      const result = await client.scanMainComments({
        id: options.id,
        oid: options.oid,
        mode: toInt(options.mode, 3),
        nextOffset: options.nextOffset || '',
        seekRpid: options.seekRpid || '',
      });
      const bvid = options.id && String(options.id).startsWith('BV') ? String(options.id) : null;
      [...result.topReplies, ...result.hots, ...result.items].forEach((item) => {
        context.store.upsertComment({
          ...item,
          oid: result.oid,
          bvid,
        });
        if (item.mid) {
          context.store.upsertBilibiliUser({
            mid: String(item.mid),
            uname: item.username,
            sign: item.sign,
            level: item.level,
          });
        }
      });
      return createResult({
        command: 'comment.scan',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    if (command === 'send') {
      const account = ensureManagedAccount(context.store);
      const message = requireOption(options, 'message');
      const operationType = options.root || options.parent ? 'comment_reply' : 'video_comment';
      const targetVideoBvid = options.id && String(options.id).startsWith('BV') ? String(options.id) : null;
      const dedupeKey = `comment:${targetVideoBvid || options.oid || ''}:${message.trim()}`;
      const duplicate = toBool(options.skipDedupe, false)
        ? null
        : context.store.findDuplicate({
            accountId: account.id,
            operationType,
            targetType: options.root || options.parent ? 'comment' : 'video',
            targetVideoBvid,
            targetCommentRpid: options.parent || options.root || null,
            dedupeKey,
            withinHours: toInt(options.withinHours, 72),
          });
      if (duplicate) {
        return createResult({
          command: 'comment.send',
          runtimeRoot: context.paths.runtimeRoot,
          data: {
            skipped: true,
            reason: 'duplicate_operation_record',
            duplicate,
          },
          riskHints: ['命中去重记录，本次发送已跳过。'],
        });
      }
      const guardEvaluation = evaluateOutboundGuard(context.store, account.id, operationType, options);
      if (!guardEvaluation.allowed) {
        return createResult({
          command: 'comment.send',
          runtimeRoot: context.paths.runtimeRoot,
          data: {
            skipped: true,
            reason: 'outbound_guard_blocked',
            outboundGuard: guardEvaluation,
          },
          riskHints: [buildOutboundGuardRiskHint(operationType, guardEvaluation)].filter(Boolean),
          nextSteps: guardEvaluation.waitSeconds
            ? [`建议等待 ${guardEvaluation.waitSeconds} 秒后再重新评估。`]
            : [],
        });
      }
      const actionReason = requireOutboundReason(options.reason);
      const result = await client.sendComment({
        id: options.id,
        oid: options.oid,
        message,
        root: options.root,
        parent: options.parent,
      });
      const record = context.store.insertOperationRecord({
        accountId: account.id,
        taskId: options.taskId || null,
        stageId: options.stageId || null,
        operationType,
        channelType: options.root || options.parent ? 'reply' : 'comment',
        targetType: options.root || options.parent ? 'comment' : 'video',
        targetId: options.parent || options.root || targetVideoBvid || options.oid || '',
        targetUserMid: options.targetUserMid || null,
        targetVideoBvid,
        targetCommentRpid: options.parent || options.root || null,
        content: message,
        reason: actionReason,
        dedupeKey,
        riskLevel: 'medium',
        status: 'sent',
        metadata: {
          result,
        },
      });
      return createResult({
        command: 'comment.send',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          result,
          operationRecord: record,
          outboundGuard: guardEvaluation,
        },
        riskHints: ['已完成一次公开外发动作，继续执行前请注意节奏和冷却时间。'],
        nextSteps: ['可使用 `records list` 查看最近的真实动作记录。'],
      });
    }
    throw new CliError(`未知的 comment 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function handleNotification(command, options) {
  const context = createRuntimeContext(options);
  try {
    const client = createClient(context.paths);
    if (command === 'unread-get') {
      return createResult({
        command: 'notification.unread_get',
        runtimeRoot: context.paths.runtimeRoot,
        data: await client.getUnreadNotifications(),
      });
    }
    if (command === 'reply-list') {
      return createResult({
        command: 'notification.reply_list',
        runtimeRoot: context.paths.runtimeRoot,
        data: await client.getReplyNotifications({
          id: options.id,
          replyTime: options.replyTime,
        }),
      });
    }
    throw new CliError(`未知的 notification 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function handleDm(command, options) {
  const context = createRuntimeContext(options);
  try {
    const client = createClient(context.paths);
    if (command === 'session-list') {
      return createResult({
        command: 'dm.session_list',
        runtimeRoot: context.paths.runtimeRoot,
        data: await client.listDmSessions(),
      });
    }
    if (command === 'message-list') {
      return createResult({
        command: 'dm.message_list',
        runtimeRoot: context.paths.runtimeRoot,
        data: await client.getDmMessages({
          talkerId: requireOption(options, 'talkerId'),
          beginSeqno: toInt(options.beginSeqno, 0),
          size: toInt(options.size, 20),
        }),
      });
    }
    if (command === 'send') {
      const account = ensureManagedAccount(context.store);
      const receiverId = requireOption(options, 'receiverId');
      const message = requireOption(options, 'message');
      const dedupeKey = `dm:${receiverId}:${message.trim()}`;
      const duplicate = toBool(options.skipDedupe, false)
        ? null
        : context.store.findDuplicate({
            accountId: account.id,
            operationType: 'direct_message',
            targetType: 'user',
            targetUserMid: receiverId,
            dedupeKey,
            withinHours: toInt(options.withinHours, 72),
          });
      if (duplicate) {
        return createResult({
          command: 'dm.send',
          runtimeRoot: context.paths.runtimeRoot,
          data: {
            skipped: true,
            reason: 'duplicate_operation_record',
            duplicate,
          },
          riskHints: ['命中去重记录，本次发送已跳过。'],
        });
      }
      const guardEvaluation = evaluateOutboundGuard(context.store, account.id, 'direct_message', options);
      if (!guardEvaluation.allowed) {
        return createResult({
          command: 'dm.send',
          runtimeRoot: context.paths.runtimeRoot,
          data: {
            skipped: true,
            reason: 'outbound_guard_blocked',
            outboundGuard: guardEvaluation,
          },
          riskHints: [buildOutboundGuardRiskHint('direct_message', guardEvaluation)].filter(Boolean),
          nextSteps: guardEvaluation.waitSeconds
            ? [`建议等待 ${guardEvaluation.waitSeconds} 秒后再重新评估。`]
            : [],
        });
      }
      const actionReason = requireOutboundReason(options.reason);
      const result = await client.sendDm({
        receiverId,
        message,
        devId: options.devId || uniqueId('dev'),
        msgType: toInt(options.msgType, 1),
      });
      const record = context.store.insertOperationRecord({
        accountId: account.id,
        taskId: options.taskId || null,
        stageId: options.stageId || null,
        operationType: 'direct_message',
        channelType: 'dm',
        targetType: 'user',
        targetId: receiverId,
        targetUserMid: receiverId,
        content: message,
        reason: actionReason,
        dedupeKey,
        riskLevel: 'high',
        status: 'sent',
        metadata: {
          result,
        },
      });
      return createResult({
        command: 'dm.send',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          result,
          operationRecord: record,
          outboundGuard: guardEvaluation,
        },
        riskHints: ['私信属于更高风险的外发动作，只应在高意向升级场景下使用。'],
      });
    }
    throw new CliError(`未知的 dm 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function handleRecords(command, options) {
  const context = createRuntimeContext(options);
  try {
    if (command === 'cooldown-policy-get') {
      const operationType = options.operationType ? requireOption(options, 'operationType') : '';
      const data = operationType
        ? context.store.resolveOutboundGuardPolicy(operationType)
        : {
            items: context.store.listOutboundGuardPolicies(),
          };
      return createResult({
        command: 'records.cooldown_policy_get',
        runtimeRoot: context.paths.runtimeRoot,
        data,
      });
    }
    if (command === 'cooldown-policy-set') {
      const operationType = requireOption(options, 'operationType');
      const policy = context.store.setOutboundGuardPolicy(operationType, pickOutboundGuardOverrides(options), {
        replace: toBool(options.replace, false),
      });
      return createResult({
        command: 'records.cooldown_policy_set',
        runtimeRoot: context.paths.runtimeRoot,
        data: policy,
        nextSteps: ['后续真实外发前的节流检查，都会统一读取这份中心化规则。'],
      });
    }
    if (command === 'cooldown-policy-reset') {
      const operationType = options.operationType || '';
      const data = operationType
        ? context.store.resetOutboundGuardPolicy(operationType)
        : {
            items: context.store.resetOutboundGuardPolicy(),
          };
      return createResult({
        command: 'records.cooldown_policy_reset',
        runtimeRoot: context.paths.runtimeRoot,
        data,
        nextSteps: ['如需重新设定节流规则，可继续使用 `records cooldown-policy-set`。'],
      });
    }
    if (command === 'list') {
      return createResult({
        command: 'records.list',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          items: context.store.listOperationRecords({
            accountId: options.accountId,
            taskId: options.taskId,
            stageId: options.stageId,
            operationType: options.operationType,
            targetType: options.targetType,
            targetUserMid: options.targetUserMid,
            targetVideoBvid: options.targetVideoBvid,
            targetCommentRpid: options.targetCommentRpid,
            limit: toInt(options.limit, 20),
          }),
        },
      });
    }
    if (command === 'dedupe-check') {
      const duplicate = context.store.findDuplicate({
        accountId: options.accountId,
        operationType: requireOption(options, 'operationType'),
        targetType: requireOption(options, 'targetType'),
        targetUserMid: options.targetUserMid,
        targetVideoBvid: options.targetVideoBvid,
        targetCommentRpid: options.targetCommentRpid,
        dedupeKey: options.dedupeKey,
        withinHours: toInt(options.withinHours, 72),
      });
      return createResult({
        command: 'records.dedupe_check',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          duplicate: Boolean(duplicate),
          record: duplicate,
        },
      });
    }
    if (command === 'cooldown-check') {
      const accountId = options.accountId || context.store.getManagedAccount()?.id;
      if (!accountId) {
        throw new CliError('缺少 `accountId`，且当前没有已管理账号，无法执行节流检查。');
      }
      const operationType = requireOption(options, 'operationType');
      const evaluation = evaluateOutboundGuard(context.store, accountId, operationType, options);
      return createResult({
        command: 'records.cooldown_check',
        runtimeRoot: context.paths.runtimeRoot,
        data: evaluation,
        riskHints: evaluation.allowed ? [] : [buildOutboundGuardRiskHint(operationType, evaluation)].filter(Boolean),
      });
    }
    throw new CliError(`未知的 records 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function handleCapability(command, options) {
  const paths = getRuntimePaths(options);
  if (command === 'list') {
    return createResult({
      command: 'capability.list',
      runtimeRoot: paths.runtimeRoot,
      data: {
        items: listCapabilities(paths),
      },
    });
  }
  if (command === 'get') {
    const capability = getCapability(paths, requireOption(options, 'slug'));
    if (!capability) {
      throw new CliError(`功能包不存在: ${options.slug}`);
    }
    return createResult({
      command: 'capability.get',
      runtimeRoot: paths.runtimeRoot,
      data: capability,
    });
  }
  throw new CliError(`未知的 capability 指令: ${command}`);
}

async function handleStrategy(command, options) {
  const paths = getRuntimePaths(options);
  if (command === 'list') {
    return createResult({
      command: 'strategy.list',
      runtimeRoot: paths.runtimeRoot,
      data: {
        items: listStrategies(paths),
      },
    });
  }
  if (command === 'get') {
    const strategy = getStrategy(paths, requireOption(options, 'slug'));
    if (!strategy) {
      throw new CliError(`策略不存在: ${options.slug}`);
    }
    return createResult({
      command: 'strategy.get',
      runtimeRoot: paths.runtimeRoot,
      data: strategy,
    });
  }
  throw new CliError(`未知的 strategy 指令: ${command}`);
}

async function handleTask(command, options) {
  const context = createRuntimeContext(options);
  try {
    if (command === 'create') {
      const result = createTaskWorkspace({
        paths: context.paths,
        store: context.store,
        productSlug: requireOption(options, 'product'),
        strategySlug: requireOption(options, 'strategy'),
        title: options.title,
      });
      return createResult({
        command: 'task.create',
        runtimeRoot: context.paths.runtimeRoot,
        data: {
          taskId: result.taskId,
          taskDir: result.taskDir,
          state: result.state,
        },
        writes: [result.taskDir],
        nextSteps: ['使用 `task plan-next` 判断当前任务的下一阶段。'],
      });
    }
    if (command === 'status') {
      const result = getTaskStatus(context.paths, requireOption(options, 'taskId'));
      return createResult({
        command: 'task.status',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    if (command === 'plan-next') {
      const result = planNextTaskStep(context.paths, requireOption(options, 'taskId'));
      return createResult({
        command: 'task.plan_next',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
        nextSteps:
          result.decision.kind === 'review_required'
            ? ['使用 `task review-start` 生成当前阶段的审核单。']
            : result.decision.kind === 'execute_stage'
              ? ['使用 `task delegate-prepare` 为副 Agent 准备本阶段的派工单。']
              : [],
      });
    }
    if (command === 'delegate-prepare') {
      const result = prepareDelegation(context.paths, requireOption(options, 'taskId'), options.stageId);
      return createResult({
        command: 'task.delegate_prepare',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
        writes: [result.delegation.filePath],
      });
    }
    if (command === 'review-start') {
      const result = startStageReview(
        context.paths,
        requireOption(options, 'taskId'),
        requireOption(options, 'stageId')
      );
      return createResult({
        command: 'task.review_start',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
        writes: [result.reviewPath],
      });
    }
    if (command === 'review-approve') {
      const result = approveStageReview(
        context.paths,
        requireOption(options, 'taskId'),
        requireOption(options, 'stageId'),
        options.note || ''
      );
      return createResult({
        command: 'task.review_approve',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    if (command === 'reconcile') {
      const result = reconcileTask(
        context.paths,
        requireOption(options, 'taskId'),
        options.resultFile,
        options.stageId,
        options.note || '',
        options.status || ''
      );
      return createResult({
        command: 'task.reconcile',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
        writes: result.copiedResultPath ? [result.copiedResultPath] : [],
        nextSteps: ['可继续使用 `task status` 或 `task plan-next` 推进任务。'],
      });
    }
    if (command === 'pause') {
      const result = pauseTask(context.paths, requireOption(options, 'taskId'), options.reason || '');
      return createResult({
        command: 'task.pause',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    if (command === 'resume') {
      const result = resumeTask(context.paths, requireOption(options, 'taskId'), options.reason || '');
      return createResult({
        command: 'task.resume',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    if (command === 'recover') {
      const result = recoverTask(context.paths, context.store, requireOption(options, 'taskId'));
      return createResult({
        command: 'task.recover',
        runtimeRoot: context.paths.runtimeRoot,
        data: result,
      });
    }
    throw new CliError(`未知的 task 指令: ${command}`);
  } finally {
    context.close();
  }
}

async function runCommand(group, command, options) {
  if (group === 'command') {
    return handleCommandCatalog(command, options);
  }
  if (group === 'runtime') {
    return handleRuntime(command, options);
  }
  if (group === 'product') {
    return handleProduct(command, options);
  }
  if (group === 'auth') {
    return handleAuth(command, options);
  }
  if (group === 'account') {
    return handleAccount(command, options);
  }
  if (group === 'video') {
    return handleVideo(command, options);
  }
  if (group === 'comment') {
    return handleComment(command, options);
  }
  if (group === 'notification') {
    return handleNotification(command, options);
  }
  if (group === 'dm') {
    return handleDm(command, options);
  }
  if (group === 'records') {
    return handleRecords(command, options);
  }
  if (group === 'capability') {
    return handleCapability(command, options);
  }
  if (group === 'strategy') {
    return handleStrategy(command, options);
  }
  if (group === 'task') {
    return handleTask(command, options);
  }
  throw new CliError(`未知的命令分组: ${group}`);
}

module.exports = {
  runCommand,
};
