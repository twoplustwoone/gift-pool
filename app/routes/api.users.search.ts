import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getRelationshipDetails } from '#app/utils/friends.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  // require auth to search
  const currentUserId = await requireUserId(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return json({ results: [] });

  const users = await prisma.user.findMany({
    where: {
      AND: [{ id: { not: currentUserId } }, { username: { contains: q } }],
    },
    orderBy: { username: 'asc' },
    take: 10,
    select: {
      id: true,
      username: true,
      image: { select: { id: true, altText: true } },
    },
  });

  const results = await Promise.all(
    users.map(async (u) => {
      const relationship = await getRelationshipDetails(currentUserId, u.id);
      return { user: u, relationship };
    }),
  );

  return json({ results });
}
