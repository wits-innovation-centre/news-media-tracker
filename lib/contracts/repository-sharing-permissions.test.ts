import {
  parseRepositoryGrantUpdateDto,
  parseRepositoryInviteCreateDto,
  parseRepositoryInviteResponseDto,
  REPOSITORY_SHARING_PERMISSION_CONTRACT,
  REPOSITORY_SHARING_PERMISSION_CONTRACT_VERSION,
} from './repository-sharing-permissions';

describe('repository sharing permissions contract', () => {
  it('publishes a pinned contract version', () => {
    expect(REPOSITORY_SHARING_PERMISSION_CONTRACT.version).toBe(
      REPOSITORY_SHARING_PERMISSION_CONTRACT_VERSION,
    );
  });

  it('accepts valid invite payloads', () => {
    expect(
      parseRepositoryInviteCreateDto({
        actorUserId: 'owner-1',
        inviteeUserId: 'user-2',
        role: 'standard',
        permissions: ['read', 'write'],
      }),
    ).toEqual({
      success: true,
      data: {
        actorUserId: 'owner-1',
        inviteeUserId: 'user-2',
        role: 'standard',
        permissions: ['read', 'write'],
      },
    });
  });

  it('rejects invalid permissions in invite payloads', () => {
    const parsed = parseRepositoryInviteCreateDto({
      actorUserId: 'owner-1',
      inviteeUserId: 'user-2',
      permissions: ['admin'],
    });

    expect(parsed.success).toBe(false);
  });

  it('validates invite response actions', () => {
    expect(
      parseRepositoryInviteResponseDto({
        actorUserId: 'user-2',
        inviteId: 'invite-1',
        action: 'accept',
      }),
    ).toEqual({
      success: true,
      data: {
        actorUserId: 'user-2',
        inviteId: 'invite-1',
        action: 'accept',
      },
    });

    expect(
      parseRepositoryInviteResponseDto({
        actorUserId: 'user-2',
        inviteId: 'invite-1',
        action: 'approve',
      }).success,
    ).toBe(false);
  });

  it('accepts grant updates and rejects empty actor ids', () => {
    expect(
      parseRepositoryGrantUpdateDto({
        actorUserId: 'owner-1',
        targetUserId: 'user-2',
        permissions: ['manage_members'],
      }),
    ).toEqual({
      success: true,
      data: {
        actorUserId: 'owner-1',
        targetUserId: 'user-2',
        permissions: ['manage_members'],
      },
    });

    expect(
      parseRepositoryGrantUpdateDto({
        actorUserId: ' ',
        targetUserId: 'user-2',
      }).success,
    ).toBe(false);
  });
});
