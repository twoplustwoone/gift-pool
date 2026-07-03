import { data } from 'react-router';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUpcomingBirthday } from '#app/utils/birthday.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRelationshipDetails } from '#app/utils/friends.server.ts';
import { createPool } from '#app/utils/pool.server.ts';

// The person surface is circle-private memory keyed to a viewer↔target pair.
// This module owns the access gate, the write paths (Commit 1), and the
// circle-keyed read queries (Commit 4). Every write re-verifies the unlock
// server-side — the UI gate is never the authority.

export const PERSON_SURFACE_OCCASION_TYPE = 'BIRTHDAY';

export type SharedActiveGroup = {
  id: string;
  name: string;
  // The target's per-group share toggles (their affirmative grants to the
  // group). This surface is the first-ever reader of shareWishlist.
  shareWishlist: boolean;
  shareBirthday: boolean;
  // Active members (removedAt: null) with their group contribution defaults —
  // used for the budget line and Organize routing.
  members: Array<{ userId: string; contributionCents: number }>;
};

export type PersonSurfaceAccess = {
  isFriend: boolean;
  sharedActiveGroups: SharedActiveGroup[];
  unlocked: boolean;
};

// Unlock rule (spec §6): FRIENDS or ≥1 shared active group (removedAt: null on
// BOTH memberships). Also returns the shared groups (with the target's per-group
// share flags + members) that the loader needs for visibility and Organize.
export async function getPersonSurfaceAccess(
  viewerId: string,
  targetUserId: string,
): Promise<PersonSurfaceAccess> {
  const relationship = await getRelationshipDetails(viewerId, targetUserId);
  const isFriend = relationship.state === 'FRIENDS';

  const viewerMemberships = await prisma.usersInGiftGroups.findMany({
    where: { userId: viewerId, removedAt: null },
    select: { giftGroupId: true },
  });
  const viewerGroupIds = viewerMemberships.map((m) => m.giftGroupId);

  let sharedActiveGroups: SharedActiveGroup[] = [];
  if (viewerGroupIds.length > 0) {
    const targetMemberships = await prisma.usersInGiftGroups.findMany({
      where: {
        userId: targetUserId,
        removedAt: null,
        giftGroupId: { in: viewerGroupIds },
      },
      select: {
        shareWishlist: true,
        shareBirthday: true,
        giftGroup: {
          select: {
            id: true,
            name: true,
            groupMembers: {
              where: { removedAt: null },
              select: { userId: true, contributionCents: true },
            },
          },
        },
      },
    });
    sharedActiveGroups = targetMemberships.map((m) => ({
      id: m.giftGroup.id,
      name: m.giftGroup.name,
      shareWishlist: m.shareWishlist,
      shareBirthday: m.shareBirthday,
      members: m.giftGroup.groupMembers.map((gm) => ({
        userId: gm.userId,
        contributionCents: gm.contributionCents,
      })),
    }));
  }

  const unlocked = isFriend || sharedActiveGroups.length > 0;
  return { isFriend, sharedActiveGroups, unlocked };
}

// Guard for every write action. Throws a 403 when the target is not unlocked
// for the viewer; returns the access so callers can reuse the shared groups.
export async function requirePersonSurfaceUnlock(
  viewerId: string,
  targetUserId: string,
): Promise<PersonSurfaceAccess> {
  const access = await getPersonSurfaceAccess(viewerId, targetUserId);
  if (!access.unlocked) {
    throw data(
      { error: 'You do not have access to this person.' },
      { status: 403 },
    );
  }
  return access;
}

// Sum of a circle's active member contribution defaults, EXCLUDING the
// recipient (spec §12.4). Returns 0 when nobody has a default — callers must
// suppress the budget line at 0 (earned-not-scaffolded).
export function circleBudgetCents(
  group: SharedActiveGroup,
  recipientUserId: string,
): number {
  return group.members
    .filter((m) => m.userId !== recipientUserId)
    .reduce((sum, m) => sum + (m.contributionCents ?? 0), 0);
}

// The occasion instance a viewer is acting on for decline: the upcoming
// birthday's calendar year. When the birthday passes, the upcoming occurrence
// rolls to next year, so the decline unique-key no longer matches — the decline
// auto-resets next cycle (spec §6).
export function getOccasionYear(
  birthday: Date | string | null | undefined,
): number | null {
  const upcoming = getUpcomingBirthday(birthday);
  return upcoming ? upcoming.date.getFullYear() : null;
}

// ─── Write paths (Commit 1) ─────────────────────────────────────────────────

type WriteContext = { requestId?: string | null };

export async function saveGiftListItem(input: {
  ownerId: string;
  targetUserId: string;
  name: string;
  url?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  requestId?: string | null;
}) {
  const { ownerId, targetUserId, name, url = null, priceCents = null } = input;
  // Currency is only ever stored alongside a price (matches WishlistItem).
  const currency = priceCents != null ? (input.currency ?? null) : null;

  const item = await prisma.giftListItem.create({
    data: { ownerId, targetUserId, name, url, priceCents, currency },
    select: { id: true },
  });

  queueLogEvent({
    name: 'gift_list_item_saved',
    userId: ownerId,
    source: 'server',
    requestId: input.requestId,
    properties: {
      targetUserId,
      hasUrl: url != null,
      hasPrice: priceCents != null,
    },
  });
  return item;
}

export async function createPersonNote(input: {
  authorId: string;
  subjectUserId: string;
  body: string;
  requestId?: string | null;
}) {
  const { authorId, subjectUserId, body } = input;
  const note = await prisma.personNote.create({
    data: { authorId, subjectUserId, body },
    select: { id: true },
  });

  queueLogEvent({
    name: 'person_note_created',
    userId: authorId,
    source: 'server',
    requestId: input.requestId,
    properties: { subjectUserId, length: body.length },
  });
  return note;
}

export async function declineOccasion(input: {
  userId: string;
  targetUserId: string;
  occasionYear: number;
  requestId?: string | null;
}) {
  const { userId, targetUserId, occasionYear } = input;
  const decline = await prisma.occasionDecline.upsert({
    where: {
      userId_targetUserId_occasionType_occasionYear: {
        userId,
        targetUserId,
        occasionType: PERSON_SURFACE_OCCASION_TYPE,
        occasionYear,
      },
    },
    create: {
      userId,
      targetUserId,
      occasionType: PERSON_SURFACE_OCCASION_TYPE,
      occasionYear,
    },
    update: {},
    select: { id: true },
  });

  queueLogEvent({
    name: 'occasion_declined',
    userId,
    source: 'server',
    requestId: input.requestId,
    properties: { targetUserId, occasionYear },
  });
  return decline;
}

export async function undoOccasionDecline(input: {
  userId: string;
  targetUserId: string;
  occasionYear: number;
  requestId?: string | null;
}) {
  const { userId, targetUserId, occasionYear } = input;
  await prisma.occasionDecline.deleteMany({
    where: {
      userId,
      targetUserId,
      occasionType: PERSON_SURFACE_OCCASION_TYPE,
      occasionYear,
    },
  });

  queueLogEvent({
    name: 'occasion_decline_undone',
    userId,
    source: 'server',
    requestId: input.requestId,
    properties: { targetUserId, occasionYear },
  });
}

// Off-wishlist solo gift = a pool-of-one. Never surfaced with pool ceremony;
// the gift `name` becomes the pool title / display name (a nameless solo gift
// is not allowed — enforced by the action schema).
export async function commitSoloGift(input: {
  organizerId: string;
  recipientUserId: string;
  name: string;
  eventDate?: Date | null;
  requestId?: string | null;
}) {
  const { organizerId, recipientUserId, name, eventDate = null } = input;
  const pool = await createPool({
    title: name,
    occasionType: PERSON_SURFACE_OCCASION_TYPE,
    eventDate,
    recipientUserId,
    organizerId,
    giftGroupId: null,
  });

  queueLogEvent({
    name: 'solo_gift_committed',
    userId: organizerId,
    source: 'server',
    requestId: input.requestId,
    properties: { poolId: pool.id, recipientUserId },
  });
  return pool;
}

export type OutcomeFeedback = 'LOVED' | 'OKAY' | 'SKIPPED';

// Records "did it land" on a pool-of-one. Authorized to the pool organizer
// (the solo giver) only.
export async function recordPoolOutcome(input: {
  userId: string;
  poolId: string;
  feedback: OutcomeFeedback;
  requestId?: string | null;
}) {
  const { userId, poolId, feedback } = input;
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: { id: true, organizerId: true },
  });
  if (!pool || pool.organizerId !== userId) {
    throw data({ error: 'Pool not found.' }, { status: 404 });
  }
  await prisma.pool.update({
    where: { id: poolId },
    data: { outcomeFeedback: feedback },
  });

  queueLogEvent({
    name: 'gift_outcome_recorded',
    userId,
    source: 'server',
    requestId: input.requestId,
    properties: { kind: 'pool', poolId, feedback },
  });
}

// Records "did it land" on a wishlist-claim solo intent. Authorized to the
// claimer (purchasedById) only.
export async function recordWishlistPurchaseOutcome(input: {
  userId: string;
  wishlistItemId: string;
  feedback: OutcomeFeedback;
  requestId?: string | null;
}) {
  const { userId, wishlistItemId, feedback } = input;
  const purchase = await prisma.wishlistPurchase.findUnique({
    where: { wishlistItemId },
    select: { purchasedById: true },
  });
  if (!purchase || purchase.purchasedById !== userId) {
    throw data({ error: 'Claim not found.' }, { status: 404 });
  }
  await prisma.wishlistPurchase.update({
    where: { wishlistItemId },
    data: { outcomeFeedback: feedback },
  });

  queueLogEvent({
    name: 'gift_outcome_recorded',
    userId,
    source: 'server',
    requestId: input.requestId,
    properties: { kind: 'wishlist', wishlistItemId, feedback },
  });
}

export type { WriteContext };
