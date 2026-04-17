'use strict';

const { CliError } = require('./errors');
const {
  OUTBOUND_GUARD_POLICY_META_KEY,
  OUTBOUND_OPERATION_TYPES,
  getDefaultOutboundGuard,
} = require('./constants');
const { nowIso } = require('./output');
const { openDatabase, initializeSchema } = require('./sqlite');
const { uniqueId } = require('./runtime/files');

const OUTBOUND_GUARD_FIELDS = ['cooldownSeconds', 'windowMinutes', 'maxInWindow', 'recentLimit'];

function stringify(value, fallback = {}) {
  return JSON.stringify(value == null ? fallback : value);
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeOperationReason(reason) {
  const value = String(reason || '').trim();
  if (!value) {
    throw new CliError('关键动作记录 `OperationRecord` 必须包含 `reason`，用于记录发送依据、目的或意义。');
  }
  return value;
}

function normalizeOutboundOperationType(operationType) {
  const value = String(operationType || '').trim();
  if (!OUTBOUND_OPERATION_TYPES.includes(value)) {
    throw new CliError(
      `不支持的节流操作类型: ${value || '<empty>'}。可选值: ${OUTBOUND_OPERATION_TYPES.join(', ')}`
    );
  }
  return value;
}

function normalizeOutboundGuardField(field, value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new CliError(`节流字段 \`${field}\` 必须是整数。`);
  }
  if (field === 'recentLimit') {
    return Math.max(1, parsed);
  }
  return Math.max(0, parsed);
}

function normalizeOutboundGuardPatch(input = {}) {
  const patch = {};
  for (const field of OUTBOUND_GUARD_FIELDS) {
    if (input[field] === undefined || input[field] === '') {
      continue;
    }
    patch[field] = normalizeOutboundGuardField(field, input[field]);
  }
  return patch;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function sanitizeOutboundGuardPolicy(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const policy = {};
  for (const operationType of OUTBOUND_OPERATION_TYPES) {
    const patch = normalizeOutboundGuardPatch(raw[operationType] || {});
    if (Object.keys(patch).length) {
      policy[operationType] = patch;
    }
  }
  return policy;
}

function buildOutboundGuardSnapshot(operationType, persistedPolicy = {}, updatedAt = null, overrides = {}) {
  const defaultPolicy = getDefaultOutboundGuard(operationType);
  const overridePolicy = normalizeOutboundGuardPatch(overrides);
  const effectivePolicy = {
    ...defaultPolicy,
    ...persistedPolicy,
    ...overridePolicy,
  };
  let policySource = 'default';
  if (Object.keys(overridePolicy).length) {
    policySource = 'override';
  } else if (Object.keys(persistedPolicy).length) {
    policySource = 'persisted';
  }
  return {
    operationType,
    updatedAt: updatedAt || null,
    policySource,
    defaultPolicy,
    persistedPolicy,
    overridePolicy,
    effectivePolicy,
  };
}

class FactStore {
  constructor(dbPath) {
    this.db = openDatabase(dbPath);
    initializeSchema(this.db);
  }

  close() {
    this.db.close();
  }

  setMeta(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, String(value), nowIso());
  }

  getMeta(key) {
    const row = this.db.prepare('SELECT key, value, updated_at FROM meta WHERE key = ?').get(key);
    return row || null;
  }

  getOutboundGuardPolicyState() {
    const row = this.getMeta(OUTBOUND_GUARD_POLICY_META_KEY);
    return {
      updatedAt: row?.updated_at || null,
      items: sanitizeOutboundGuardPolicy(parseJson(row?.value, {})),
    };
  }

  listOutboundGuardPolicies() {
    const state = this.getOutboundGuardPolicyState();
    return OUTBOUND_OPERATION_TYPES.map((operationType) =>
      buildOutboundGuardSnapshot(operationType, state.items[operationType] || {}, state.updatedAt)
    );
  }

  resolveOutboundGuardPolicy(operationType, overrides = {}) {
    const normalizedType = normalizeOutboundOperationType(operationType);
    const state = this.getOutboundGuardPolicyState();
    return buildOutboundGuardSnapshot(normalizedType, state.items[normalizedType] || {}, state.updatedAt, overrides);
  }

  setOutboundGuardPolicy(operationType, patch = {}, options = {}) {
    const normalizedType = normalizeOutboundOperationType(operationType);
    const nextPatch = normalizeOutboundGuardPatch(patch);
    if (!Object.keys(nextPatch).length) {
      throw new CliError('`records cooldown-policy-set` 至少需要传入一个节流字段。');
    }

    const state = this.getOutboundGuardPolicyState();
    const nextItems = { ...state.items };
    nextItems[normalizedType] = normalizeBoolean(options.replace)
      ? nextPatch
      : {
          ...(nextItems[normalizedType] || {}),
          ...nextPatch,
        };
    this.setMeta(OUTBOUND_GUARD_POLICY_META_KEY, stringify(nextItems, {}));
    return this.resolveOutboundGuardPolicy(normalizedType);
  }

  resetOutboundGuardPolicy(operationType) {
    const state = this.getOutboundGuardPolicyState();
    const nextItems = { ...state.items };
    if (operationType) {
      const normalizedType = normalizeOutboundOperationType(operationType);
      delete nextItems[normalizedType];
      this.setMeta(OUTBOUND_GUARD_POLICY_META_KEY, stringify(nextItems, {}));
      return this.resolveOutboundGuardPolicy(normalizedType);
    }
    this.setMeta(OUTBOUND_GUARD_POLICY_META_KEY, stringify({}, {}));
    return this.listOutboundGuardPolicies();
  }

  upsertAccount(account) {
    const now = nowIso();
    const id = account.id || `account:${account.bilibiliMid || account.mid || 'managed'}`;
    this.db
      .prepare(`
        INSERT INTO accounts (id, platform, bilibili_mid, display_name, status, profile_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          platform = excluded.platform,
          bilibili_mid = excluded.bilibili_mid,
          display_name = excluded.display_name,
          status = excluded.status,
          profile_json = excluded.profile_json,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        'bilibili',
        String(account.bilibiliMid || account.mid || ''),
        account.displayName || account.uname || '',
        account.status || 'active',
        stringify(account.profile || account),
        account.createdAt || now,
        now
      );
    return this.getAccountById(id);
  }

  getAccountById(id) {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    return row ? { ...row, profile: parseJson(row.profile_json, {}) } : null;
  }

  getManagedAccount() {
    const row = this.db.prepare('SELECT * FROM accounts ORDER BY updated_at DESC LIMIT 1').get();
    return row ? { ...row, profile: parseJson(row.profile_json, {}) } : null;
  }

  upsertProduct(product) {
    const now = nowIso();
    const id = product.id || uniqueId('product');
    this.db
      .prepare(`
        INSERT INTO products (id, slug, title, status, summary, resource_path, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          title = excluded.title,
          status = excluded.status,
          summary = excluded.summary,
          resource_path = excluded.resource_path,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        product.slug,
        product.title,
        product.status || 'draft',
        product.summary || '',
        product.resourcePath,
        stringify(product.metadata || {}),
        product.createdAt || now,
        now
      );
    return this.getProductBySlug(product.slug);
  }

  getProductBySlug(slug) {
    const row = this.db.prepare('SELECT * FROM products WHERE slug = ?').get(slug);
    return row ? { ...row, metadata: parseJson(row.metadata_json, {}) } : null;
  }

  listProducts({ status } = {}) {
    const query = status
      ? 'SELECT * FROM products WHERE status = ? ORDER BY updated_at DESC'
      : 'SELECT * FROM products ORDER BY updated_at DESC';
    const rows = status ? this.db.prepare(query).all(status) : this.db.prepare(query).all();
    return rows.map((row) => ({ ...row, metadata: parseJson(row.metadata_json, {}) }));
  }

  upsertBilibiliUser(user) {
    const now = nowIso();
    this.db
      .prepare(`
        INSERT INTO bilibili_users (mid, uname, face_url, sign_text, level, vip_status, profile_json, observed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mid) DO UPDATE SET
          uname = excluded.uname,
          face_url = excluded.face_url,
          sign_text = excluded.sign_text,
          level = excluded.level,
          vip_status = excluded.vip_status,
          profile_json = excluded.profile_json,
          updated_at = excluded.updated_at
      `)
      .run(
        String(user.mid || ''),
        user.uname || '',
        user.faceUrl || user.avatar || '',
        user.signText || user.sign || '',
        user.level || null,
        user.vipStatus ?? null,
        stringify(user),
        user.observedAt || now,
        now
      );
  }

  upsertVideo(video) {
    const now = nowIso();
    const stat = video.stat || {
      play_count: video.play_count || 0,
      like_count: video.like_count || 0,
      favorite_count: video.favorite_count || 0,
      comment_count: video.comment_count || 0,
      danmaku_count: video.danmaku_count || 0,
    };
    this.db
      .prepare(`
        INSERT INTO bilibili_videos (bvid, aid, title, owner_mid, owner_name, description, publish_ts, duration_sec, stat_json, raw_json, observed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(bvid) DO UPDATE SET
          aid = excluded.aid,
          title = excluded.title,
          owner_mid = excluded.owner_mid,
          owner_name = excluded.owner_name,
          description = excluded.description,
          publish_ts = excluded.publish_ts,
          duration_sec = excluded.duration_sec,
          stat_json = excluded.stat_json,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
      `)
      .run(
        video.bvid,
        video.aid || null,
        video.title || '',
        String(video.owner_mid || video.owner?.mid || video.author_mid || ''),
        video.owner_name || video.owner?.name || video.author || '',
        video.description || video.desc || '',
        video.publish_ts || video.pubdate || null,
        video.duration_sec || video.duration || null,
        stringify(stat),
        stringify(video.raw || video),
        video.observedAt || now,
        now
      );
  }

  upsertComment(comment) {
    const now = nowIso();
    const oid = String(comment.oid || '');
    const rpid = String(comment.rpid || '');
    const commentKey = `${oid}:${rpid}`;
    this.db
      .prepare(`
        INSERT INTO bilibili_comments (comment_key, oid, rpid, root_rpid, parent_rpid, bvid, author_mid, author_name, content, like_count, reply_count, ctime, raw_json, observed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(comment_key) DO UPDATE SET
          root_rpid = excluded.root_rpid,
          parent_rpid = excluded.parent_rpid,
          bvid = excluded.bvid,
          author_mid = excluded.author_mid,
          author_name = excluded.author_name,
          content = excluded.content,
          like_count = excluded.like_count,
          reply_count = excluded.reply_count,
          ctime = excluded.ctime,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at
      `)
      .run(
        commentKey,
        oid,
        rpid,
        comment.root ? String(comment.root) : comment.root_rpid ? String(comment.root_rpid) : null,
        comment.parent ? String(comment.parent) : comment.parent_rpid ? String(comment.parent_rpid) : null,
        comment.bvid || null,
        comment.mid ? String(comment.mid) : comment.author_mid ? String(comment.author_mid) : null,
        comment.username || comment.author_name || '',
        comment.message || comment.content || '',
        comment.like || comment.like_count || 0,
        comment.replies || comment.reply_count || 0,
        comment.ctime || null,
        stringify(comment.raw || comment),
        comment.observedAt || now,
        now
      );
    return { commentKey, oid, rpid };
  }

  insertOperationRecord(record) {
    const id = record.id || uniqueId('op');
    const operationAt = record.operationAt || nowIso();
    const reason = normalizeOperationReason(record.reason);
    this.db
      .prepare(`
        INSERT INTO operation_records (
          id, account_id, task_id, stage_id, operation_type, channel_type, target_type, target_id,
          target_user_mid, target_video_bvid, target_comment_rpid, content, reason,
          dedupe_key, risk_level, status, external_id, metadata_json, operation_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        record.accountId,
        record.taskId || null,
        record.stageId || null,
        record.operationType,
        record.channelType,
        record.targetType,
        record.targetId || null,
        record.targetUserMid || null,
        record.targetVideoBvid || null,
        record.targetCommentRpid || null,
        record.content || '',
        reason,
        record.dedupeKey || null,
        record.riskLevel || 'medium',
        record.status || 'sent',
        record.externalId || null,
        stringify(record.metadata || {}),
        operationAt,
        record.createdAt || operationAt
      );
    return this.getOperationRecord(id);
  }

  getOperationRecord(id) {
    const row = this.db.prepare('SELECT * FROM operation_records WHERE id = ?').get(id);
    return row ? { ...row, metadata: parseJson(row.metadata_json, {}) } : null;
  }

  listOperationRecords(filters = {}) {
    const clauses = [];
    const values = [];

    const mapping = {
      accountId: 'account_id = ?',
      taskId: 'task_id = ?',
      stageId: 'stage_id = ?',
      operationType: 'operation_type = ?',
      targetType: 'target_type = ?',
      targetUserMid: 'target_user_mid = ?',
      targetVideoBvid: 'target_video_bvid = ?',
      targetCommentRpid: 'target_comment_rpid = ?',
      dedupeKey: 'dedupe_key = ?',
    };

    for (const [key, clause] of Object.entries(mapping)) {
      if (filters[key]) {
        clauses.push(clause);
        values.push(filters[key]);
      }
    }

    let sql = 'SELECT * FROM operation_records';
    if (clauses.length) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    sql += ' ORDER BY created_at DESC';

    const limit = Number(filters.limit || 20);
    sql += ` LIMIT ${Math.max(1, Math.min(limit, 200))}`;

    const rows = this.db.prepare(sql).all(...values);
    return rows.map((row) => ({ ...row, metadata: parseJson(row.metadata_json, {}) }));
  }

  findDuplicate(criteria = {}) {
    const candidates = this.listOperationRecords({
      accountId: criteria.accountId,
      operationType: criteria.operationType,
      targetType: criteria.targetType,
      targetUserMid: criteria.targetUserMid,
      targetVideoBvid: criteria.targetVideoBvid,
      targetCommentRpid: criteria.targetCommentRpid,
      dedupeKey: criteria.dedupeKey,
      limit: criteria.limit || 50,
    });

    if (!criteria.withinHours) {
      return candidates[0] || null;
    }

    const cutoff = Date.now() - Number(criteria.withinHours) * 60 * 60 * 1000;
    return (
      candidates.find((item) => {
        const createdAt = Date.parse(item.created_at || item.operation_at || '');
        return Number.isFinite(createdAt) && createdAt >= cutoff;
      }) || null
    );
  }

  evaluateOutboundGuard(criteria = {}) {
    const recentLimit = Math.max(1, Number(criteria.recentLimit || 5));
    const maxInWindow = Math.max(0, Number(criteria.maxInWindow || 0));
    const cooldownSeconds = Math.max(0, Number(criteria.cooldownSeconds || 0));
    const windowMinutes = Math.max(0, Number(criteria.windowMinutes || 0));
    const accountId = criteria.accountId || null;
    const operationType = String(criteria.operationType || '').trim();
    const policySource = criteria.policySource || 'default';
    const fetchLimit = Math.max(recentLimit, maxInWindow, 10);
    const items = this.listOperationRecords({
      accountId,
      operationType,
      limit: fetchLimit,
    });

    const recentItems = items.slice(0, recentLimit).map((item) => ({
      id: item.id,
      operationType: item.operation_type,
      targetType: item.target_type,
      targetId: item.target_id,
      operationAt: item.operation_at || item.created_at,
      createdAt: item.created_at,
      riskLevel: item.risk_level,
      status: item.status,
    }));

    const now = Date.now();
    const last = items[0] || null;
    const lastOperationAt = last ? last.operation_at || last.created_at || '' : '';
    const lastOperationTs = Date.parse(lastOperationAt || '');
    const secondsSinceLast = Number.isFinite(lastOperationTs) ? Math.max(0, Math.floor((now - lastOperationTs) / 1000)) : null;

    if (cooldownSeconds > 0 && Number.isFinite(lastOperationTs) && secondsSinceLast < cooldownSeconds) {
      return {
        accountId,
        operationType,
        allowed: false,
        reason: 'cooldown_active',
        waitSeconds: Math.max(1, cooldownSeconds - secondsSinceLast),
        lastOperationAt,
        secondsSinceLast,
        currentWindowCount: 0,
        policySource,
        policy: {
          cooldownSeconds,
          windowMinutes,
          maxInWindow,
          recentLimit,
        },
        recentItems,
      };
    }

    const currentWindowCount =
      windowMinutes > 0
        ? items.filter((item) => {
            const value = Date.parse(item.operation_at || item.created_at || '');
            if (!Number.isFinite(value)) {
              return false;
            }
            return value >= now - windowMinutes * 60 * 1000;
          }).length
        : 0;

    if (windowMinutes > 0 && maxInWindow > 0 && currentWindowCount >= maxInWindow) {
      const inWindowItems = items.filter((item) => {
        const value = Date.parse(item.operation_at || item.created_at || '');
        if (!Number.isFinite(value)) {
          return false;
        }
        return value >= now - windowMinutes * 60 * 1000;
      });
      const oldestInWindow = inWindowItems[inWindowItems.length - 1] || null;
      const oldestTs = oldestInWindow ? Date.parse(oldestInWindow.operation_at || oldestInWindow.created_at || '') : NaN;
      const waitSeconds = Number.isFinite(oldestTs)
        ? Math.max(1, Math.ceil((oldestTs + windowMinutes * 60 * 1000 - now) / 1000))
        : 60;
      return {
        accountId,
        operationType,
        allowed: false,
        reason: 'window_limit_reached',
        waitSeconds,
        lastOperationAt,
        secondsSinceLast,
        currentWindowCount,
        policySource,
        policy: {
          cooldownSeconds,
          windowMinutes,
          maxInWindow,
          recentLimit,
        },
        recentItems,
      };
    }

    return {
      accountId,
      operationType,
      allowed: true,
      reason: 'ok',
      waitSeconds: 0,
      lastOperationAt,
      secondsSinceLast,
      currentWindowCount,
      policySource,
      policy: {
        cooldownSeconds,
        windowMinutes,
        maxInWindow,
        recentLimit,
      },
      recentItems,
    };
  }
}

module.exports = {
  FactStore,
};
