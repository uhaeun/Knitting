import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

let instance: SQLiteDatabase | null = null;

const SCHEMA_VERSION = 2;

/** 앱 전체가 공유하는 DB 하나. 첫 호출에서 마이그레이션까지 끝낸다. */
export function getDb(): SQLiteDatabase {
  if (instance) return instance;
  const db = openDatabaseSync('knitting.db');
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  migrate(db);
  instance = db;
  return db;
}

function migrate(db: SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  db.withTransactionSync(() => {
    if (current < 1) {
      db.execSync(`
        CREATE TABLE IF NOT EXISTS projects (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
          started_at    TEXT NOT NULL,
          finished_at   TEXT,
          cover_post_id TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL,
          deleted_at    TEXT
        );
        CREATE INDEX IF NOT EXISTS projects_live ON projects (created_at DESC) WHERE deleted_at IS NULL;

        CREATE TABLE IF NOT EXISTS posts (
          id          TEXT PRIMARY KEY,
          project_id  TEXT NOT NULL REFERENCES projects(id),
          photo_path  TEXT NOT NULL,
          thumb_path  TEXT NOT NULL,
          width       INTEGER NOT NULL,
          height      INTEGER NOT NULL,
          taken_at    TEXT NOT NULL,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          deleted_at  TEXT
        );
        CREATE INDEX IF NOT EXISTS posts_by_project ON posts (project_id, taken_at, created_at) WHERE deleted_at IS NULL;
      `);
    }
    if (current < 2) {
      // 2: 공개 범위 + 서버 동기화 표시
      db.execSync(`
        ALTER TABLE projects ADD COLUMN default_visibility TEXT NOT NULL DEFAULT 'private';
        ALTER TABLE projects ADD COLUMN synced_at TEXT;
        ALTER TABLE posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
        ALTER TABLE posts ADD COLUMN synced_at TEXT;
      `);
    }
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}
