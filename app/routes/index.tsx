import { type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData, useSearchParams } from 'react-router';
import { HOME_COPY } from '#app/components/home/home-copy';
import { HomeFeatures } from '#app/components/home/HomeFeatures';
import { HomeFooterLite } from '#app/components/home/HomeFooterLite';
import { HomeHero } from '#app/components/home/HomeHero';
import { HomePanels } from '#app/components/home/HomePanels';
import { track } from '#app/utils/analytics.client.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
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
  if (mock === 'empty') {
    isLoggedIn = true;
    wishlistCount = 0;
    groupCount = 0;
  } else if (mock === 'data') {
    isLoggedIn = true;
    wishlistCount = 2;
    groupCount = 1;
  } else if (userId) {
    // real counts
    const [wCount, gCount] = await Promise.all([
      prisma.wishlistItem.count({
        where: {
          ownerId: userId,
        },
      }),
      prisma.usersInGiftGroups.count({
        where: {
          userId,
        },
      }),
    ]);
    wishlistCount = wCount;
    groupCount = gCount;
  }
  return {
    isLoggedIn,
    wishlistCount,
    groupCount,
    mock,
  };
}
const Index = () => {
  const data = useLoaderData<typeof loader>();
  const [search] = useSearchParams();
  const mock = (search.get('mock') as 'empty' | 'data' | null) ?? undefined;
  return (
    <main role="main">
      <HomeHero
        onPrimaryClick={() => track('home.cta.create_wishlist')}
        onSecondaryClick={() => track('home.cta.start_group')}
      />
      <HomeFeatures />
      <HomePanels
        isLoggedIn={data.isLoggedIn}
        wishlistCount={data.wishlistCount}
        groupCount={data.groupCount}
        mock={mock ?? data.mock}
      />
      <HomeFooterLite />
    </main>
  );
};
export default Index;
