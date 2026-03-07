import { type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids') ?? '';
  const ids = Array.from(
    new Set(
      idsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  if (ids.length === 0)
    return {
      mutuals: {},
    };
  const entries = await Promise.all(
    ids.map(async (friendId) => {
      const where = {
        AND: [
          {
            groupMembers: {
              some: {
                userId,
              },
            },
          },
          {
            groupMembers: {
              some: {
                userId: friendId,
              },
            },
          },
        ],
      };
      const [groups, total] = await Promise.all([
        prisma.giftGroup.findMany({
          where,
          select: {
            id: true,
            name: true,
          },
          take: 3,
        }),
        prisma.giftGroup.count({
          where,
        }),
      ]);
      return [
        friendId,
        {
          groups: groups.slice(0, 2),
          more: Math.max(0, total - 2),
        },
      ] as const;
    }),
  );
  const mutuals = Object.fromEntries(entries);
  return {
    mutuals,
  };
}
