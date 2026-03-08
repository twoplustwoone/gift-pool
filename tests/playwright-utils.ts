import { test as base } from '@playwright/test';
import { type User as UserModel } from '@prisma/client';
import * as setCookieParser from 'set-cookie-parser';
import { encode } from 'turbo-stream';
import {
  getPasswordHash,
  getSessionExpirationDate,
  sessionKey,
} from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { authSessionStorage } from '#app/utils/session.server.ts';
import { createUser } from './db-utils.ts';

export * from './db-utils.ts';

type GetOrInsertUserOptions = {
  id?: string;
  username?: UserModel['username'];
  password?: string;
  email?: UserModel['email'];
};

type User = {
  id: string;
  email: string;
  username: string;
  name: string | null;
};

async function getOrInsertUser({
  id,
  username,
  password,
  email,
}: GetOrInsertUserOptions = {}): Promise<User> {
  const select = { id: true, email: true, username: true, name: true };
  if (id) {
    return await prisma.user.findUniqueOrThrow({
      select,
      where: { id: id },
    });
  } else {
    const userData = createUser();
    username ??= userData.username;
    password ??= userData.username;
    email ??= userData.email;
    return await prisma.user.create({
      select,
      data: {
        ...userData,
        email,
        username,
        roles: { connect: { name: 'user' } },
        password: { create: { hash: await getPasswordHash(password) } },
      },
    });
  }
}

export const test = base.extend<{
  insertNewUser(options?: GetOrInsertUserOptions): Promise<User>;
  login(options?: GetOrInsertUserOptions): Promise<User>;
}>({
  insertNewUser: async ({}, use) => {
    let userId: string | undefined = undefined;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(async (options) => {
      const user = await getOrInsertUser(options);
      userId = user.id;
      return user;
    });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  },
  login: async ({ page }, use) => {
    let userId: string | undefined = undefined;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(async (options) => {
      const user = await getOrInsertUser(options);
      userId = user.id;
      const session = await prisma.session.create({
        data: {
          expirationDate: getSessionExpirationDate(),
          userId: user.id,
        },
        select: { id: true },
      });

      const authSession = await authSessionStorage.getSession();
      authSession.set(sessionKey, session.id);
      const cookieConfig = setCookieParser.parseString(
        await authSessionStorage.commitSession(authSession),
      );
      const newConfig = {
        ...cookieConfig,
        domain: 'localhost',
        expires: cookieConfig.expires?.getTime(),
        sameSite: cookieConfig.sameSite as 'Strict' | 'Lax' | 'None',
      };
      await page.context().addCookies([newConfig]);
      return user;
    });
    await prisma.user.deleteMany({ where: { id: userId } });
  },
});
export const { expect } = test;

export async function loginWithPassword(
  page: import('@playwright/test').Page,
  {
    username,
    password,
  }: {
    username: string;
    password: string;
  },
) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /username/i }).fill(username);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

/**
 * Encodes a mock action response as turbo-stream for use with v3_singleFetch.
 * Returns { body, contentType } suitable for Playwright's route.fulfill().
 */
export async function singleFetchActionBody(data: unknown): Promise<{
  body: Buffer;
  contentType: string;
}> {
  const stream = encode({ data });
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return {
    body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    contentType: 'text/x-turbo',
  };
}

/**
 * This allows you to wait for something (like an email to be available).
 *
 * It calls the callback every 50ms until it returns a value (and does not throw
 * an error). After the timeout, it will throw the last error that was thrown or
 * throw the error message provided as a fallback
 */
export async function waitFor<ReturnValue>(
  cb: () => ReturnValue | Promise<ReturnValue>,
  {
    errorMessage,
    timeout = 5000,
  }: { errorMessage?: string; timeout?: number } = {},
) {
  const endTime = Date.now() + timeout;
  let lastError: unknown = new Error(errorMessage);
  while (Date.now() < endTime) {
    try {
      const response = await cb();
      if (response) return response;
    } catch (e: unknown) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw lastError;
}
