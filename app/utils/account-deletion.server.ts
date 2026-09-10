import { data } from 'react-router';
import { type Prisma } from '@prisma/client';
import { prisma } from '#app/utils/db.server.ts';
import {
  announceExchangeAccountDeletion,
  prepareExchangesForAccountDeletion,
  type ExchangeAccountDeletionSummary,
} from '#app/utils/exchanges.server.ts';
import { POOL_STATUS } from '#app/utils/pool-constants.ts';

type Db = Prisma.TransactionClient | typeof prisma;

// Nine foreign keys to User are ON DELETE RESTRICT, so `prisma.user.delete`
// throws for anyone who has ever joined a group — which is every real user.
// "Delete all my data" was unreachable in practice. This module clears the
// way, following what the product already does when someone leaves by hand:
// `leaveGroup` deletes the membership row and `removeContributor` deletes the
// contribution, so account deletion does the same rather than inventing
// softer semantics for the same act.
//
// Runs inside the caller's transaction, alongside `user.delete` itself: a
// deletion that fails partway must not leave pools handed over and groups
// re-owned with the account still present. Every read goes through `db`.
export type AccountDeletionSummary = {
  poolsHandedOver: string[];
  poolsDeleted: string[];
  groupsHandedOver: string[];
  groupsDeleted: string[];
  exchanges: ExchangeAccountDeletionSummary;
};

// The one case with no safe answer. `Pool.chosenIdeaId` is SET NULL, so
// deleting the idea a pool is still working from would quietly un-decide that
// pool for everyone else. Rather than corrupt it or misattribute the idea to
// someone who didn't have it, refuse and say what to do — the same shape of
// answer `leaveGroup` gives a sole owner.
//
// Only DECIDED counts. A purchased or delivered pool is finished: nobody can
// choose a different idea on it (`chooseIdea` won't touch one, and the UI
// offers no cancellation for a delivered pool), so blocking on those would
// bar the account from ever being deleted with no action that could unblock
// it. Those pools lose the record of which idea won, which is the same kind
// of gap a departed person leaves in a revealed exchange loop.
export async function assertAccountDeletable({
  userId,
  db = prisma,
}: {
  userId: string;
  db?: Db;
}) {
  const chosen = await db.giftIdea.findMany({
    where: {
      proposedById: userId,
      pool: { status: POOL_STATUS.DECIDED, chosenIdeaId: { not: null } },
    },
    select: { id: true, name: true, pool: { select: { chosenIdeaId: true } } },
  });
  const blocking = chosen.filter((i) => i.pool?.chosenIdeaId === i.id);
  if (blocking.length === 0) return;
  throw data(
    {
      error:
        blocking.length === 1
          ? `A group chose your idea "${blocking[0]!.name}" for a gift they're still working on. Ask the pool's organiser to pick a different idea, then delete your account.`
          : `${blocking.length} groups chose your ideas for gifts they're still working on. Ask those pools' organisers to pick different ideas, then delete your account.`,
    },
    { status: 409 },
  );
}

export async function prepareAccountForDeletion({
  userId,
  db,
  now = new Date(),
}: {
  userId: string;
  db: Db;
  now?: Date;
}): Promise<AccountDeletionSummary> {
  await assertAccountDeletable({ userId, db });

  const summary: AccountDeletionSummary = {
    poolsHandedOver: [],
    poolsDeleted: [],
    groupsHandedOver: [],
    groupsDeleted: [],
    exchanges: await prepareExchangesForAccountDeletion({ userId, db, now }),
  };

  // Pools they organise: hand to another contributor, longest-standing first.
  // A pool nobody else contributed to is theirs alone, so it goes with them.
  const organised = await db.pool.findMany({
    where: { organizerId: userId },
    select: { id: true },
  });
  for (const { id } of organised) {
    const heir = await db.poolContributor.findFirst({
      where: { poolId: id, userId: { not: userId } },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    });
    if (heir) {
      await db.pool.update({
        where: { id },
        data: { organizerId: heir.userId },
      });
      summary.poolsHandedOver.push(id);
    } else {
      await db.pool.delete({ where: { id } });
      summary.poolsDeleted.push(id);
    }
  }

  // Groups: `leaveGroup` refuses to let the sole owner walk out, but a deleted
  // account cannot be refused, so the group gets a new owner instead — an
  // admin if there is one, else the longest-standing member. A group with
  // nobody else in it goes with them.
  const memberships = await db.usersInGiftGroups.findMany({
    where: { userId },
    select: { giftGroupId: true, role: true },
  });
  for (const { giftGroupId, role } of memberships) {
    const others = await db.usersInGiftGroups.findMany({
      where: { giftGroupId, userId: { not: userId } },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true, role: true },
    });
    if (others.length === 0) {
      await db.giftGroup.delete({ where: { id: giftGroupId } });
      summary.groupsDeleted.push(giftGroupId);
      continue;
    }
    const ownersLeft = others.some((o) => o.role === 'OWNER');
    if (role === 'OWNER' && !ownersLeft) {
      const heir = others.find((o) => o.role === 'ADMIN') ?? others[0]!;
      await db.usersInGiftGroups.update({
        where: {
          userId_giftGroupId: { userId: heir.userId, giftGroupId },
        },
        data: { role: 'OWNER' },
      });
      summary.groupsHandedOver.push(giftGroupId);
    }
  }

  // What is theirs alone: contributions (as `removeContributor` does),
  // authored ideas, votes, messages, and the group rows that name them.
  await db.giftIdea.deleteMany({ where: { proposedById: userId } });
  await db.ideaVote.deleteMany({ where: { voterId: userId } });
  await db.poolMessage.deleteMany({ where: { authorId: userId } });
  await db.poolContributor.deleteMany({ where: { userId } });
  await db.groupActivity.deleteMany({ where: { actorId: userId } });
  await db.groupInvitation.deleteMany({ where: { createdById: userId } });
  await db.groupReminder.deleteMany({ where: { createdById: userId } });
  await db.usersInGiftGroups.deleteMany({ where: { userId } });

  return summary;
}

// Fan out what the deletion decided, AFTER its transaction has committed.
export function announceAccountDeletion(summary: AccountDeletionSummary) {
  announceExchangeAccountDeletion(summary.exchanges);
}
