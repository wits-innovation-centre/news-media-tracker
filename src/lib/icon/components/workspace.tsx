import { useState, useEffect } from "react";
import { Folder } from 'lucide-react';

export function WorkspaceIcon({ src, className = "h-4 w-4 shrink-0 rounded object-cover" }: { src?: string; className?: string }) {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [src]);

    if (!src || hasError) {
        return <Folder className={`${className} text-muted-foreground`} />;
    }

    return (
        <img
            src={src}
            alt=""
            className={className}
            onError={() => setHasError(true)}
        />
    );
}