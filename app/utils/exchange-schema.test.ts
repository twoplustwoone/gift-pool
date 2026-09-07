/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';

describe('ExchangeAssignment schema invariants', () => {
  // Prisma cannot express partial unique indexes and cannot see them for drift
  // detection, so a future migration that rebuilds this table will silently
  // drop them. This test is the only thing that notices.
  it('keeps the live-gifter and live-giftee partial unique indexes', async () => {
    const rows = await prisma.$queryRaw<Array<{ name: string; sql: string }>>`
      SELECT name, sql FROM sqlite_master
      WHERE type = 'index' AND tbl_name = 'ExchangeAssignment' AND sql IS NOT NULL
    `;
    const byName = new Map(
      rows.map((r) => [r.name, r.sql.replace(/\s+/g, ' ')]),
    );
    expect(byName.get('ExchangeAssignment_live_gifter_key')).toContain(
      'UNIQUE INDEX "ExchangeAssignment_live_gifter_key" ON "ExchangeAssignment"("exchangeId", "gifterId") WHERE "supersededAt" IS NULL',
    );
    expect(byName.get('ExchangeAssignment_live_giftee_key')).toContain(
      'UNIQUE INDEX "ExchangeAssignment_live_giftee_key" ON "ExchangeAssignment"("exchangeId", "gifteeId") WHERE "supersededAt" IS NULL',
    );
  });

  it('rejects a second live assignment for the same gifter but allows a superseded one', async () => {
    const insert = (
      id: string,
      gifter: string,
      giftee: string,
      superseded: string,
    ) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO "ExchangeAssignment" ("id","exchangeId","gifterId","gifteeId","createdAt","supersededAt","giftStage")
         VALUES ('${id}','x1','${gifter}','${giftee}', CURRENT_TIMESTAMP, ${superseded}, 'NONE')`,
      );
    // Foreign keys point at rows that do not exist; SQLite only enforces them
    // when PRAGMA foreign_keys is on for the connection, and Prisma's raw
    // connection has it on — so create the parent rows first.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id","email","username","updatedAt") VALUES ('g1','g1@x','g1',CURRENT_TIMESTAMP),('g2','g2@x','g2',CURRENT_TIMESTAMP),('g3','g3@x','g3',CURRENT_TIMESTAMP)`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Exchange" ("id","title","eventDate","organizerId","updatedAt") VALUES ('x1','t',CURRENT_TIMESTAMP,'g1',CURRENT_TIMESTAMP)`,
    );
    await insert('a1', 'g1', 'g2', 'NULL');
    await expect(insert('a2', 'g1', 'g3', 'NULL')).rejects.toThrow();
    await expect(insert('a3', 'g3', 'g2', 'NULL')).rejects.toThrow();
    await expect(
      insert('a4', 'g1', 'g3', 'CURRENT_TIMESTAMP'),
    ).resolves.toBeDefined();
  });
});
