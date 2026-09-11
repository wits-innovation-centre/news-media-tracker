// src/lib/invite/fn.ts

import { SYNC_SERVER_URL } from "../sync/transport";

export type InviteType = "SESSION" | "SHARE";
export type WorkspaceRole = "OWNER" | "EDITOR" | "VIEWER";

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 */
export function generateOTP(length = 6): string {
  const digits = "0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => digits[byte % digits.length]).join("");
}

export interface CreateInviteParams {
  workspaceId: string;
  otp?: string;
  inviteType?: InviteType;
  role?: WorkspaceRole;
  expiresInHours?: number;
  apiBaseUrl?: string;
}

export interface CreateInviteResponse {
  inviteId: string;
  rawToken: string;
  otp?: string;
}

export interface RedeemInviteParams {
  inviteId: string;
  rawToken: string;
  otp: string;
  deviceId?: string;
  apiBaseUrl?: string;
}

export interface RedeemInviteResponse {
  sessionToken: string;
  workspaceId: string;
}

export interface HydrateAndRedeemParams {
  pendingInvite: { inviteId: string; rawToken: string };
  otp: string;
  currentUserId: string;
  workspaces: Array<{ id: string; name: string }>;
  createWorkspace: (name: string, description?: string) => Promise<{ id: string }>;
  loadSchemaGroups: (workspaceId: string) => Promise<any[]>;
  saveSchemaWorkspace: (groups: any[], workspaceId: string) => Promise<void>;
  loadSpecificationRegistry: (workspaceId: string) => Promise<any[]>;
  saveSpecificationRegistry: (registry: any[], workspaceId: string) => Promise<void>;
  loadSpecifications: (workspaceId: string) => Promise<any>;
  saveSpecificationsStore: (specs: any, workspaceId: string) => Promise<void>;
  loadCapturedDocuments: (workspaceId: string) => Promise<any[]>;
  saveCapturedNote: (...args: any[]) => Promise<any>;
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
 * Creates a new workspace invite link/token via the Worker API with OTP verification.
 */
export async function createWorkspaceInvite({
  workspaceId,
  otp = generateOTP(6),
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
      otp,
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

  const data = (await response.json()) as CreateInviteResponse;
  return { ...data, otp };
}

/**
 * Redeems an invite OTP, writes the membership record, and saves the session JWT locally.
 */
export async function redeemWorkspaceInvite({
  inviteId,
  rawToken,
  otp,
  deviceId = getOrCreateDeviceId(),
  apiBaseUrl = SYNC_SERVER_URL,
}: RedeemInviteParams): Promise<RedeemInviteResponse> {
  const response = await fetch(`${apiBaseUrl}/api/invites/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inviteId,
      rawToken,
      otp,
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
 * Redeems an invite OTP and hydrates/clones the shared workspace locally.
 */
export async function redeemAndHydrateInviteWorkspace({
  pendingInvite,
  otp,
  currentUserId,
  workspaces,
  createWorkspace,
  loadSchemaGroups,
  saveSchemaWorkspace,
  loadSpecificationRegistry,
  saveSpecificationRegistry,
  loadSpecifications,
  saveSpecificationsStore,
  loadCapturedDocuments,
  saveCapturedNote,
}: HydrateAndRedeemParams): Promise<string> {
  // 1. Redeem invite and retrieve host workspace ID
  const result = await redeemWorkspaceInvite({
    inviteId: pendingInvite.inviteId,
    rawToken: pendingInvite.rawToken,
    otp,
  });

  // 2. Determine host workspace name from workspace list or fallback
  const hostWorkspace = workspaces.find((w) => w.id === result?.workspaceId);
  const hostName = hostWorkspace?.name || "Shared Workspace";
  const timestamp = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const uniqueName = `${hostName} (Joined ${timestamp})`;

  // 3. Create a new isolated local workspace clone
  const newWorkspace = await createWorkspace(
    uniqueName,
    `Cloned from shared workspace "${hostName}".`
  );

  // 4. Hydrate schemas, specifications, and documents into the newly created clone
  if (result?.workspaceId) {
    const hostGroups = await loadSchemaGroups(result.workspaceId);
    if (hostGroups.length > 0) {
      await saveSchemaWorkspace(hostGroups, newWorkspace.id);
    }

    const hostRegistry = await loadSpecificationRegistry(result.workspaceId);
    if (hostRegistry.length > 0) {
      await saveSpecificationRegistry(hostRegistry, newWorkspace.id);
    }

    const hostSpecs = await loadSpecifications(result.workspaceId);
    if (Object.keys(hostSpecs).length > 0) {
      await saveSpecificationsStore(hostSpecs, newWorkspace.id);
    }

    const hostDocs = await loadCapturedDocuments(result.workspaceId);
    for (const doc of hostDocs) {
      await saveCapturedNote(
        doc.id,
        doc.schema_id,
        doc.title,
        doc.frontmatter,
        doc.body,
        currentUserId,
        doc.parent_id,
        newWorkspace.id
      );
    }
  }

  // 5. Activate the newly cloned workspace
  localStorage.setItem("active_workspace_id", newWorkspace.id);
  return newWorkspace.id;
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
    const setupOtp = generateOTP(6);

    // 1. Create a SESSION invite with OWNER role
    const invite = await createWorkspaceInvite({
      workspaceId,
      otp: setupOtp,
      inviteType: "SESSION",
      role: "OWNER",
      expiresInHours: 1,
    });

    // 2. Redeem immediately for this device to write member record to D1 and issue JWT
    const redeemed = await redeemWorkspaceInvite({
      inviteId: invite.inviteId,
      rawToken: invite.rawToken,
      otp: setupOtp,
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