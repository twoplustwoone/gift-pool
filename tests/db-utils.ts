import fs from 'node:fs';
import { faker } from '@faker-js/faker';
import { type PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { UniqueEnforcer } from 'enforce-unique';

const uniqueUsernameEnforcer = new UniqueEnforcer();

export function createUser() {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  const username = uniqueUsernameEnforcer
    .enforce(() => {
      return (
        faker.string.alphanumeric({ length: 2 }) +
        '_' +
        faker.internet.userName({
          firstName: firstName.toLowerCase(),
          lastName: lastName.toLowerCase(),
        })
      );
    })
    .slice(0, 20)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  return {
    username,
    name: `${firstName} ${lastName}`,
    email: `${username}@example.com`,
  };
}

export function createPassword(password: string = faker.internet.password()) {
  return {
    hash: bcrypt.hashSync(password, 10),
  };
}

let userImages: Array<Awaited<ReturnType<typeof img>>> | undefined;
export async function getUserImages() {
  if (userImages) return userImages;

  userImages = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      img({ filepath: `./tests/fixtures/images/user/${index}.jpg` }),
    ),
  );

  return userImages;
}

export async function img({
  altText,
  filepath,
}: {
  altText?: string;
  filepath: string;
}) {
  return {
    altText,
    contentType: filepath.endsWith('.png') ? 'image/png' : 'image/jpeg',
    blob: await fs.promises.readFile(filepath),
  };
}

export async function cleanupDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<
    { name: string }[]
  >`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations';`;

  try {
    // Disable FK constraints to avoid relation conflicts during deletion,
    // and wait out transient SQLITE_BUSY from still-settling background
    // writes instead of failing — a failed cleanup console.errors, which the
    // console-error guard turns into a spurious failure of the NEXT test.
    // queryRaw, not executeRaw: this PRAGMA returns the new value as a row.
    await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 5000`);
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF`);
    await prisma.$transaction([
      // Delete all rows from each table, preserving table structures
      ...tables.map(({ name }) =>
        prisma.$executeRawUnsafe(`DELETE from "${name}"`),
      ),
    ]);
  } catch (error) {
    console.error('Error cleaning up database:', error);
  } finally {
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON`);
  }
}
