import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LedgerBadgeProps {
    blockchainTxHash?: string | null;
    otsProofPayload?: string | null;
    className?: string;
    proofFileName?: string;
    verifyUrl?: string;
}

function base64ToBlob(base64Data: string): Blob {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);

    for (let index = 0; index < binaryString.length; index += 1) {
        bytes[index] = binaryString.charCodeAt(index);
    }

    return new Blob([bytes], { type: "application/octet-stream" });
}

export function LedgerBadge({
    blockchainTxHash,
    otsProofPayload,
    className,
    proofFileName = "proof.ots",
    verifyUrl,
}: LedgerBadgeProps) {
    const isAnchored = Boolean(blockchainTxHash);

    const handleDownloadProof = () => {
        if (!otsProofPayload) return;

        const blob = base64ToBlob(otsProofPayload);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = proofFileName;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!isAnchored) {
        return (
            <Badge variant="outline" className={className}>
                <span role="img" aria-label="pending anchor">
                    🟡
                </span>
                Pending Anchor
            </Badge>
        );
    }

    const resolvedVerifyUrl =
        verifyUrl ??
        `https://mempool.space/tx/${encodeURIComponent(String(blockchainTxHash))}`;

    return (
        <div className={className ? `flex items-center gap-2 ${className}` : "flex items-center gap-2"}>
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                <span role="img" aria-label="anchored to bitcoin">
                    🟢
                </span>
                Anchored to Bitcoin
            </Badge>
            {otsProofPayload ? (
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadProof}>
                    Download .ots
                </Button>
            ) : null}
            <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => window.open(resolvedVerifyUrl, "_blank", "noopener,noreferrer")}
            >
                Verify
            </Button>
        </div>
    );
}
