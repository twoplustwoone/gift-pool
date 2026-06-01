import { describe, expect, it } from 'vitest';
import { action, loader } from '#app/routes/admin+/feedback.tsx';
import { prisma } from '#app/utils/db.server.ts';
import { createUser } from '#tests/db-utils.ts';
import {
  getRouteResultData,
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
  return { admin, cookie: await getSessionCookieHeader(session) };
}

describe('/admin/feedback loader', () => {
  it('rejects non-admin users', async () => {
    const user = await prisma.user.create({ data: createUser() });
    const session = await prisma.session.create({
      data: { userId: user.id, expirationDate: new Date(Date.now() + DAY_MS) },
    });
    const cookie = await getSessionCookieHeader(session);
    await expect(
      loader(
        toLoaderArgs({
          request: new Request('http://localhost/admin/feedback', {
            headers: { cookie },
          }),
          params: {},
          context: {} as any,
        }),
      ),
    ).rejects.toMatchObject({ init: { status: 403 } });
  });

  it('defaults to NEW and reports per-status counts', async () => {
    const { cookie } = await seedAdminSession();
    await prisma.feedback.createMany({
      data: [
        { type: 'BUG', message: 'one '.repeat(5), status: 'NEW' },
        { type: 'FEATURE', message: 'two '.repeat(5), status: 'RESOLVED' },
      ],
    });
    const result = await loader(
      toLoaderArgs({
        request: new Request('http://localhost/admin/feedback', {
          headers: { cookie },
        }),
        params: {},
        context: {} as any,
      }),
    );
    const data = await getRouteResultData<{
      items: Array<{ status: string }>;
      counts: { NEW: number; RESOLVED: number; all: number };
      statusParam: string;
    }>(result);
    expect(data.statusParam).toBe('NEW');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.status).toBe('NEW');
    expect(data.counts).toMatchObject({ NEW: 1, RESOLVED: 1, all: 2 });
  });
});

describe('/admin/feedback action', () => {
  it('updates status and admin notes', async () => {
    const { cookie } = await seedAdminSession();
    const feedback = await prisma.feedback.create({
      data: { type: 'BUG', message: 'something is broken here' },
      select: { id: true },
    });
    await action(
      toActionArgs({
        request: new Request('http://localhost/admin/feedback', {
          method: 'POST',
          headers: {
            cookie,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            feedbackId: feedback.id,
            status: 'RESOLVED',
            adminNotes: 'fixed in deploy 42',
          }).toString(),
        }),
        params: {},
        context: {} as any,
      }),
    );
    const updated = await prisma.feedback.findUniqueOrThrow({
      where: { id: feedback.id },
    });
    expect(updated.status).toBe('RESOLVED');
    expect(updated.adminNotes).toBe('fixed in deploy 42');
  });

  it('rejects an invalid status', async () => {
    const { cookie } = await seedAdminSession();
    const feedback = await prisma.feedback.create({
      data: { type: 'BUG', message: 'something is broken here' },
      select: { id: true },
    });
    await expect(
      action(
        toActionArgs({
          request: new Request('http://localhost/admin/feedback', {
            method: 'POST',
            headers: {
              cookie,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              feedbackId: feedback.id,
              status: 'BOGUS',
            }).toString(),
          }),
          params: {},
          context: {} as any,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
