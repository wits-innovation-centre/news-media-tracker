import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import * as Comlink from "comlink"

let db: any = null

const dbWorkerAPI = {
  async init() {
    if (db) return true

    try {
      // @ts-expect-error - SQLite WASM types are incomplete
      const sqlite3 = await sqlite3InitModule({
        print: console.log,
        printErr: console.error
      })

      const hasOpfsDbCtor = typeof sqlite3?.oo1?.OpfsDb === "function"
      const hasOpfsVfs = Boolean(sqlite3?.capi?.sqlite3_vfs_find?.("opfs"))

      if (hasOpfsDbCtor && hasOpfsVfs) {
        try {
          db = new sqlite3.oo1.OpfsDb("/obsidian_vault.sqlite3")
        } catch {
          db = new sqlite3.oo1.DB("/obsidian_vault.sqlite3", "ct")
        }
      } else {
        db = new sqlite3.oo1.DB("/obsidian_vault.sqlite3", "ct")
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS schemas (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          description TEXT,
          kind TEXT DEFAULT 'custom',
          parentSchemaId TEXT,
          groupId TEXT,
          groupName TEXT,
          subtypeFields TEXT,
          fields TEXT NOT NULL,
          updated_at INTEGER,
          is_deleted INTEGER DEFAULT 0,
          synced_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS schema_groups (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          description TEXT,
          updated_at INTEGER,
          is_deleted INTEGER DEFAULT 0,
          synced_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL DEFAULT 'default',
          schema_id TEXT NOT NULL,
          parent_id TEXT,
          title TEXT NOT NULL,
          frontmatter TEXT NOT NULL,
          body TEXT NOT NULL,
          created_by TEXT,
          updated_by TEXT,
          deleted_by TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_deleted INTEGER DEFAULT 0,
          synced_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS specifications (
          kind TEXT NOT NULL,
          value TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT 'default',
          updated_at INTEGER,
          is_deleted INTEGER DEFAULT 0,
          synced_at INTEGER,
          PRIMARY KEY (workspace_id, kind, value)
        );

        CREATE TABLE IF NOT EXISTS specification_registry (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          description TEXT,
          updated_at INTEGER,
          is_deleted INTEGER DEFAULT 0,
          synced_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS merge_queue (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL DEFAULT 'default',
          document_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          action TEXT NOT NULL,
          base_frontmatter TEXT,
          base_body TEXT,
          proposed_title TEXT NOT NULL,
          proposed_frontmatter TEXT NOT NULL,
          proposed_body TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          reviewed_by TEXT,
          review_comment TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          synced_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS archival_records (
          id TEXT PRIMARY KEY,
          article_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT 'default',
          archive_type TEXT NOT NULL, -- 'LOCAL_OPFS', 'WAYBACK_MACHINE', 'WEBTORRENT', 'USER_DOWNLOAD_COPY'
          sha256_hash TEXT NOT NULL,
          ipfs_cid TEXT,
          torrent_infohash TEXT,
          uri_or_path TEXT,
          file_size_bytes INTEGER,
          device_id TEXT NOT NULL,
          last_verified_at INTEGER,   -- Timestamp (ms) of last health check
          health_status TEXT DEFAULT 'UNCHECKED', -- 'HEALTHY', 'CORRUPTED', 'MISSING'
          blockchain_tx_hash TEXT,    -- Merkle Root Hash
          blockchain_network TEXT,    -- 'BITCOIN_OPENTIMESTAMPS'
          anchored_at TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_deleted INTEGER DEFAULT 0,
          synced_at INTEGER
        );

        -- Index for instant local integrity checks
        CREATE INDEX IF NOT EXISTS idx_archival_health 
        ON archival_records (sha256_hash, health_status, last_verified_at);
      `)

      const tryExec = (sql: string) => {
        try {
          db.exec(sql)
        } catch {
          // Ignore duplicate column additions for existing databases
        }
      }

      // Existing migrations
      tryExec("ALTER TABLE schemas ADD COLUMN groupId TEXT")
      tryExec("ALTER TABLE schemas ADD COLUMN groupName TEXT")
      tryExec("ALTER TABLE schemas ADD COLUMN subtypeFields TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN parent_id TEXT")

      // Multi-User and Sync Migrations
      tryExec("ALTER TABLE notes ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE notes ADD COLUMN created_by TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN updated_by TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN deleted_by TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN updated_at INTEGER")
      tryExec("ALTER TABLE notes ADD COLUMN is_deleted INTEGER DEFAULT 0")
      tryExec("ALTER TABLE notes ADD COLUMN synced_at INTEGER")

      tryExec("ALTER TABLE schemas ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE schemas ADD COLUMN updated_at INTEGER")
      tryExec("ALTER TABLE schemas ADD COLUMN is_deleted INTEGER DEFAULT 0")
      tryExec("ALTER TABLE schemas ADD COLUMN synced_at INTEGER")

      return true
    } catch (error) {
      console.error("Failed to initialize SQLite WASM module:", error)
      throw error
    }
  },

  async query(sql: string, bind: any[] = []): Promise<any[]> {
    if (!db) throw new Error("Database worker invoked prior to initializing engine arrays.")
    const rows: any[] = []
    db.exec({
      sql,
      bind,
      rowMode: "object",
      callback: (row: any) => rows.push(row),
    })
    return rows
  },

  async execute(sql: string, bind: any[] = []): Promise<void> {
    if (!db) throw new Error("Database worker invoked prior to initializing engine arrays.")
    db.exec({ sql, bind })
  }
}

Comlink.expose(dbWorkerAPI)
export type DbWorkerType = typeof dbWorkerAPI