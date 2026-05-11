import {
  estimateStorageQuota,
  getStorageHealthReport,
  QUOTA_CRITICAL_THRESHOLD_BYTES,
  QUOTA_LOW_THRESHOLD_BYTES,
  requestPersistentStorage,
  type StorageManagerLike,
} from './persistence-policy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(overrides: Partial<StorageManagerLike> = {}): StorageManagerLike {
  return {
    persisted: jest.fn().mockResolvedValue(false),
    persist: jest.fn().mockResolvedValue(true),
    estimate: jest.fn().mockResolvedValue({ quota: 200 * 1024 * 1024, usage: 10 * 1024 * 1024 }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// requestPersistentStorage
// ---------------------------------------------------------------------------

describe('requestPersistentStorage', () => {
  it('returns true immediately when already persisted', async () => {
    const storage = makeStorage({ persisted: jest.fn().mockResolvedValue(true) });
    const result = await requestPersistentStorage(storage);
    expect(result).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('calls persist() and returns the grant result when not yet persisted', async () => {
    const storage = makeStorage({
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue(true),
    });
    const result = await requestPersistentStorage(storage);
    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('returns false when persist() is denied', async () => {
    const storage = makeStorage({
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue(false),
    });
    const result = await requestPersistentStorage(storage);
    expect(result).toBe(false);
  });

  it('returns false and does not throw when persisted() throws', async () => {
    const storage = makeStorage({
      persisted: jest.fn().mockRejectedValue(new Error('security error')),
    });
    await expect(requestPersistentStorage(storage)).resolves.toBe(false);
  });

  it('returns false and does not throw when persist() throws', async () => {
    const storage = makeStorage({
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockRejectedValue(new Error('quota error')),
    });
    await expect(requestPersistentStorage(storage)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// estimateStorageQuota
// ---------------------------------------------------------------------------

describe('estimateStorageQuota', () => {
  it('returns null when estimate API is unavailable', async () => {
    const storage: StorageManagerLike = {
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue(false),
      // no estimate property
    };
    const result = await estimateStorageQuota(storage);
    expect(result).toBeNull();
  });

  it('classifies healthy quota as ok', async () => {
    const storage = makeStorage({
      estimate: jest.fn().mockResolvedValue({
        quota: 200 * 1024 * 1024,
        usage: 10 * 1024 * 1024,
      }),
    });
    const result = await estimateStorageQuota(storage);
    expect(result?.level).toBe('ok');
  });

  it('classifies quota as low when free is below low threshold', async () => {
    const usage = 200 * 1024 * 1024 - QUOTA_LOW_THRESHOLD_BYTES + 1024; // just under threshold
    const storage = makeStorage({
      estimate: jest.fn().mockResolvedValue({ quota: 200 * 1024 * 1024, usage }),
    });
    const result = await estimateStorageQuota(storage);
    expect(result?.level).toBe('low');
  });

  it('classifies quota as critical when free is below critical threshold', async () => {
    const usage = 200 * 1024 * 1024 - QUOTA_CRITICAL_THRESHOLD_BYTES + 1024;
    const storage = makeStorage({
      estimate: jest.fn().mockResolvedValue({ quota: 200 * 1024 * 1024, usage }),
    });
    const result = await estimateStorageQuota(storage);
    expect(result?.level).toBe('critical');
  });

  it('classifies quota as unknown when quota is 0', async () => {
    const storage = makeStorage({
      estimate: jest.fn().mockResolvedValue({ quota: 0, usage: 0 }),
    });
    const result = await estimateStorageQuota(storage);
    expect(result?.level).toBe('unknown');
  });

  it('returns null and does not throw when estimate() throws', async () => {
    const storage = makeStorage({
      estimate: jest.fn().mockRejectedValue(new Error('not supported')),
    });
    await expect(estimateStorageQuota(storage)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getStorageHealthReport
// ---------------------------------------------------------------------------

describe('getStorageHealthReport', () => {
  it('returns a healthy report when persistence is granted and quota is ok', async () => {
    const storage = makeStorage({
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue(true),
      estimate: jest.fn().mockResolvedValue({
        quota: 200 * 1024 * 1024,
        usage: 5 * 1024 * 1024,
      }),
    });
    const report = await getStorageHealthReport(storage);
    expect(report.persisted).toBe(true);
    expect(report.quotaLevel).toBe('ok');
    expect(report.reason).toContain('MB free');
  });

  it('includes persistence denied in reason when persist is denied', async () => {
    const storage = makeStorage({
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue(false),
      estimate: jest.fn().mockResolvedValue({
        quota: 200 * 1024 * 1024,
        usage: 5 * 1024 * 1024,
      }),
    });
    const report = await getStorageHealthReport(storage);
    expect(report.persisted).toBe(false);
    expect(report.reason).toContain('persistence denied');
  });

  it('includes low storage warning when quota is low', async () => {
    const usage = 200 * 1024 * 1024 - QUOTA_LOW_THRESHOLD_BYTES + 1024;
    const storage = makeStorage({
      persisted: jest.fn().mockResolvedValue(true),
      estimate: jest.fn().mockResolvedValue({ quota: 200 * 1024 * 1024, usage }),
    });
    const report = await getStorageHealthReport(storage);
    expect(report.quotaLevel).toBe('low');
    expect(report.reason).toContain('storage low');
  });

  it('includes critical storage warning when quota is critical', async () => {
    const usage = 200 * 1024 * 1024 - QUOTA_CRITICAL_THRESHOLD_BYTES + 1024;
    const storage = makeStorage({
      persisted: jest.fn().mockResolvedValue(true),
      estimate: jest.fn().mockResolvedValue({ quota: 200 * 1024 * 1024, usage }),
    });
    const report = await getStorageHealthReport(storage);
    expect(report.quotaLevel).toBe('critical');
    expect(report.reason).toContain('storage critically low');
  });

  it('handles missing quota API gracefully', async () => {
    const storage: StorageManagerLike = {
      persisted: jest.fn().mockResolvedValue(false),
      persist: jest.fn().mockResolvedValue(true),
    };
    const report = await getStorageHealthReport(storage);
    expect(report.quota).toBeNull();
    expect(report.quotaLevel).toBe('unknown');
    expect(report.reason).toContain('quota API unavailable');
  });
});
