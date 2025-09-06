import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/node';
import { useLoaderData, useSearchParams } from '@remix-run/react';
import { HOME_COPY } from '#app/components/home/home-copy';
import { HomeFeatures } from '#app/components/home/HomeFeatures';
import { HomeFooterLite } from '#app/components/home/HomeFooterLite';
import { HomeHero } from '#app/components/home/HomeHero';
import { HomePanels } from '#app/components/home/HomePanels';
import { track } from '#app/utils/analytics.client.ts';
import { getUserId } from '#app/utils/auth.server.ts';

export const meta: MetaFunction = () => [
  { title: `GiftPool — ${HOME_COPY.hero.headline}` },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mockParam = url.searchParams.get('mock');
  const mock: 'empty' | 'data' | undefined =
    mockParam === 'empty' || mockParam === 'data' ? (mockParam as any) : undefined;

  const userId = await getUserId(request);
  let isLoggedIn = Boolean(userId);

  if (mock) {
    isLoggedIn = true;
  }

  return json({ isLoggedIn, mock });
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
      <HomePanels isLoggedIn={data.isLoggedIn} mock={mock ?? data.mock} />
      <HomeFooterLite />
    </main>
  );
};

export default Index;
