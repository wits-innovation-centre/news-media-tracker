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

export const dbClient = new Proxy({} as Comlink.Remote<DbWorkerType>, {
  get(_target, prop) {
    const client = getDbClient();
    if (!client) {
      throw new Error("Database client can only be accessed in the browser.");
    }
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export async function initializeDatabase(): Promise<boolean> {
  const client = getDbClient();
  if (!client) return false;
  return await client.init();
}