export const OFFLINE_SYNC_ENDPOINT = '/api/sync';
export const OFFLINE_SYNC_TAG = 'sync-api-posts';
export const OFFLINE_QUEUE_DB = 'offline-post-queue';
export const OFFLINE_QUEUE_STORE = 'queue';

export type OfflineReplayOperation = {
  queueId?: number;
  requestId?: string;
  method: string;
  endpoint: string;
  body?: unknown;
};

/** Minimal typing for the Background Sync API extension on ServiceWorkerRegistration. */
interface SyncManager {
  register: (tag: string) => Promise<void>;
}

/** ServiceWorkerRegistration extended with the optional Background Sync API. */
export interface ServiceWorkerRegistrationWithSync extends ServiceWorkerRegistration {
  sync: SyncManager;
}

/**
 * Type guard that checks whether a ServiceWorkerRegistration exposes the
 * Background Sync API (`reg.sync.register`).
 */
export const hasSyncManager = (
  reg: ServiceWorkerRegistration,
): reg is ServiceWorkerRegistrationWithSync =>
  'sync' in reg &&
  typeof (reg as ServiceWorkerRegistrationWithSync).sync?.register === 'function';

/**
 * Read the number of pending offline-queued operations from IndexedDB.
 *
 * Returns `0` in any of the following cases:
 * - Running in an SSR context (no `window`)
 * - The browser does not support IndexedDB
 * - The offline queue database or store does not exist yet
 * - Any IndexedDB error occurs
 */
export function readOfflineQueueCount(): Promise<number> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(0);
  }
  return new Promise<number>((resolve) => {
    try {
      const open = window.indexedDB.open(OFFLINE_QUEUE_DB);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
          db.close();
          resolve(0);
          return;
        }
        const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readonly');
        const countReq = tx.objectStore(OFFLINE_QUEUE_STORE).count();
        countReq.onsuccess = () => {
          db.close();
          resolve(countReq.result);
        };
        countReq.onerror = () => {
          db.close();
          resolve(0);
        };
      };
      open.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}
