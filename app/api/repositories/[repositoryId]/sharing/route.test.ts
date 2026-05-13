import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('next/server', () => {
  const NextResponse = {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  };
  return { NextResponse };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'invite-1'),
}));

import {
  GET,
  PATCH,
  POST,
  PUT,
} from './route';
import { repositoryStateStore } from './state';

const buildRequest = (url: string, method: string, body?: unknown): Request =>
  ({
    url,
    method,
    json: async () => body,
  }) as unknown as Request;

const jsonBody = async (response: {
  _body?: unknown;
  json?: () => Promise<unknown>;
}) => {
  if (typeof response.json === 'function') {
    return response.json();
  }
  return response._body;
};

describe('repository sharing and permissions API', () => {
  beforeEach(() => {
    repositoryStateStore.clear();
    jest.clearAllMocks();
  });

  it('creates an invite when actor has share permission', async () => {
    const response = await POST(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'POST', {
        actorUserId: 'owner-1',
        inviteeUserId: 'user-2',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    expect(response.status).toBe(201);
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: true,
      data: {
        id: 'invite-1',
        inviteeUserId: 'user-2',
        invitedByUserId: 'owner-1',
        status: 'pending',
      },
    });
  });

  it('blocks invite creation when actor lacks share permission', async () => {
    await POST(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'POST', {
        actorUserId: 'owner-1',
        inviteeUserId: 'user-2',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    await PUT(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'PUT', {
        actorUserId: 'user-2',
        inviteId: 'invite-1',
        action: 'accept',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    const response = await POST(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'POST', {
        actorUserId: 'user-2',
        inviteeUserId: 'user-3',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    expect(response.status).toBe(403);
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions for invite/share',
    });
  });

  it('blocks grant updates when actor lacks manage_members permission', async () => {
    await POST(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'POST', {
        actorUserId: 'owner-1',
        inviteeUserId: 'user-2',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    await PUT(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'PUT', {
        actorUserId: 'user-2',
        inviteId: 'invite-1',
        action: 'accept',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    const response = await PATCH(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'PATCH', {
        actorUserId: 'user-2',
        targetUserId: 'owner-1',
        permissions: ['manage_members'],
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    expect(response.status).toBe(403);
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions for grant management',
    });
  });

  it('returns validation errors for invalid grant permission values', async () => {
    const response = await PATCH(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'PATCH', {
        actorUserId: 'owner-1',
        targetUserId: 'user-2',
        permissions: ['invalid_permission'],
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: false,
      error: 'Validation failed',
    });
  });

  it('updates explicit member grants for authorized actors', async () => {
    await POST(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'POST', {
        actorUserId: 'owner-1',
        inviteeUserId: 'user-2',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    await PUT(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'PUT', {
        actorUserId: 'user-2',
        inviteId: 'invite-1',
        action: 'accept',
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    const response = await PATCH(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'PATCH', {
        actorUserId: 'owner-1',
        targetUserId: 'user-2',
        permissions: ['share', 'manage_members', 'resolve_conflicts'],
      }),
      { params: { repositoryId: 'repo-1' } },
    );

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: true,
      data: {
        userId: 'user-2',
        role: 'standard',
        permissions: expect.arrayContaining([
          'read',
          'write',
          'share',
          'manage_members',
          'resolve_conflicts',
        ]),
      },
    });
  });

  it('returns 400 when actorUserId query parameter is missing', async () => {
    const response = await GET(
      buildRequest('http://localhost:3000/api/repositories/repo-1/sharing', 'GET'),
      { params: { repositoryId: 'repo-1' } },
    );

    expect(response.status).toBe(400);
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: false,
      error: 'actorUserId query parameter is required',
    });
  });
});
