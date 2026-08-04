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
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          template_group_id TEXT,
          created_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL
        );

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
          user_id TEXT,
          device_id TEXT,
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
          secondary_document_id TEXT,
          author_id TEXT NOT NULL,
          user_id TEXT,
          device_id TEXT,
          action TEXT NOT NULL,
          source_id TEXT,
          target_id TEXT,
          entity_type TEXT,
          similarity_score REAL,
          base_frontmatter TEXT,
          base_body TEXT,
          secondary_base_frontmatter TEXT,
          secondary_base_body TEXT,
          proposed_title TEXT NOT NULL,
          proposed_frontmatter TEXT NOT NULL,
          proposed_body TEXT NOT NULL,
          metadata TEXT,
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
          archive_type TEXT NOT NULL, -- 'LOCAL_OPFS', 'WAYBACK_MACHINE', 'WEBTORRENT', 'USER_DOWNLOAD_COPY', 'REPORT_CONTENT'
          sha256_hash TEXT NOT NULL,
          ipfs_cid TEXT,
          torrent_infohash TEXT,
          uri_or_path TEXT,
          file_size_bytes INTEGER,
          device_id TEXT NOT NULL,
          last_verified_at INTEGER,   -- Timestamp (ms) of last health check
          health_status TEXT DEFAULT 'UNCHECKED', -- 'HEALTHY', 'CORRUPTED', 'MISSING'
          sync_status TEXT DEFAULT 'PENDING_ANCHOR', -- 'PENDING_ANCHOR', 'PENDING_CONFIRMATION', 'ANCHORED', 'ANCHOR_FAILED'
          blockchain_tx_hash TEXT,    -- Final Bitcoin transaction id after OTS upgrade/verification
          blockchain_network TEXT,    -- 'BITCOIN_OPENTIMESTAMPS'
          ots_proof_payload TEXT,     -- Base64 .ots proof payload
          anchored_at TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_deleted INTEGER DEFAULT 0,
          synced_at INTEGER
        );

        -- Index for instant local integrity checks
        CREATE INDEX IF NOT EXISTS idx_archival_health 
        ON archival_records (sha256_hash, health_status, last_verified_at);

        CREATE INDEX IF NOT EXISTS idx_archival_records_wayback_sync
        ON archival_records (workspace_id, archive_type, sync_status, updated_at);
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
      tryExec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          template_group_id TEXT,
          created_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL
        )
      `)
      tryExec("ALTER TABLE workspaces ADD COLUMN template_group_id TEXT")

      tryExec("ALTER TABLE notes ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE notes ADD COLUMN created_by TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN updated_by TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN deleted_by TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN user_id TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN device_id TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN updated_at INTEGER")
      tryExec("ALTER TABLE notes ADD COLUMN is_deleted INTEGER DEFAULT 0")
      tryExec("ALTER TABLE notes ADD COLUMN synced_at INTEGER")

      tryExec("ALTER TABLE schemas ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE schemas ADD COLUMN updated_at INTEGER")
      tryExec("ALTER TABLE schemas ADD COLUMN is_deleted INTEGER DEFAULT 0")
      tryExec("ALTER TABLE schemas ADD COLUMN synced_at INTEGER")

      tryExec("ALTER TABLE schema_groups ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE schema_groups ADD COLUMN updated_at INTEGER")
      tryExec("ALTER TABLE schema_groups ADD COLUMN is_deleted INTEGER DEFAULT 0")
      tryExec("ALTER TABLE schema_groups ADD COLUMN synced_at INTEGER")

      tryExec("ALTER TABLE specifications ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE specifications ADD COLUMN updated_at INTEGER")
      tryExec("ALTER TABLE specifications ADD COLUMN is_deleted INTEGER DEFAULT 0")
      tryExec("ALTER TABLE specifications ADD COLUMN synced_at INTEGER")

      tryExec("ALTER TABLE specification_registry ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE specification_registry ADD COLUMN updated_at INTEGER")
      tryExec("ALTER TABLE specification_registry ADD COLUMN is_deleted INTEGER DEFAULT 0")
      tryExec("ALTER TABLE specification_registry ADD COLUMN synced_at INTEGER")

      tryExec("ALTER TABLE merge_queue ADD COLUMN workspace_id TEXT DEFAULT 'default'")
      tryExec("ALTER TABLE merge_queue ADD COLUMN secondary_document_id TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN user_id TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN device_id TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN source_id TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN target_id TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN entity_type TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN similarity_score REAL")
      tryExec("ALTER TABLE merge_queue ADD COLUMN secondary_base_frontmatter TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN secondary_base_body TEXT")
      tryExec("ALTER TABLE merge_queue ADD COLUMN metadata TEXT")

      tryExec("ALTER TABLE archival_records ADD COLUMN sync_status TEXT DEFAULT 'PENDING_ANCHOR'")
      tryExec("ALTER TABLE archival_records ADD COLUMN ots_proof_payload TEXT")

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