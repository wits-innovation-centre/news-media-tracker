import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArchivalLedgerRecord } from "@/lib/types";

interface WaybackArchiveStatusProps {
    sourceUrl?: string | null;
    record?: ArchivalLedgerRecord | null;
    onRequestSnapshot: () => Promise<void> | void;
    isRequesting?: boolean;
    className?: string;
}

function getWaybackStatusCopy(record?: ArchivalLedgerRecord | null) {
    switch (record?.sync_status) {
        case "SYNCED":
            return { label: "Archived", variant: "default" as const, description: record.uri_or_path ?? undefined };
        case "FAILED":
            return { label: "Failed", variant: "destructive" as const, description: "Retry the snapshot request." };
        case "PENDING_SYNC":
        default:
            return { label: "Pending", variant: "outline" as const, description: "Queued offline" };
    }
}

export function WaybackArchiveStatus({
    sourceUrl,
    record,
    onRequestSnapshot,
    isRequesting = false,
    className,
}: WaybackArchiveStatusProps) {
    const status = getWaybackStatusCopy(record);

    return (
        <div className={className ? `space-y-3 ${className}` : "space-y-3"}>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant={status.variant}>{status.variant === "default" ? "✅" : status.variant === "destructive" ? "❌" : "⏳"} {status.label}</Badge>
                {status.description ? <span className="text-xs text-muted-foreground">{status.description}</span> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void onRequestSnapshot()}
                    disabled={isRequesting || !sourceUrl}
                >
                    {isRequesting ? "Requesting..." : "Request Web Archive Snapshot"}
                </Button>
                {record?.uri_or_path && record.sync_status === "SYNCED" ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(record.uri_or_path ?? undefined, "_blank", "noopener,noreferrer")}
                    >
                        Open Snapshot
                    </Button>
                ) : null}
            </div>
        </div>
    );
}