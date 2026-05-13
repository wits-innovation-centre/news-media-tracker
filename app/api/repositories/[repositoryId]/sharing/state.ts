import type {
  RepositoryGrantableRole,
  RepositoryMemberRole,
  RepositoryPermission,
} from '../../../../../lib/contracts/repository-sharing-permissions';

export type RepositoryMembership = {
  userId: string;
  role: RepositoryMemberRole;
  permissions: RepositoryPermission[];
  explicitPermissions: RepositoryPermission[];
  createdAt: string;
  updatedAt: string;
};

export type RepositoryInvite = {
  id: string;
  inviteeUserId: string;
  invitedByUserId: string;
  role: RepositoryGrantableRole;
  permissions: RepositoryPermission[];
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  respondedAt: string | null;
};

export type RepositorySharingState = {
  memberships: RepositoryMembership[];
  invites: RepositoryInvite[];
};

/** In-memory state store. Replace with persistent storage for production. */
export const repositoryStateStore = new Map<string, RepositorySharingState>();
