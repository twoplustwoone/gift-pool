import { prisma } from '#app/utils/db.server.ts';
import { EXCHANGE_STATUS } from '#app/utils/exchange-constants.ts';

// A gifter may read their giftee's wishlist for the lifetime of a drawn
// exchange, even when they are not friends. Access ends when the exchange
// leaves DRAWN (revealed, finished or cancelled) or the assignment is
// superseded by a splice. Kept in its own file so `friends.server.ts` can call
// it without importing the whole exchanges module (which imports friends).
export async function isActiveExchangeGifterOf(
  viewerId: string,
  ownerId: string,
): Promise<boolean> {
  if (viewerId === ownerId) return false;
  const live = await prisma.exchangeAssignment.findFirst({
    where: {
      gifterId: viewerId,
      gifteeId: ownerId,
      supersededAt: null,
      exchange: { status: EXCHANGE_STATUS.DRAWN },
    },
    select: { id: true },
  });
  return live !== null;
}
