import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import fsExtra from 'fs-extra';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanupDb } from '#tests/db-utils.ts';
import { BASE_DATABASE_PATH } from './global-setup.ts';

const databaseFile = `./tests/prisma/data.${process.env.VITEST_POOL_ID || 0}.db`;
const databasePath = path.join(process.cwd(), databaseFile);
process.env.DATABASE_URL = `file:${databasePath}`;

let prisma: PrismaClient | null = null;
export const getPrisma = () => {
  if (!prisma) {
    prisma = new PrismaClient();
  }

  return prisma;
};

beforeAll(async () => {
  await fsExtra.copyFile(BASE_DATABASE_PATH, databasePath);
});

// we *must* use dynamic imports here so the process.env.DATABASE_URL is set
// before prisma is imported and initialized
afterEach(async () => {
  // Drain fire-and-forget analytics writes BEFORE deleting rows — an
  // in-flight create colliding with the cleanup transaction logs a prisma
  // error mid-flight and the console-error guard then fails whichever test
  // runs next (the CI-only rotating-victim flake).
  // try/catch rather than optional chaining: files that vi.mock the
  // analytics module get a proxy that THROWS on missing-export access — and
  // a mocked module has no real queued writes to drain anyway.
  try {
    const analytics = await import('#app/utils/analytics.server.ts');
    await analytics.drainQueuedAnalytics();
  } catch {
    // Module mocked without the drain hook — nothing real in flight.
  }
  await cleanupDb(getPrisma());
});

afterAll(async () => {
  await getPrisma().$disconnect();
  prisma = null;
  await fsExtra.remove(databasePath);
});
