import * as Comlink from "comlink";
import { hashArrayBufferToSha256Hex } from "../ledger-cron/utils";

export interface SaveArchiveInput {
  recordId: string;
  articleId: string;
  fileBuffer: ArrayBuffer;
  fileName: string;
  archiveType: string;
  deviceId: string;
}

export interface VerificationResult {
  recordId: string;
  healthStatus: "HEALTHY" | "CORRUPTED" | "MISSING";
  sha256Hash?: string;
  lastVerifiedAt: number;
}

const archiveWorkerAPI = {
  /**
   * Writes raw file binary to an isolated OPFS sub-directory (/archives)
   * and computes its cryptographic SHA-256 fingerprint.
   */
  async saveAndHashArchive(input: SaveArchiveInput) {
    const { recordId, fileBuffer, fileName } = input;

    // 1. Calculate SHA-256 Hash off the main thread
    const sha256Hash = await hashArrayBufferToSha256Hex(fileBuffer);

    // 2. Access OPFS Root -> /archives directory
    const root = await navigator.storage.getDirectory();
    const archivesDir = await root.getDirectoryHandle("archives", { create: true });

    // Save as /archives/{recordId}_{fileName}
    const safeStorageName = `${recordId}_${fileName}`;
    const fileHandle = await archivesDir.getFileHandle(safeStorageName, { create: true });

    const writableStream = await fileHandle.createWritable();
    await writableStream.write(fileBuffer);
    await writableStream.close();

    return {
      recordId,
      sha256Hash,
      storagePath: `archives/${safeStorageName}`,
      fileSizeBytes: fileBuffer.byteLength,
      lastVerifiedAt: Date.now(),
      healthStatus: "HEALTHY" as const
    };
  },

  /**
   * Reads an existing OPFS file and re-verifies its cryptographic hash to guarantee
   * the local file hasn't been corrupted or deleted.
   */
  async verifyArchiveHealth(recordId: string, storagePath: string, expectedHash: string): Promise<VerificationResult> {
    const now = Date.now();
    try {
      const root = await navigator.storage.getDirectory();
      const pathParts = storagePath.split("/");
      const fileName = pathParts[pathParts.length - 1];

      const archivesDir = await root.getDirectoryHandle("archives");
      const fileHandle = await archivesDir.getFileHandle(fileName);
      const file = await fileHandle.getFile();

      const arrayBuffer = await file.arrayBuffer();
      const currentHash = await hashArrayBufferToSha256Hex(arrayBuffer);

      const isMatch = currentHash.toLowerCase() === expectedHash.toLowerCase();

      return {
        recordId,
        healthStatus: isMatch ? "HEALTHY" : "CORRUPTED",
        sha256Hash: currentHash,
        lastVerifiedAt: now
      };
    } catch {
      return {
        recordId,
        healthStatus: "MISSING",
        lastVerifiedAt: now
      };
    }
  }
};

Comlink.expose(archiveWorkerAPI);
export type ArchiveWorkerType = typeof archiveWorkerAPI;