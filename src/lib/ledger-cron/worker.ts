import OpenTimestamps from "opentimestamps";

export interface LedgerEnv {
    DB: D1Database;
}

interface PendingAnchorRecord {
    id: string;
    sha256_hash: string;
    ots_proof_payload?: string | null;
}

interface AnchorResult {
    status: "NO_PENDING_RECORDS" | "SUCCESS";
    submittedCount: number;
    finalizedCount: number;
}

const OTS_CALENDAR_URL = "https://a.pool.opentimestamps.org";
const BITCOIN_OTS_NETWORK = "BITCOIN_OPENTIMESTAMPS";
const TX_ID_PATTERN = /#\s*(?:Bitcoin\s+)?transaction id\s+([0-9a-f]{64})/i;

export async function anchorPendingRecords(env: LedgerEnv, batchSize: number = 500): Promise<AnchorResult> {
    const submittedCount = await submitPendingProofs(env, batchSize);
    const finalizedCount = await finalizeSubmittedProofs(env, batchSize);

    if (submittedCount === 0 && finalizedCount === 0) {
        return {
            status: "NO_PENDING_RECORDS",
            submittedCount: 0,
            finalizedCount: 0,
        };
    }

    return {
        status: "SUCCESS",
        submittedCount,
        finalizedCount,
    };
}

async function submitPendingProofs(env: LedgerEnv, batchSize: number): Promise<number> {
    const { results } = await env.DB.prepare(
        `SELECT id, sha256_hash
     FROM archival_records
     WHERE ots_proof_payload IS NULL
       AND sha256_hash IS NOT NULL
       AND is_deleted = 0
     ORDER BY updated_at ASC
     LIMIT ?`
    )
        .bind(batchSize)
        .all<PendingAnchorRecord>();

    if (!results || results.length === 0) {
        return 0;
    }

    const detachedFiles = results.map((record) => createDetachedTimestampFromHash(record.sha256_hash));
    await OpenTimestamps.stamp(detachedFiles, {
        calendars: [OTS_CALENDAR_URL],
        m: 1,
    });

    const updatedAt = Date.now();
    const statements = results.map((record, index) =>
        env.DB.prepare(
            `UPDATE archival_records
             SET ots_proof_payload = ?,
                 blockchain_network = ?,
                 sync_status = 'PENDING_CONFIRMATION',
                 updated_at = ?
             WHERE id = ?`
        ).bind(
            uint8ArrayToBase64(serializeDetached(detachedFiles[index])),
            BITCOIN_OTS_NETWORK,
            updatedAt,
            record.id
        )
    );

    await env.DB.batch(statements);
    return results.length;
}

async function finalizeSubmittedProofs(env: LedgerEnv, batchSize: number): Promise<number> {
    const { results } = await env.DB.prepare(
        `SELECT id, sha256_hash, ots_proof_payload
         FROM archival_records
         WHERE blockchain_tx_hash IS NULL
           AND ots_proof_payload IS NOT NULL
           AND is_deleted = 0
         ORDER BY updated_at ASC
         LIMIT ?`
    )
        .bind(batchSize)
        .all<PendingAnchorRecord>();

    if (!results || results.length === 0) {
        return 0;
    }

    let finalizedCount = 0;

    for (const record of results) {
        const detachedProof = deserializeDetached(record.ots_proof_payload);
        const originalDetached = createDetachedTimestampFromHash(record.sha256_hash);

        let upgraded = false;
        try {
            upgraded = await OpenTimestamps.upgrade(detachedProof);
        } catch {
            // Keep existing proof and try again on the next cron run.
        }

        let bitcoinVerification: { timestamp: number; height: number } | undefined;
        try {
            const verificationResult = await OpenTimestamps.verify(detachedProof, originalDetached, {
                ignoreBitcoinNode: true,
                timeout: 5000,
            });
            bitcoinVerification = verificationResult?.bitcoin;
        } catch {
            bitcoinVerification = undefined;
        }

        const serializedProof = uint8ArrayToBase64(serializeDetached(detachedProof));
        const updatedAt = Date.now();

        if (bitcoinVerification) {
            const txid = extractBitcoinTransactionId(detachedProof);
            if (txid) {
                finalizedCount += 1;
                await env.DB.prepare(
                    `UPDATE archival_records
                     SET blockchain_tx_hash = ?,
                         blockchain_network = ?,
                         ots_proof_payload = ?,
                         anchored_at = ?,
                         sync_status = 'ANCHORED',
                         updated_at = ?
                     WHERE id = ?`
                ).bind(
                    txid,
                    BITCOIN_OTS_NETWORK,
                    serializedProof,
                    new Date(bitcoinVerification.timestamp * 1000).toISOString(),
                    updatedAt,
                    record.id
                ).run();
                continue;
            }
        }

        if (upgraded) {
            await env.DB.prepare(
                `UPDATE archival_records
                 SET ots_proof_payload = ?,
                     blockchain_network = ?,
                     sync_status = 'PENDING_CONFIRMATION',
                     updated_at = ?
                 WHERE id = ?`
            ).bind(serializedProof, BITCOIN_OTS_NETWORK, updatedAt, record.id).run();
        }
    }

    return finalizedCount;
}

function createDetachedTimestampFromHash(hashHex: string): any {
    return OpenTimestamps.DetachedTimestampFile.fromHash(
        new OpenTimestamps.Ops.OpSHA256(),
        Uint8Array.from(Buffer.from(hashHex, "hex"))
    );
}

function deserializeDetached(base64Proof?: string | null): any {
    if (!base64Proof) {
        throw new Error("Missing OpenTimestamps proof payload");
    }

    return OpenTimestamps.DetachedTimestampFile.deserialize(base64ToUint8Array(base64Proof));
}

function serializeDetached(detached: any): Uint8Array {
    const serialized = detached.serializeToBytes();
    return serialized instanceof Uint8Array ? serialized : Uint8Array.from(serialized);
}

function extractBitcoinTransactionId(detached: any): string | null {
    const info = OpenTimestamps.info(detached, { verbose: true });
    const match = info.match(TX_ID_PATTERN);
    return match?.[1] ?? null;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let index = 0; index < bytes.byteLength; index += 1) {
        binary += String.fromCharCode(bytes[index]);
    }

    return btoa(binary);
}

function base64ToUint8Array(base64Data: string): Uint8Array {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let index = 0; index < binaryString.length; index += 1) {
        bytes[index] = binaryString.charCodeAt(index);
    }

    return bytes;
}
