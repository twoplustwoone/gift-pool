// The visibility seam and the shapes it needs, extracted so every module that
// touches an exchange denies access the same way. `exchanges.server.ts` and
// `exchange-notes.server.ts` both import it; putting it in either of them
// would make the two import each other.
import { type Prisma } from '@prisma/client';
import { data } from 'react-router';
import { prisma } from '#app/utils/db.server.ts';

export const notFound = () =>
  data({ error: 'Exchange not found.' }, { status: 404 });

export const personSelect = {
  id: true,
  username: true,
  name: true,
  image: { select: { id: true, altText: true } },
} as const;

export type ExchangePerson = {
  id: string;
  username: string;
  name: string | null;
  image: { id: string; altText: string | null } | null;
};

// The base select. Deliberately contains NO `assignments` relation.
export const exchangeSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  title: true,
  occasionType: true,
  eventDate: true,
  spendingGuideline: true,
  status: true,
  revealMode: true,
  autoRevealAt: true,
  avoidRepeatsLookback: true,
  giftGroupId: true,
  organizerId: true,
  inviteCode: true,
  drawnAt: true,
  revealedAt: true,
  cancelledAt: true,
  cancelReason: true,
  giftGroup: { select: { id: true, name: true } },
  organizer: { select: personSelect },
} as const;

export type ExchangeRow = Prisma.ExchangeGetPayload<{
  select: typeof exchangeSelect;
}>;

// The shared client or an interactive-transaction handle. Reads that happen
// INSIDE a write transaction must go through the handle: SQLite has a single
// writer, so a read on another connection waits on the transaction's own lock
// until Prisma's 5s timeout (this failed 12 tests on CI before it was caught).
export type Db = Prisma.TransactionClient | typeof prisma;

async function isCurrentGroupMember(
  userId: string,
  giftGroupId: string | null,
): Promise<boolean> {
  if (!giftGroupId) return false;
  const row = await prisma.usersInGiftGroups.findUnique({
    where: { userId_giftGroupId: { userId, giftGroupId } },
    select: { userId: true },
  });
  return row !== null;
}

// The single denial seam. Visible iff organizer, participant row of any
// status, or current member of the linked group. Everything else — including
// "this exchange does not exist" — is the same 404.
export async function requireExchangeVisible(
  viewerId: string,
  exchangeId: string,
): Promise<ExchangeRow> {
  const exchange = await prisma.exchange.findUnique({
    where: { id: exchangeId },
    select: exchangeSelect,
  });
  if (!exchange) throw notFound();
  if (exchange.organizerId === viewerId) return exchange;
  const participant = await prisma.exchangeParticipant.findUnique({
    where: { exchangeId_userId: { exchangeId, userId: viewerId } },
    select: { id: true },
  });
  if (participant) return exchange;
  if (await isCurrentGroupMember(viewerId, exchange.giftGroupId)) {
    return exchange;
  }
  throw notFound();
}
