import * as Comlink from "comlink";
import type { ArchiveWorkerType } from "./worker";

const workerInstance = new Worker(
  new URL("./worker.ts", import.meta.url),
  { type: "module" }
);

export const archiveClient = Comlink.wrap<ArchiveWorkerType>(workerInstance);

// Utility to fetch or create a persistent Device ID for local health tracking
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem("app_device_id");
  if (!deviceId) {
    deviceId = `dev-${crypto.randomUUID()}`;
    localStorage.setItem("app_device_id", deviceId);
  }
  return deviceId;
}