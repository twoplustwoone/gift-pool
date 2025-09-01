import { test as base } from '@playwright/test';
import { type User as UserModel } from '@prisma/client';
import { getPasswordHash } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
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
    await use(async (options) => {
      const user = await getOrInsertUser(options);
      userId = user.id;
      return user;
    });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  },
  login: async ({ page }, use) => {
    let userId: string | undefined = undefined;
    await use(async (options) => {
      const user = await getOrInsertUser(options);
      userId = user.id;

      // Prefer logging in through the UI to ensure cookies/sessions match server env
      await page.goto('/login');
      await page
        .getByRole('textbox', { name: /username/i })
        .fill(user.username);
      const passwordToUse = options?.password ?? user.username;
      await page
        .getByRole('textbox', { name: /password/i })
        .fill(passwordToUse);
      await page.getByRole('button', { name: /log in/i }).click();

      // Wait for a meaningful UI signal of login success (avoid networkidle)
      await base
        .expect(page.getByRole('link', { name: user.name ?? user.username }))
        .toBeVisible();

      return user;
    });
    await prisma.user.deleteMany({ where: { id: userId } });
  },
});
export const { expect } = test;

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
