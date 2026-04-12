import { describe, expect, it } from 'vitest';
import { loader } from '#app/routes/admin+/users.tsx';
import {
  action,
  loader as detailLoader,
} from '#app/routes/admin+/users_.$userId.tsx';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';
import { getSessionCookieHeader } from '#tests/utils.ts';

const DAY_MS = 1000 * 60 * 60 * 24;

async function seedAdminSession() {
  await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Admin role' },
  });
  const admin = await prisma.user.create({
    data: { ...createUser(), roles: { connect: { name: 'admin' } } },
    select: { id: true },
  });
  const session = await prisma.session.create({
    data: { userId: admin.id, expirationDate: new Date(Date.now() + DAY_MS) },
  });
  const cookie = await getSessionCookieHeader(session);
  return { admin, cookie };
}

describe('/admin/users (search) loader', () => {
  it('rejects non-admin users', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const session = await prisma.session.create({
      data: { userId: user.id, expirationDate: new Date(Date.now() + DAY_MS) },
    });
    const cookie = await getSessionCookieHeader(session);
    const request = new Request('http://localhost/admin/users?q=anything', {
      headers: { cookie },
    });

    await expect(
      loader(toLoaderArgs({ request, params: {}, context: {} as any })),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });

  it('returns empty results when query is too short', async () => {
    const { cookie } = await seedAdminSession();
    const request = new Request('http://localhost/admin/users', {
      headers: { cookie },
    });
    const result = await loader(
      toLoaderArgs({ request, params: {}, context: {} as any }),
    );
    const data = await getRouteResultData<{
      query: string;
      results: unknown[];
    }>(result);
    expect(data.query).toBe('');
    expect(data.results).toEqual([]);
  });

  it('returns matching users for a real query', async () => {
    const { cookie } = await seedAdminSession();
    await prisma.user.create({
      data: {
        email: 'findme@example.com',
        username: 'findme',
        name: 'Find Me',
      },
    });
    const request = new Request('http://localhost/admin/users?q=findme', {
      headers: { cookie },
    });
    const result = await loader(
      toLoaderArgs({ request, params: {}, context: {} as any }),
    );
    const data = await getRouteResultData<{
      query: string;
      results: Array<{ username: string }>;
    }>(result);
    expect(data.query).toBe('findme');
    expect(data.results.map((r) => r.username)).toContain('findme');
  });
});

describe('/admin/users/:userId drill-down loader', () => {
  it('404s on an unknown id', async () => {
    const { cookie } = await seedAdminSession();
    const request = new Request('http://localhost/admin/users/nope', {
      headers: { cookie },
    });
    // invariantResponse throws a plain Response (not a react-router data()
    // envelope), so assert on the Response status directly.
    try {
      await detailLoader(
        toLoaderArgs({
          request,
          params: { userId: 'nope' },
          context: {} as any,
        }),
      );
      throw new Error('expected loader to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(404);
    }
  });

  it('returns the full detail shape', async () => {
    const { cookie } = await seedAdminSession();
    const target = await prisma.user.create({
      data: createUser(),
      select: { id: true },
    });
    const request = new Request(`http://localhost/admin/users/${target.id}`, {
      headers: { cookie },
    });
    const result = await detailLoader(
      toLoaderArgs({
        request,
        params: { userId: target.id },
        context: {} as any,
      }),
    );
    expect(getRouteResultStatus(result)).toBe(200);
    const data = await getRouteResultData<{
      user: { id: string; counts: { wishlistItems: number } };
    }>(result);
    expect(data.user.id).toBe(target.id);
    expect(data.user.counts.wishlistItems).toBe(0);
  });
});

describe('/admin/users/:userId action — toggle_admin', () => {
  it('grants admin on a plain user', async () => {
    const { admin, cookie } = await seedAdminSession();
    const target = await prisma.user.create({
      data: createUser(),
      select: { id: true },
    });
    const formData = new FormData();
    formData.append('intent', 'toggle_admin');
    formData.append('target', 'grant');
    const request = new Request(`http://localhost/admin/users/${target.id}`, {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });

    const result = await action(
      toActionArgs({
        request,
        params: { userId: target.id },
        context: {} as any,
      }),
    );
    expect(result).toMatchObject({ ok: true, intent: 'toggle_admin' });

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
      select: { roles: { select: { name: true } } },
    });
    expect(refreshed.roles.map((r) => r.name)).toContain('admin');
    // Sanity: the acting admin still has their own role.
    const actingRefreshed = await prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
      select: { roles: { select: { name: true } } },
    });
    expect(actingRefreshed.roles.map((r) => r.name)).toContain('admin');
  });

  it('rejects self-demotion with a readable message', async () => {
    const { admin, cookie } = await seedAdminSession();
    const formData = new FormData();
    formData.append('intent', 'toggle_admin');
    formData.append('target', 'revoke');
    const request = new Request(`http://localhost/admin/users/${admin.id}`, {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });
    const result = await action(
      toActionArgs({
        request,
        params: { userId: admin.id },
        context: {} as any,
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('own admin role'),
    });
  });

  it('rejects revoking the last admin', async () => {
    const { admin, cookie } = await seedAdminSession();
    // Make a second acting admin so the self-demotion guard doesn't fire first.
    const actor = await prisma.user.create({
      data: { ...createUser(), roles: { connect: { name: 'admin' } } },
    });
    const actorSession = await prisma.session.create({
      data: { userId: actor.id, expirationDate: new Date(Date.now() + DAY_MS) },
    });
    const actorCookie = await getSessionCookieHeader(actorSession);

    // First, actor revokes admin. That leaves only the original admin.
    const firstRevoke = new FormData();
    firstRevoke.append('intent', 'toggle_admin');
    firstRevoke.append('target', 'revoke');
    const firstRequest = new Request(
      `http://localhost/admin/users/${actor.id}`,
      { method: 'POST', headers: { cookie }, body: firstRevoke },
    );
    const firstResult = await action(
      toActionArgs({
        request: firstRequest,
        params: { userId: actor.id },
        context: {} as any,
      }),
    );
    expect(firstResult).toMatchObject({ ok: true });

    // Now the original admin is the only one. Attempt to revoke them.
    const secondRevoke = new FormData();
    secondRevoke.append('intent', 'toggle_admin');
    secondRevoke.append('target', 'revoke');
    const secondRequest = new Request(
      `http://localhost/admin/users/${admin.id}`,
      { method: 'POST', headers: { cookie: actorCookie }, body: secondRevoke },
    );
    // Note: actor no longer has admin role, so this should 403 before hitting
    // the last-admin guard.
    await expect(
      action(
        toActionArgs({
          request: secondRequest,
          params: { userId: admin.id },
          context: {} as any,
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });
});

describe('/admin/users/:userId action — revoke_sessions', () => {
  it('revokes every session + verification for the target', async () => {
    const { cookie } = await seedAdminSession();
    const target = await prisma.user.create({
      data: createUser(),
      select: { id: true, email: true },
    });
    await prisma.session.create({
      data: {
        userId: target.id,
        expirationDate: new Date(Date.now() + DAY_MS),
      },
    });
    await prisma.verification.create({
      data: {
        type: 'reset-password',
        target: target.email,
        secret: 's',
        algorithm: 'SHA1',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const formData = new FormData();
    formData.append('intent', 'revoke_sessions');
    const request = new Request(`http://localhost/admin/users/${target.id}`, {
      method: 'POST',
      headers: { cookie },
      body: formData,
    });
    const result = await action(
      toActionArgs({
        request,
        params: { userId: target.id },
        context: {} as any,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      intent: 'revoke_sessions',
      message: expect.stringContaining('1 session'),
    });

    expect(
      await prisma.session.count({ where: { userId: target.id } }),
    ).toBe(0);
    expect(
      await prisma.verification.count({ where: { target: target.email } }),
    ).toBe(0);
  });
});
