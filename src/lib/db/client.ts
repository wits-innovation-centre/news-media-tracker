import * as Comlink from "comlink"
import type { DbWorkerType } from "./worker"

const workerInstance = new Worker(
  new URL("./worker.ts", import.meta.url),
  { type: "module" }
)

export const dbClient = Comlink.wrap<DbWorkerType>(workerInstance)

export async function initializeDatabase() {
  await dbClient.init()
}