import { z } from 'zod';

export const REPOSITORY_PERMISSION_KEYS = [
  'read',
  'write',
  'share',
  'resolve_conflicts',
  'manage_members',
] as const;

export const REPOSITORY_MEMBER_ROLES = ['owner', 'admin', 'standard'] as const;
export const REPOSITORY_GRANTABLE_ROLES = ['admin', 'standard'] as const;

export type RepositoryPermission = (typeof REPOSITORY_PERMISSION_KEYS)[number];
export type RepositoryMemberRole = (typeof REPOSITORY_MEMBER_ROLES)[number];
export type RepositoryGrantableRole = (typeof REPOSITORY_GRANTABLE_ROLES)[number];

const nonEmptyString = z
  .string({ required_error: 'value is required' })
  .trim()
  .min(1, 'value is required');

const permissionSchema = z.enum(REPOSITORY_PERMISSION_KEYS);
const grantableRoleSchema = z.enum(REPOSITORY_GRANTABLE_ROLES);

const inviteCreateSchema = z.object({
  actorUserId: nonEmptyString,
  inviteeUserId: nonEmptyString,
  role: grantableRoleSchema.optional(),
  permissions: z.array(permissionSchema).optional(),
});

const inviteResponseSchema = z.object({
  actorUserId: nonEmptyString,
  inviteId: nonEmptyString,
  action: z.enum(['accept', 'decline']),
});

const grantUpdateSchema = z.object({
  actorUserId: nonEmptyString,
  targetUserId: nonEmptyString,
  role: grantableRoleSchema.optional(),
  permissions: z.array(permissionSchema).optional(),
});

const getErrorMessages = (error: z.ZodError): string[] =>
  error.issues.map((issue) => issue.message);

const parse = <T>(schema: z.ZodSchema<T>, payload: unknown) => {
  const parsed = schema.safeParse(payload ?? {});
  if (!parsed.success) {
    return { success: false as const, errors: getErrorMessages(parsed.error) };
  }
  return { success: true as const, data: parsed.data };
};

export const parseRepositoryInviteCreateDto = (payload: unknown) =>
  parse(inviteCreateSchema, payload);

export const parseRepositoryInviteResponseDto = (payload: unknown) =>
  parse(inviteResponseSchema, payload);

export const parseRepositoryGrantUpdateDto = (payload: unknown) =>
  parse(grantUpdateSchema, payload);

export const REPOSITORY_SHARING_PERMISSION_CONTRACT_VERSION = '2026-05-11';

export const REPOSITORY_SHARING_PERMISSION_ENDPOINTS = {
  sharing: '/api/repositories/:repositoryId/sharing',
} as const;

export const REPOSITORY_SHARING_PERMISSION_CONTRACT = {
  version: REPOSITORY_SHARING_PERMISSION_CONTRACT_VERSION,
  permissions: REPOSITORY_PERMISSION_KEYS,
  roles: {
    all: REPOSITORY_MEMBER_ROLES,
    grantable: REPOSITORY_GRANTABLE_ROLES,
  },
  endpoints: REPOSITORY_SHARING_PERMISSION_ENDPOINTS,
} as const;
