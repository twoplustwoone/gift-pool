/**
 * @vitest-environment node
 *
 * Architectural guard for the invariant `wishlist-claims.server.ts` declares
 * in its own docstring: it is "the only code in the app permitted to write
 * WishlistClaim." That invariant has been violated three times so far, each
 * discovered one at a time as a real bug — `cancelPool` losing a cancelled
 * pool's claim on a failed sync, `cleanupWishlistClaimsForOwner` bare-deleting
 * a solo claim without settling it to a waiting pool, and
 * `recordWishlistClaimOutcome` writing `outcomeFeedback` directly. Every
 * write outside the module skips `settleItem`, so a claim can vanish (or be
 * created) without the longest-waiting pool ever inheriting the item — the
 * exact bug this feature exists to prevent.
 *
 * This test reads every non-test source file under app/ from disk and fails
 * if any file other than wishlist-claims.server.ts itself calls a write
 * method on `.wishlistClaim` (create/createMany/update/updateMany/upsert/
 * delete/deleteMany), on either a `prisma` or an in-transaction `tx` client.
 * Reads (findUnique, findMany, findFirst, findUniqueOrThrow, count) are not
 * flagged and never need to be.
 *
 * LIMITATION — this guard is a source-text grep. It cannot see, and does not
 * catch, rows removed by a database-level `onDelete: Cascade` (e.g.
 * `WishlistClaim.claimedByUserId` cascading when its `User` is deleted). No
 * `.wishlistClaim` call appears in that code path, so the claim vanishes
 * without ever running `settleItem`, and this test stays green while the
 * settlement invariant is silently violated (see the account-deletion P1
 * fix in profile.index.tsx, which routes the cascade-adjacent delete through
 * `releaseSoloClaimsMatching` first for exactly this reason). Any new
 * cascade path that can remove a `WishlistClaim` row — a new `onDelete:
 * Cascade` relation reaching `User`, `WishlistItem`, or `Pool` — needs its
 * own explicit settlement call before the cascading delete runs; this test
 * will not tell you it's missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = path.resolve(__dirname, '..');
const MODULE_FILE = path.join(__dirname, 'wishlist-claims.server.ts');

const WRITE_METHODS = ['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];
// Matches `<anything>.wishlistClaim.<writeMethod>` regardless of what the
// Prisma client variable is called (`prisma`, `tx`, ...) — the invariant is
// about the table, not the variable name.
const WRITE_CALL_PATTERN = new RegExp(`\\.wishlistClaim\\.(${WRITE_METHODS.join('|')})\\b`);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const TEST_FILE_PATTERN = /\.test\.(ts|tsx)$/;

function collectSourceFiles(dir: string): Array<string> {
  const files: Array<string> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip vendored/build output if it ever shows up under app/.
      if (entry.name === 'node_modules' || entry.name === '.cache') continue;
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }
  return files;
}

describe('WishlistClaim write invariant', () => {
  it('is never written outside wishlist-claims.server.ts', () => {
    const offenders: Array<{ file: string; line: number; snippet: string }> = [];

    for (const file of collectSourceFiles(APP_DIR)) {
      if (file === MODULE_FILE) continue;
      // Test files legitimately set up WishlistClaim fixtures directly.
      if (TEST_FILE_PATTERN.test(file)) continue;

      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((lineText, index) => {
        if (WRITE_CALL_PATTERN.test(lineText)) {
          offenders.push({
            file: path.relative(APP_DIR, file),
            line: index + 1,
            snippet: lineText.trim(),
          });
        }
      });
    }

    if (offenders.length > 0) {
      const report = offenders
        .map((o) => `  app/${o.file}:${o.line}  ${o.snippet}`)
        .join('\n');
      throw new Error(
        `Found ${offenders.length} write(s) to WishlistClaim outside wishlist-claims.server.ts:\n${report}\n\n` +
          'wishlist-claims.server.ts documents itself as "the only code in the app ' +
          'permitted to write WishlistClaim." That single-writer rule exists because ' +
          'every release/creation must run through settleItem() in the same transaction ' +
          '— a claim that disappears (or appears) any other way skips settlement, so the ' +
          'longest-waiting pool never inherits an item it has already decided on. This has ' +
          'been a real, shipped bug three separate times. Route this write through an ' +
          'existing or new export of wishlist-claims.server.ts instead of writing ' +
          '`.wishlistClaim` directly.\n\n' +
          'NOTE: this test greps source text, so it cannot see a WishlistClaim row removed ' +
          'by a database-level onDelete: Cascade (e.g. via User deletion) — that path has no ' +
          '`.wishlistClaim` call to flag and stays green even though settlement never runs. ' +
          'If you are adding a new cascade that can reach WishlistClaim, settle it explicitly ' +
          'before the cascading delete; this test will not catch a missing one.',
      );
    }

    expect(offenders).toEqual([]);
  });
});
