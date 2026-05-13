import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  parseRepositoryGrantUpdateDto,
  parseRepositoryInviteCreateDto,
  parseRepositoryInviteResponseDto,
  REPOSITORY_PERMISSION_KEYS,
  type RepositoryMemberRole,
  type RepositoryPermission,
} from '../../../../../lib/contracts/repository-sharing-permissions';
import {
  repositoryStateStore,
  type RepositoryMembership,
  type RepositoryInvite,
  type RepositorySharingState,
} from './state';

const ALL_PERMISSIONS = [...REPOSITORY_PERMISSION_KEYS];
const STANDARD_BASE_PERMISSIONS: RepositoryPermission[] = ['read', 'write'];

const uniquePermissions = (
  permissions: readonly RepositoryPermission[] | undefined,
): RepositoryPermission[] => {
  if (!permissions) {
    return [];
  }
  return Array.from(
    new Set(
      permissions.filter((permission) => ALL_PERMISSIONS.includes(permission)),
    ),
  );
};

const buildPermissions = (
  role: RepositoryMemberRole,
  explicitPermissions: readonly RepositoryPermission[] | undefined,
): RepositoryPermission[] => {
  if (role === 'owner' || role === 'admin') {
    return [...ALL_PERMISSIONS];
  }

  const combined = new Set<RepositoryPermission>([
    ...STANDARD_BASE_PERMISSIONS,
    ...uniquePermissions(explicitPermissions),
  ]);
  combined.add('read');
  return Array.from(combined);
};

const hasPermission = (
  membership: RepositoryMembership | undefined,
  permission: RepositoryPermission,
): boolean => {
  if (!membership) {
    return false;
  }
  if (membership.role === 'owner' || membership.role === 'admin') {
    return true;
  }
  return membership.permissions.includes(permission);
};

const normaliseRepositoryId = (repositoryId: string): string =>
  repositoryId.trim().toLowerCase();

const createOwnerMembership = (ownerUserId: string): RepositoryMembership => {
  const now = new Date().toISOString();
  return {
    userId: ownerUserId,
    role: 'owner',
    permissions: [...ALL_PERMISSIONS],
    explicitPermissions: [],
    createdAt: now,
    updatedAt: now,
  };
};

const getOrCreateState = (
  repositoryId: string,
  ownerUserId?: string,
): RepositorySharingState => {
  const normalizedRepositoryId = normaliseRepositoryId(repositoryId);
  const existing = repositoryStateStore.get(normalizedRepositoryId);
  if (existing) {
    return existing;
  }

  const next: RepositorySharingState = {
    memberships:
      typeof ownerUserId === 'string' && ownerUserId.trim().length > 0
        ? [createOwnerMembership(ownerUserId.trim())]
        : [],
    invites: [],
  };
  repositoryStateStore.set(normalizedRepositoryId, next);
  return next;
};

const getState = (repositoryId: string): RepositorySharingState | undefined =>
  repositoryStateStore.get(normaliseRepositoryId(repositoryId));

const getMembershipByUserId = (
  state: RepositorySharingState,
  userId: string,
): RepositoryMembership | undefined =>
  state.memberships.find((membership) => membership.userId === userId);

export async function GET(
  request: Request,
  { params }: { params: { repositoryId: string } },
) {
  try {
    const url = new URL(request.url);
    const actorUserId = url.searchParams.get('actorUserId')?.trim();
    if (!actorUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'actorUserId query parameter is required',
        },
        { status: 400 },
      );
    }

    const state = getState(params.repositoryId);
    if (!state) {
      return NextResponse.json(
        {
          success: false,
          error: 'Repository sharing state not found',
        },
        { status: 404 },
      );
    }
    const actor = getMembershipByUserId(state, actorUserId);

    if (!hasPermission(actor, 'read')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions for repository read access',
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        memberships: state.memberships,
        invites: state.invites,
      },
    });
  } catch (error) {
    console.error('Failed to list repository sharing state:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve repository sharing state',
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { repositoryId: string } },
) {
  try {
    const payload = await request.json();
    const parsed = parseRepositoryInviteCreateDto(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.errors,
        },
        { status: 400 },
      );
    }

    const state = getOrCreateState(params.repositoryId, parsed.data.actorUserId);
    const actor = getMembershipByUserId(state, parsed.data.actorUserId);

    if (!hasPermission(actor, 'share')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions for invite/share',
        },
        { status: 403 },
      );
    }

    if (parsed.data.actorUserId === parsed.data.inviteeUserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Self-invite is not allowed',
        },
        { status: 400 },
      );
    }

    const existingMembership = getMembershipByUserId(state, parsed.data.inviteeUserId);
    if (existingMembership) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invitee is already a repository member',
        },
        { status: 409 },
      );
    }

    const existingInvite = state.invites.find(
      (invite) =>
        invite.inviteeUserId === parsed.data.inviteeUserId && invite.status === 'pending',
    );

    if (existingInvite) {
      return NextResponse.json(
        {
          success: false,
          error: 'Pending invite already exists for this user',
        },
        { status: 409 },
      );
    }

    const invite: RepositoryInvite = {
      id: uuidv4(),
      inviteeUserId: parsed.data.inviteeUserId,
      invitedByUserId: parsed.data.actorUserId,
      role: parsed.data.role ?? 'standard',
      permissions: uniquePermissions(parsed.data.permissions),
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null,
    };

    state.invites.push(invite);

    return NextResponse.json(
      {
        success: true,
        data: invite,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to create repository invite:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create repository invite',
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { repositoryId: string } },
) {
  try {
    const payload = await request.json();
    const parsed = parseRepositoryInviteResponseDto(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.errors,
        },
        { status: 400 },
      );
    }

    const state = getState(params.repositoryId);
    if (!state) {
      return NextResponse.json(
        {
          success: false,
          error: 'Repository sharing state not found',
        },
        { status: 404 },
      );
    }
    const invite = state.invites.find((item) => item.id === parsed.data.inviteId);

    if (!invite) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invite not found',
        },
        { status: 404 },
      );
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invite has already been processed',
        },
        { status: 409 },
      );
    }

    const actor = getMembershipByUserId(state, parsed.data.actorUserId);
    const canProcessInvite =
      parsed.data.actorUserId === invite.inviteeUserId || hasPermission(actor, 'manage_members');
    if (!canProcessInvite) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions to process invite',
        },
        { status: 403 },
      );
    }

    invite.status = parsed.data.action === 'accept' ? 'accepted' : 'declined';
    invite.respondedAt = new Date().toISOString();

    if (parsed.data.action === 'accept') {
      const existingMembership = getMembershipByUserId(state, invite.inviteeUserId);
      if (!existingMembership) {
        state.memberships.push({
          userId: invite.inviteeUserId,
          role: invite.role,
          permissions: buildPermissions(invite.role, invite.permissions),
          explicitPermissions: uniquePermissions(invite.permissions),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: invite,
    });
  } catch (error) {
    console.error('Failed to process repository invite:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process repository invite',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { repositoryId: string } },
) {
  try {
    const payload = await request.json();
    const parsed = parseRepositoryGrantUpdateDto(payload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.errors,
        },
        { status: 400 },
      );
    }

    const state = getState(params.repositoryId);
    if (!state) {
      return NextResponse.json(
        {
          success: false,
          error: 'Repository sharing state not found',
        },
        { status: 404 },
      );
    }
    const actor = getMembershipByUserId(state, parsed.data.actorUserId);

    if (!hasPermission(actor, 'manage_members')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Insufficient permissions for grant management',
        },
        { status: 403 },
      );
    }

    const targetMembership = getMembershipByUserId(state, parsed.data.targetUserId);
    if (!targetMembership) {
      return NextResponse.json(
        {
          success: false,
          error: 'Target member not found',
        },
        { status: 404 },
      );
    }

    if (targetMembership.role === 'owner') {
      return NextResponse.json(
        {
          success: false,
          error: 'Owner grants cannot be modified',
        },
        { status: 403 },
      );
    }

    const nextRole = parsed.data.role ?? targetMembership.role;

    targetMembership.role = nextRole;
    targetMembership.explicitPermissions = uniquePermissions(
      parsed.data.permissions ?? targetMembership.explicitPermissions,
    );
    targetMembership.permissions = buildPermissions(
      targetMembership.role,
      targetMembership.explicitPermissions,
    );
    targetMembership.updatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data: targetMembership,
    });
  } catch (error) {
    console.error('Failed to update repository grants:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update repository grants',
      },
      { status: 500 },
    );
  }
}

