import * as Comlink from "comlink";
import type { DbWorkerType } from "./worker";

let clientInstance: Comlink.Remote<DbWorkerType> | null = null;

export function getDbClient(): Comlink.Remote<DbWorkerType> | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!clientInstance) {
    const workerInstance = new Worker(
      new URL("./worker.ts", import.meta.url),
      { type: "module" }
    );
    clientInstance = Comlink.wrap<DbWorkerType>(workerInstance);
  }

  return clientInstance;
}

export async function initializeDatabase(): Promise<boolean> {
  const client = getDbClient();
  if (!client) return false;
  return await client.init();
}