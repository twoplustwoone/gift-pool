/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { prisma } from '#app/utils/db.server.ts';

describe('WishlistClaim schema invariants', () => {
  // Prisma cannot express CHECK constraints and cannot see them for drift
  // detection, so any future migration that rebuilds this table will silently
  // drop this one. This test is the only thing that notices.
  it('keeps the exactly-one-claimant CHECK constraint in the table definition', async () => {
    const rows = await prisma.$queryRaw<Array<{ sql: string }>>`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'WishlistClaim'
    `;
    expect(rows).toHaveLength(1);
    const [row] = rows;
    const sql = (row?.sql ?? '').replace(/\s+/g, ' ');
    expect(sql).toContain('CHECK');
    expect(sql).toContain('claimedByUserId" IS NOT NULL) + ("poolId" IS NOT NULL) = 1');
  });

  it('rejects a claim with two claimants', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "WishlistClaim" ("id","wishlistItemId","claimedByUserId","poolId","createdAt")
         VALUES ('c1','i1','u1','p1', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow();
  });

  it('rejects a claim with no claimant', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "WishlistClaim" ("id","wishlistItemId","claimedByUserId","poolId","createdAt")
         VALUES ('c2','i2',NULL,NULL, CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toThrow();
  });
});
