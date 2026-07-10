import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import * as Comlink from "comlink"

let db: any = null

const dbWorkerAPI = {
  async init() {
    if (db) return true

    try {
      const sqlite3 = await sqlite3InitModule()

      if ("opfs" in sqlite3) {
        db = new sqlite3.oo1.OpfsDb("/obsidian_vault.sqlite3")
        console.log("SQLite successfully mounted onto OPFS storage.")
      } else {
        if (!self.isSecureContext) {
          console.error("OPFS Fail: Context is not secure (requires HTTPS or localhost).");
        } else if (!("storage" in navigator && "getDirectory" in navigator.storage)) {
          console.error("OPFS Fail: The browser API 'navigator.storage.getDirectory' is missing completely.");
        } else if (typeof SharedArrayBuffer === "undefined") {
          console.error("OPFS Fail: SharedArrayBuffer is missing! You MUST configure your server to emit COOP and COEP headers.");
        }

        db = new sqlite3.oo1.DB("/obsidian_vault.sqlite3", "ct")
        console.warn("OPFS is unsupported. Operating on transient fallback storage (data will lose state on refresh).")
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS schemas (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          kind TEXT DEFAULT 'custom',
          parentSchemaId TEXT,
          groupId TEXT,
          groupName TEXT,
          subtypeFields TEXT,
          fields TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS schema_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT
        );
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          schema_id TEXT NOT NULL,
          parent_id TEXT,
          title TEXT NOT NULL,
          frontmatter TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS specifications (
          kind TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (kind, value)
        );
        CREATE TABLE IF NOT EXISTS specification_registry (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT
        );
      `)

      const tryExec = (sql: string) => {
        try {
          db.exec(sql)
        } catch {
          // Ignore duplicate-column migrations for existing databases.
        }
      }

      tryExec("ALTER TABLE schemas ADD COLUMN groupId TEXT")
      tryExec("ALTER TABLE schemas ADD COLUMN groupName TEXT")
      tryExec("ALTER TABLE schemas ADD COLUMN subtypeFields TEXT")
      tryExec("ALTER TABLE notes ADD COLUMN parent_id TEXT")
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