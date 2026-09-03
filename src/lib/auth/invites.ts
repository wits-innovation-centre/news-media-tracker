// src/lib/auth/invites.ts

import { SYNC_SERVER_URL } from "../sync/transport";

export type InviteType = "SESSION" | "SHARE";
export type WorkspaceRole = "OWNER" | "EDITOR" | "VIEWER";

export interface CreateInviteParams {
  workspaceId: string;
  password: string;
  inviteType?: InviteType;
  role?: WorkspaceRole;
  expiresInHours?: number;
  apiBaseUrl?: string;
}

export interface CreateInviteResponse {
  inviteId: string;
  rawToken: string;
}

export interface RedeemInviteParams {
  inviteId: string;
  rawToken: string;
  password: string;
  deviceId?: string;
  apiBaseUrl?: string;
}

export interface RedeemInviteResponse {
  sessionToken: string;
  workspaceId: string;
}

/**
 * Retrieves a persistent client device identifier or generates a new one.
 */
export function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("device_id", deviceId);
  }
  return deviceId;
}

/**
 * Creates a new workspace invite link/token via the Worker API.
 */
export async function createWorkspaceInvite({
  workspaceId,
  password,
  inviteType = "SHARE",
  role = "EDITOR",
  expiresInHours = 24,
  apiBaseUrl = SYNC_SERVER_URL,
}: CreateInviteParams): Promise<CreateInviteResponse> {
  const response = await fetch(`${apiBaseUrl}/api/invites/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspace_id: workspaceId,
      password,
      invite_type: inviteType,
      role,
      expires_in_hours: expiresInHours,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      errorData.error || `Failed to create invite (${response.status})`
    );
  }

  return (await response.json()) as CreateInviteResponse;
}

/**
 * Redeems an invite token, writes the membership record to D1, and saves the session JWT locally.
 */
export async function redeemWorkspaceInvite({
  inviteId,
  rawToken,
  password,
  deviceId = getOrCreateDeviceId(),
  apiBaseUrl = SYNC_SERVER_URL,
}: RedeemInviteParams): Promise<RedeemInviteResponse> {
  const response = await fetch(`${apiBaseUrl}/api/invites/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inviteId,
      rawToken,
      password,
      deviceId,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      errorData.error || `Failed to redeem invite (${response.status})`
    );
  }

  const data = (await response.json()) as RedeemInviteResponse;

  // Store credentials locally for sync transport authorization
  localStorage.setItem("workspace_session_token", data.sessionToken);
  localStorage.setItem(`workspace_session_token_${data.workspaceId}`, data.sessionToken);
  localStorage.setItem("active_workspace_id", data.workspaceId);

  return data;
}

/**
 * Ensures the workspace has an active owner session token on the current device.
 * Generates and redeems an initial SESSION invite if no token exists locally.
 */
export async function ensureWorkspaceOwnerSession(workspaceId: string): Promise<string | null> {
  let token = localStorage.getItem(`workspace_session_token_${workspaceId}`);
  if (token) {
    localStorage.setItem("workspace_session_token", token);
    return token;
  }

  try {
    const setupPassword = crypto.randomUUID();

    // 1. Create a SESSION invite with OWNER role
    const invite = await createWorkspaceInvite({
      workspaceId,
      password: setupPassword,
      inviteType: "SESSION",
      role: "OWNER",
      expiresInHours: 1,
    });

    // 2. Redeem immediately for this device to write member record to D1 and issue JWT
    const redeemed = await redeemWorkspaceInvite({
      inviteId: invite.inviteId,
      rawToken: invite.rawToken,
      password: setupPassword,
      deviceId: getOrCreateDeviceId(),
    });

    return redeemed.sessionToken;
  } catch (error) {
    console.error(`Failed to register workspace owner session for ${workspaceId}:`, error);
    return null;
  }
}

/**
 * Removes active workspace session tokens from local storage.
 */
export function clearWorkspaceSession(): void {
  localStorage.removeItem("workspace_session_token");
  localStorage.removeItem("active_workspace_id");
}