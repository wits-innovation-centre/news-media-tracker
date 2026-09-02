// src/lib/sync/transport.ts

export interface SyncPushPayload {
  workspace_id: string;
  notes: any[];
  proposals: any[];
  archives: any[];
}

export interface SyncPullResponse {
  timestamp: number;
  notes: any[];
  proposals: any[];
  archives: any[];
}

export interface SyncTransport {
  push(payload: SyncPushPayload): Promise<boolean>;
  pull(workspaceId: string, since: number): Promise<SyncPullResponse | null>;
}

export const SYNC_SERVER_URL = import.meta.env.DEV
  ? "http://localhost:8787"
  : import.meta.env.VITE_SYNC_SERVER_URL;

export class D1HttpTransport implements SyncTransport {
  constructor(private baseUrl: string = SYNC_SERVER_URL) {}

  private getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem("workspace_session_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async push(payload: SyncPushPayload): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/api/sync/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async pull(workspaceId: string, since: number): Promise<SyncPullResponse | null> {
    const res = await fetch(
      `${this.baseUrl}/api/sync/pull?workspace_id=${encodeURIComponent(workspaceId)}&since=${since}`,
      {
        method: "GET",
        headers: {
          ...this.getAuthHeader(),
        },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as SyncPullResponse;
  }
}

// Default transport instance
export const defaultTransport = new D1HttpTransport();