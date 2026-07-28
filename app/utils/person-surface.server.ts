import { data } from 'react-router';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import {
  formatBirthdayLabel,
  getRecentBirthday,
  getUpcomingBirthday,
} from '#app/utils/birthday.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRelationshipDetails } from '#app/utils/friends.server.ts';
import {
  ACTIVE_POOL_STATUSES,
  POOL_STATUS,
} from '#app/utils/pool-constants.ts';
import { createPool, proposeIdea } from '#app/utils/pool.server.ts';
import {
  HIDDEN_CLAIM_DISCLOSURE,
  type ClaimDisclosure,
} from '#app/utils/wishlist-claim-disclosure.ts';
import { loadClaimStates } from '#app/utils/wishlist-claims.server.ts';

// Post-occasion detection window (spec §4): 14 days after the occasion.
export const POST_OCCASION_WINDOW_DAYS = 14;

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
// claimer (claimedByUserId) only.
export async function recordWishlistClaimOutcome(input: {
  userId: string;
  wishlistItemId: string;
  feedback: OutcomeFeedback;
  requestId?: string | null;
}) {
  const { userId, wishlistItemId, feedback } = input;
  const claim = await prisma.wishlistClaim.findUnique({
    where: { wishlistItemId },
    select: { claimedByUserId: true },
  });
  if (!claim || claim.claimedByUserId !== userId) {
    throw data({ error: 'Claim not found.' }, { status: 404 });
  }
  await prisma.wishlistClaim.update({
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

// ─── Ideation reads (Commit 4 — circle-keyed) ────────────────────────────────

export type PersonIdeation = {
  giftHistory: Array<{
    id: string;
    name: string;
    year: number;
    contributorCount: number;
    priceCents: number | null;
  }>;
  proposedUnused: Array<{ id: string; name: string; year: number }>;
  notes: Array<{ id: string; body: string }>;
  savedIdeas: Array<{
    id: string;
    name: string;
    url: string | null;
    priceCents: number | null;
    currency: string | null;
  }>;
};

// Gift history + proposed-but-unused are visible only to a viewer who was in
// the circle the memory came from (a contributor of the pool). Gift history is
// PAST occasions only — the active cycle's pool must never show as "given" the
// moment an idea is chosen: guard on eventDate < now, or (undated) a terminal
// PURCHASED/DELIVERED status. Notes + saved ideas are private to the viewer.
export async function loadPersonIdeation(
  viewerId: string,
  targetUserId: string,
): Promise<PersonIdeation> {
  const now = new Date();
  const [historyPools, notes, savedIdeas] = await Promise.all([
    prisma.pool.findMany({
      where: {
        recipientUserId: targetUserId,
        chosenIdeaId: { not: null },
        contributors: { some: { userId: viewerId } },
        OR: [
          { eventDate: { lt: now } },
          {
            eventDate: null,
            status: { in: [POOL_STATUS.PURCHASED, POOL_STATUS.DELIVERED] },
          },
        ],
      },
      select: {
        id: true,
        eventDate: true,
        createdAt: true,
        finalPriceCents: true,
        chosenIdeaId: true,
        chosenIdea: { select: { name: true } },
        _count: { select: { contributors: true } },
        ideas: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.personNote.findMany({
      where: { authorId: viewerId, subjectUserId: targetUserId },
      select: { id: true, body: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.giftListItem.findMany({
      where: { ownerId: viewerId, targetUserId },
      select: {
        id: true,
        name: true,
        url: true,
        priceCents: true,
        currency: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const giftHistory = historyPools.map((p) => ({
    id: p.id,
    name: p.chosenIdea?.name ?? 'Gift',
    year: (p.eventDate ?? p.createdAt).getFullYear(),
    contributorCount: p._count.contributors,
    priceCents: p.finalPriceCents,
  }));

  const proposedUnused = historyPools.flatMap((p) =>
    p.ideas
      .filter((i) => i.id !== p.chosenIdeaId)
      .map((i) => ({
        id: i.id,
        name: i.name,
        year: (p.eventDate ?? p.createdAt).getFullYear(),
      })),
  );

  return { giftHistory, proposedUnused, notes, savedIdeas };
}

export type PersonWishlistItem = {
  id: string;
  title: string;
  url: string | null;
  priceCents: number | null;
  currency: string | null;
  claimed: boolean;
  claimedByViewer: boolean;
  // Tiered disclosure for the "claimed by someone else" case (pool or
  // another user). Never consulted for the viewer's own claim — that stays
  // on `claimed`/`claimedByViewer`, which this ladder doesn't special-case.
  claimDisclosure: ClaimDisclosure;
};

// The target's active wishlist as a gift source. Claim identity is never
// exposed — only whether the item is claimed, and whether the VIEWER is the
// claimer (for the self "I'm getting this" toggle). This is always a
// non-owner surface (the target is never the viewer on this route).
export async function loadPersonWishlistSource(
  viewerId: string,
  targetUserId: string,
): Promise<PersonWishlistItem[]> {
  const items = await prisma.wishlistItem.findMany({
    where: { ownerId: targetUserId, status: 'ACTIVE' },
    select: {
      id: true,
      title: true,
      url: true,
      priceCents: true,
      currency: true,
      claim: { select: { claimedByUserId: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
  });
  const claimDisclosures = await loadClaimStates(
    items.map((i) => i.id),
    { userId: viewerId, isOwner: false },
  );
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    url: i.url,
    priceCents: i.priceCents,
    currency: i.currency,
    claimed: i.claim != null,
    claimedByViewer: i.claim?.claimedByUserId === viewerId,
    claimDisclosure: claimDisclosures.get(i.id) ?? HIDDEN_CLAIM_DISCLOSURE,
  }));
}

// Open pools for this recipient that the viewer is a contributor of — the
// "Propose to pool" resolver. 0 → route into Organize; 1 → propose directly;
// 2+ → picker. Never dead-ends.
export async function loadOpenPoolsForRecipient(
  viewerId: string,
  targetUserId: string,
): Promise<Array<{ id: string; title: string }>> {
  return prisma.pool.findMany({
    where: {
      recipientUserId: targetUserId,
      status: POOL_STATUS.OPEN,
      contributors: { some: { userId: viewerId } },
    },
    select: { id: true, title: true },
    orderBy: { createdAt: 'desc' },
  });
}

// §6.3 continuation: the pool the viewer should continue rather than
// duplicate. Any active-status pool for this recipient that the viewer
// contributes to — visibility is contribution-scoped, so a pool the viewer
// isn't in never surfaces here (and the recipient can never be a
// contributor, so their own page never leaks a concealed pool).
export async function loadContinuePool(
  viewerId: string,
  targetUserId: string,
): Promise<{
  id: string;
  title: string;
  status: string;
  contributorCount: number;
} | null> {
  const pool = await prisma.pool.findFirst({
    where: {
      recipientUserId: targetUserId,
      status: { in: ACTIVE_POOL_STATUSES },
      contributors: { some: { userId: viewerId } },
    },
    select: {
      id: true,
      title: true,
      status: true,
      _count: { select: { contributors: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (!pool) return null;
  return {
    id: pool.id,
    title: pool.title,
    status: pool.status,
    contributorCount: pool._count.contributors,
  };
}

// Propose an idea (from the wishlist or a saved GiftListItem) into an existing
// open pool. Authorized: the pool must be OPEN, for this recipient, and the
// viewer must be a contributor. Promoting a saved idea links it (giftListItemId)
// rather than copying.
export async function proposeToPool(input: {
  userId: string;
  poolId: string;
  targetUserId: string;
  name: string;
  wishlistItemId?: string | null;
  giftListItemId?: string | null;
  url?: string | null;
  priceCents?: number | null;
  requestId?: string | null;
}) {
  const { userId, poolId, targetUserId, name } = input;
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    select: {
      id: true,
      status: true,
      recipientUserId: true,
      contributors: { where: { userId }, select: { userId: true } },
    },
  });
  if (
    !pool ||
    pool.status !== POOL_STATUS.OPEN ||
    pool.recipientUserId !== targetUserId ||
    pool.contributors.length === 0
  ) {
    throw data({ error: 'Pool not found.' }, { status: 404 });
  }

  const idea = await proposeIdea({
    poolId,
    proposedById: userId,
    name,
    url: input.url ?? null,
    estimatedPriceCents: input.priceCents ?? null,
    wishlistItemId: input.wishlistItemId ?? null,
    giftListItemId: input.giftListItemId ?? null,
  });

  queueLogEvent({
    name: input.giftListItemId ? 'saved_idea_promoted' : 'pool_idea_proposed',
    userId,
    source: 'server',
    requestId: input.requestId,
    properties: {
      poolId,
      ideaId: idea.id,
      fromWishlist: input.wishlistItemId != null,
      fromSavedIdea: input.giftListItemId != null,
    },
  });
  return idea;
}

// ─── Post-occasion detection (Commit 5, spec §4) ─────────────────────────────

export type PostOccasion = {
  occasionLabel: string;
  // The viewer's unconfirmed solo intent that needs a "did it land" answer.
  gift: { kind: 'pool' | 'wishlist'; id: string; name: string };
  // Set when a group pool for this recipient recorded automatically this cycle.
  recordedGroupPoolName: string | null;
};

// Within 14 days after the occasion, only if the viewer has an unconfirmed
// solo intent for it (pool-of-one or wishlist claim). Group pools record
// automatically at their DECIDED transition; we only surface that note. Once a
// solo intent is answered OR skipped (outcomeFeedback set), it's never
// re-detected — no re-nag.
export async function loadPostOccasion(
  viewerId: string,
  targetUserId: string,
  birthday: Date | string | null | undefined,
): Promise<PostOccasion | null> {
  const recent = getRecentBirthday(birthday, POST_OCCASION_WINDOW_DAYS);
  if (!recent) return null;

  // Unconfirmed solo intents. Pool-of-one = organizer-solo pool (exactly one
  // contributor) with no recorded outcome.
  const soloPools = await prisma.pool.findMany({
    where: {
      organizerId: viewerId,
      recipientUserId: targetUserId,
      outcomeFeedback: null,
    },
    select: {
      id: true,
      title: true,
      _count: { select: { contributors: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const soloPool = soloPools.find((p) => p._count.contributors === 1);

  let gift: PostOccasion['gift'] | null = null;
  if (soloPool) {
    gift = { kind: 'pool', id: soloPool.id, name: soloPool.title };
  } else {
    const claim = await prisma.wishlistClaim.findFirst({
      where: {
        claimedByUserId: viewerId,
        outcomeFeedback: null,
        wishlistItem: { ownerId: targetUserId },
      },
      select: {
        wishlistItemId: true,
        wishlistItem: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (claim) {
      gift = {
        kind: 'wishlist',
        id: claim.wishlistItemId,
        name: claim.wishlistItem.title,
      };
    }
  }
  if (!gift) return null;

  // Group pool (more than one contributor) decided for the just-passed cycle.
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const groupPools = await prisma.pool.findMany({
    where: {
      recipientUserId: targetUserId,
      chosenIdeaId: { not: null },
      contributors: { some: { userId: viewerId } },
      eventDate: { gte: windowStart, lt: new Date() },
    },
    select: {
      chosenIdea: { select: { name: true } },
      _count: { select: { contributors: true } },
    },
  });
  const groupPool = groupPools.find((p) => p._count.contributors > 1);

  const occasionLabel =
    recent.daysSince === 0
      ? 'was today'
      : recent.daysSince === 1
        ? 'was yesterday'
        : `was ${formatBirthdayLabel(recent.date, -1)} · ${recent.daysSince} days ago`;

  return {
    occasionLabel,
    gift,
    recordedGroupPoolName: groupPool?.chosenIdea?.name ?? null,
  };
}

export type { WriteContext };
