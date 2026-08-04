function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function hashArrayBufferToSha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return bytesToHex(new Uint8Array(digest));
}

export async function hashBlobToSha256Hex(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    return hashArrayBufferToSha256Hex(arrayBuffer);
}

export async function hashStringToSha256Hex(input: string): Promise<string> {
    const encoded = new TextEncoder().encode(input);
    return hashArrayBufferToSha256Hex(encoded.buffer);
}

function stableSortValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => stableSortValue(entry));
    }

    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
        const sorted: Record<string, unknown> = {};

        for (const key of keys) {
            sorted[key] = stableSortValue(record[key]);
        }

        return sorted;
    }

    return value;
}

export function buildCanonicalReportPayload(
    frontmatter: Record<string, unknown>,
    body: string
): string {
    return JSON.stringify({
        frontmatter: stableSortValue(frontmatter),
        body,
    });
}
