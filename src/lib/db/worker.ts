import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import * as Comlink from "comlink"
import { drizzle } from 'drizzle-orm/d1'
import { getTableName, getTableColumns, type Table } from 'drizzle-orm'
import * as schema from './schema'

let sqliteDb: any = null
export let db: ReturnType<typeof drizzle<typeof schema>>

function syncDrizzleSchema() {
  for (const exportValue of Object.values(schema)) {
    if (!exportValue || typeof exportValue !== "object" || !("_" in exportValue)) {
      continue
    }

    try {
      const table = exportValue as Table
      const tableName = getTableName(table)
      const columns = getTableColumns(table)

      // Query SQLite for existing columns in this table
      const existingCols: Array<{ name: string }> = []
      sqliteDb.exec({
        sql: `PRAGMA table_info("${tableName}")`,
        rowMode: "object",
        callback: (row: any) => existingCols.push(row)
      })

      // Skip if the table hasn't been created yet
      if (existingCols.length === 0) continue

      const existingColumnNames = new Set(existingCols.map((c) => c.name))

      // Compare Drizzle schema columns against SQLite table columns
      for (const colObj of Object.values(columns)) {
        if (!existingColumnNames.has(colObj.name)) {
          const dataType = colObj.getSQLType().toUpperCase()
          sqliteDb.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${colObj.name}" ${dataType};`)
        }
      }
    } catch {
      continue
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

      // Auto-migrate missing columns defined in schema.ts
      syncDrizzleSchema()

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