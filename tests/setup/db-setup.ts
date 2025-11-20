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
  await cleanupDb(getPrisma());
});

afterAll(async () => {
  await getPrisma().$disconnect();
  prisma = null;
  await fsExtra.remove(databasePath);
});
