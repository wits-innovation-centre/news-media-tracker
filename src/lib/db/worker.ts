import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import * as Comlink from "comlink"
import { drizzle } from 'drizzle-orm/d1'
import { getTableName, getTableColumns, is, type Column } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from './schema'

let sqliteDb: any = null
export let db: ReturnType<typeof drizzle<typeof schema>>

async function syncDrizzleSchema(dbClient: {
  query: (sql: string, bind?: any[]) => Promise<any[]>;
  execute: (sql: string, bind?: any[]) => Promise<any>;
}) {
  for (const exportValue of Object.values(schema)) {
    // Only process actual Drizzle SQLite table definitions
    if (!exportValue || !is(exportValue, SQLiteTable)) {
      continue;
    }

    try {
      const tableName = getTableName(exportValue);
      const columns = getTableColumns(exportValue);

      const existingCols: Array<{ name: string }> = await dbClient.query(
        `PRAGMA table_info("${tableName}")`
      );

      // 1. Table doesn't exist -> CREATE TABLE dynamically from Drizzle schema
      if (!existingCols || existingCols.length === 0) {
        const colDefs = (Object.values(columns) as Column[]).map((col) => {
          let def = `"${col.name}" ${col.getSQLType().toUpperCase()}`;
          if (col.primary) def += " PRIMARY KEY";
          if (col.notNull) def += " NOT NULL";
          return def;
        });

        await dbClient.execute(
          `CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(", ")});`
        );
        continue;
      }

      // 2. Table exists -> ALTER TABLE for any missing columns
      const existingColumnNames = new Set(existingCols.map((col) => col.name));

      for (const colObj of Object.values(columns) as Column[]) {
        if (!existingColumnNames.has(colObj.name)) {
          const dataType = colObj.getSQLType().toUpperCase();
          await dbClient.execute(
            `ALTER TABLE "${tableName}" ADD COLUMN "${colObj.name}" ${dataType};`
          );
        }
      }
    } catch (err) {
      console.error(`Failed to sync schema for table:`, err);
    }
  }
}

const dbWorkerAPI = {
  async init() {
    if (sqliteDb) return true

    try {
      // @ts-expect-error SQLite WASM types
      const sqlite3 = await sqlite3InitModule({ print: console.log, printErr: console.error })
      const hasOpfsDbCtor = typeof sqlite3?.oo1?.OpfsDb === "function"
      const hasOpfsVfs = Boolean(sqlite3?.capi?.sqlite3_vfs_find?.("opfs"))

      if (hasOpfsDbCtor && hasOpfsVfs) {
        try {
          sqliteDb = new sqlite3.oo1.OpfsDb("/obsidian_vault.sqlite3")
        } catch {
          sqliteDb = new sqlite3.oo1.DB("/obsidian_vault.sqlite3", "ct")
        }
      } else {
        sqliteDb = new sqlite3.oo1.DB("/obsidian_vault.sqlite3", "ct")
      }

      db = drizzle(sqliteDb, { schema })

      // Base table schema guard
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          icon_path TEXT,
          template_group_id TEXT,
          created_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL
        );
      `)

      // Auto-migrate missing tables and columns from schema.ts
      await syncDrizzleSchema(dbWorkerAPI)

      return true
    } catch (error) {
      console.error("Failed to initialize SQLite WASM module:", error)
      throw error
    }
  },

  async query(sql: string, bind: any[] = []): Promise<any[]> {
    if (!sqliteDb) throw new Error("Database worker invoked prior to initializing engine arrays.")
    const rows: any[] = []
    sqliteDb.exec({ sql, bind, rowMode: "object", callback: (row: any) => rows.push(row) })
    return rows
  },

  async execute(sql: string, bind: any[] = []): Promise<void> {
    if (!sqliteDb) throw new Error("Database worker invoked prior to initializing engine arrays.")
    sqliteDb.exec({ sql, bind })
  }
}

Comlink.expose(dbWorkerAPI)
export type DbWorkerType = typeof dbWorkerAPI