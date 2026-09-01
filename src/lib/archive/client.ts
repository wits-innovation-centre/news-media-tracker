import * as Comlink from "comlink";
import type { ArchiveWorkerType } from "./worker";

let clientInstance: Comlink.Remote<ArchiveWorkerType> | null = null;

export function getArchiveClient(): Comlink.Remote<ArchiveWorkerType> | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }

  if (!clientInstance) {
    const workerInstance = new Worker(
      new URL("./worker.ts", import.meta.url),
      { type: "module" }
    );
    clientInstance = Comlink.wrap<ArchiveWorkerType>(workerInstance);
  }

  return clientInstance;
}

export const archiveClient = new Proxy({} as Comlink.Remote<ArchiveWorkerType>, {
  get(_target, prop) {
    const client = getArchiveClient();
    if (!client) {
      throw new Error("Archive client can only be accessed in the browser.");
    }
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

// Utility to fetch or create a persistent Device ID for local health tracking
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "";
  }
  let deviceId = localStorage.getItem("app_device_id");
  if (!deviceId) {
    deviceId = `dev-${crypto.randomUUID()}`;
    localStorage.setItem("app_device_id", deviceId);
  }
  return deviceId;
}