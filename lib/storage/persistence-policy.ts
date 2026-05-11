/**
 * Browser storage persistence policy helpers for offline-first single-user operation.
 *
 * These utilities manage the `navigator.storage.persist()` / `navigator.storage.estimate()`
 * lifecycle so the rest of the app never has to reason about browser quota edge-cases directly.
 *
 * None of these functions touch the sync queue or any server contract.
 */

/** Minimum free bytes considered healthy for continued local capture. */
export const QUOTA_LOW_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB
/** Minimum free bytes considered safe – below this the app warns and stops caching aggressively. */
export const QUOTA_CRITICAL_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB
/** Minimum free fraction of total quota considered healthy (0–1). */
export const QUOTA_LOW_FRACTION = 0.2; // 20 %
/** Minimum free fraction of total quota considered safe (0–1). */
export const QUOTA_CRITICAL_FRACTION = 0.05; // 5 %

export type QuotaLevel = 'ok' | 'low' | 'critical' | 'unknown';

export type StorageHealthReport = {
  /** Whether durable persistent storage was granted by the browser. */
  persisted: boolean;
  /** Raw quota estimate, or null when the API is unavailable. */
  quota: StorageEstimate | null;
  /** Derived free-space classification. */
  quotaLevel: QuotaLevel;
  /** Human-readable reason string, useful for logging/telemetry. */
  reason: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Narrow StorageManager injected via dependency for testing. */
export type StorageManagerLike = {
  persisted: () => Promise<boolean>;
  persist: () => Promise<boolean>;
  estimate?: () => Promise<StorageEstimate>;
};

function deriveQuotaLevel(estimate: StorageEstimate): QuotaLevel {
  const { quota, usage } = estimate;
  if (typeof quota !== 'number' || typeof usage !== 'number' || quota <= 0) {
    return 'unknown';
  }
  const free = quota - usage;
  const freeFraction = free / quota;

  if (free < QUOTA_CRITICAL_THRESHOLD_BYTES || freeFraction < QUOTA_CRITICAL_FRACTION) {
    return 'critical';
  }
  if (free < QUOTA_LOW_THRESHOLD_BYTES || freeFraction < QUOTA_LOW_FRACTION) {
    return 'low';
  }
  return 'ok';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Request durable persistent storage from the browser.
 *
 * Returns `true` if the browser has already granted persistence or grants it
 * during this call; `false` otherwise. Never throws.
 */
export async function requestPersistentStorage(
  storage: StorageManagerLike = navigator.storage,
): Promise<boolean> {
  try {
    if (await storage.persisted()) {
      return true;
    }
    const granted = await storage.persist();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Estimate storage quota and classify free space.
 *
 * Returns `null` when the Storage Estimation API is unavailable (e.g. in a
 * non-secure context or an older browser).
 */
export async function estimateStorageQuota(
  storage: StorageManagerLike = navigator.storage,
): Promise<{ estimate: StorageEstimate; level: QuotaLevel } | null> {
  if (typeof storage.estimate !== 'function') {
    return null;
  }
  try {
    const estimate = await storage.estimate();
    return { estimate, level: deriveQuotaLevel(estimate) };
  } catch {
    return null;
  }
}

/**
 * Run a full storage health check: request persistence AND estimate quota.
 *
 * This is the primary entry-point used by `BootPWA`.
 */
export async function getStorageHealthReport(
  storage: StorageManagerLike = navigator.storage,
): Promise<StorageHealthReport> {
  const persisted = await requestPersistentStorage(storage);
  const quotaResult = await estimateStorageQuota(storage);

  if (!quotaResult) {
    return {
      persisted,
      quota: null,
      quotaLevel: 'unknown',
      reason: persisted
        ? 'persistence granted; quota API unavailable'
        : 'persistence denied; quota API unavailable',
    };
  }

  const { estimate, level } = quotaResult;
  const freeMb =
    typeof estimate.quota === 'number' && typeof estimate.usage === 'number'
      ? Math.round((estimate.quota - estimate.usage) / (1024 * 1024))
      : null;

  const reasons: string[] = [];
  if (!persisted) reasons.push('persistence denied');
  if (level === 'critical') reasons.push('storage critically low');
  else if (level === 'low') reasons.push('storage low');
  if (freeMb !== null) reasons.push(`~${freeMb} MB free`);

  return {
    persisted,
    quota: estimate,
    quotaLevel: level,
    reason: reasons.length ? reasons.join('; ') : 'ok',
  };
}
