'use strict';

const path = require('path');
const { CliError } = require('./errors');
const { ensureDir } = require('./runtime/files');

function loadSqliteModule() {
  try {
    return require('node:sqlite');
  } catch (error) {
    throw new CliError(
      '当前环境缺少 node:sqlite，无法使用 bilibili-growth-ops 的 SQLite 事实层。',
      1,
      {
        detail: error.message,
        requiredNode: '>=22.13',
      },
      '请使用 Node 22.13+，或者用 `npx -y node@22 node scripts/ops.js ...` 的方式运行。'
    );
  }
}

function openDatabase(dbPath) {
  const { DatabaseSync } = loadSqliteModule();
  ensureDir(path.dirname(dbPath));
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      bilibili_mid TEXT UNIQUE,
      display_name TEXT,
      status TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      resource_path TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bilibili_users (
      mid TEXT PRIMARY KEY,
      uname TEXT,
      face_url TEXT,
      sign_text TEXT,
      level INTEGER,
      vip_status INTEGER,
      profile_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bilibili_videos (
      bvid TEXT PRIMARY KEY,
      aid INTEGER UNIQUE,
      title TEXT,
      owner_mid TEXT,
      owner_name TEXT,
      description TEXT,
      publish_ts INTEGER,
      duration_sec INTEGER,
      stat_json TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bilibili_comments (
      comment_key TEXT PRIMARY KEY,
      oid TEXT NOT NULL,
      rpid TEXT NOT NULL,
      root_rpid TEXT,
      parent_rpid TEXT,
      bvid TEXT,
      author_mid TEXT,
      author_name TEXT,
      content TEXT,
      like_count INTEGER,
      reply_count INTEGER,
      ctime INTEGER,
      raw_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (oid, rpid)
    );

    CREATE TABLE IF NOT EXISTS operation_records (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      task_id TEXT,
      stage_id TEXT,
      operation_type TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_user_mid TEXT,
      target_video_bvid TEXT,
      target_comment_rpid TEXT,
      content TEXT,
      reason TEXT,
      dedupe_key TEXT,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      external_id TEXT,
      metadata_json TEXT NOT NULL,
      operation_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_users_uname ON bilibili_users(uname);
    CREATE INDEX IF NOT EXISTS idx_videos_owner_mid ON bilibili_videos(owner_mid);
    CREATE INDEX IF NOT EXISTS idx_comments_bvid ON bilibili_comments(bvid);
    CREATE INDEX IF NOT EXISTS idx_comments_author_mid ON bilibili_comments(author_mid);
    CREATE INDEX IF NOT EXISTS idx_comments_root_rpid ON bilibili_comments(root_rpid);
    CREATE INDEX IF NOT EXISTS idx_op_records_main
      ON operation_records(account_id, operation_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_op_records_user
      ON operation_records(target_user_mid, operation_type);
    CREATE INDEX IF NOT EXISTS idx_op_records_video
      ON operation_records(target_video_bvid, operation_type);
    CREATE INDEX IF NOT EXISTS idx_op_records_comment
      ON operation_records(target_comment_rpid, operation_type);
    CREATE INDEX IF NOT EXISTS idx_op_records_dedupe
      ON operation_records(dedupe_key);
  `);

  ensureColumn(db, 'operation_records', 'task_id', 'TEXT');
  ensureColumn(db, 'operation_records', 'stage_id', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_op_records_task
      ON operation_records(task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_op_records_task_stage
      ON operation_records(task_id, stage_id, created_at);
  `);
}

module.exports = {
  loadSqliteModule,
  openDatabase,
  initializeSchema,
};
