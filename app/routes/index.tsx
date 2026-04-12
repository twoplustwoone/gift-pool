import { type LoaderFunctionArgs, type MetaFunction, useLoaderData, useSearchParams  } from 'react-router';
import { HOME_COPY } from '#app/components/home/home-copy';
import { HomeFeatures } from '#app/components/home/HomeFeatures';
import { HomeHero } from '#app/components/home/HomeHero';
import { HomeLoggedIn } from '#app/components/home/HomeLoggedIn';
import { useHomeBackgroundPrefetch } from '#app/hooks/use-background-route-prefetch.ts';
import { track } from '#app/utils/analytics.client.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { ACTIVE_POOL_STATUSES } from '#app/utils/pool-constants.ts';
import { useOptionalUser } from '#app/utils/user.ts';
export const meta: MetaFunction = () => [
  {
    title: `GiftPool — ${HOME_COPY.hero.headline}`,
  },
];
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mockParam = url.searchParams.get('mock');
  const mock: 'empty' | 'data' | undefined =
    mockParam === 'empty' || mockParam === 'data'
      ? (mockParam as any)
      : undefined;
  const userId = await getUserId(request);
  let isLoggedIn = Boolean(userId);
  let wishlistCount = 0;
  let groupCount = 0;
  let activePools: Array<{
    id: string;
    title: string;
    status: string;
    occasionType: string;
    recipientName: string | null;
    eventDate: string | null;
    contributorCount: number;
  }> = [];

  if (mock === 'empty') {
    isLoggedIn = true;
    wishlistCount = 0;
    groupCount = 0;
  } else if (mock === 'data') {
    isLoggedIn = true;
    wishlistCount = 2;
    groupCount = 1;
  } else if (userId) {
    // real counts + active pools
    const [wCount, gCount, pools] = await Promise.all([
      prisma.wishlistItem.count({ where: { ownerId: userId } }),
      prisma.usersInGiftGroups.count({ where: { userId } }),
      prisma.pool.findMany({
        where: {
          contributors: { some: { userId } },
          status: { in: ACTIVE_POOL_STATUSES },
        },
        select: {
          id: true,
          title: true,
          status: true,
          occasionType: true,
          recipientName: true,
          eventDate: true,
          recipientUser: { select: { name: true, username: true } },
          _count: { select: { contributors: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
    ]);
    wishlistCount = wCount;
    groupCount = gCount;
    activePools = pools.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      occasionType: p.occasionType,
      recipientName:
        p.recipientName ?? p.recipientUser?.name ?? p.recipientUser?.username ?? null,
      eventDate: p.eventDate?.toISOString() ?? null,
      contributorCount: p._count.contributors,
    }));
  }
  return {
    isLoggedIn,
    wishlistCount,
    groupCount,
    mock,
    activePools,
  };
}
const Index = () => {
  const data = useLoaderData<typeof loader>();
  const [search] = useSearchParams();
  const mock = (search.get('mock') as 'empty' | 'data' | null) ?? undefined;
  const user = useOptionalUser();

  useHomeBackgroundPrefetch({
    enabled: Boolean(user) && !mock,
    scopeKey: user?.id ?? null,
  });

  // Logged-in users get a dashboard — not the marketing page
  if (data.isLoggedIn) {
    return (
      <HomeLoggedIn
        activePools={data.activePools}
        wishlistCount={data.wishlistCount}
        groupCount={data.groupCount}
        mock={mock ?? data.mock}
      />
    );
  }

  return (
    <main role="main">
      <HomeHero
        onPrimaryClick={() => track('home.cta.create_wishlist')}
        onSecondaryClick={() => track('home.cta.start_group')}
      />
      <HomeFeatures />
    </main>
  );
};
export default Index;
