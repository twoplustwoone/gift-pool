/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetcherLoad = vi.fn();
const fetcherSnapshot: {
  data:
    | {
        birthdays: Array<{
          dateISO: string;
          dateLabel: string;
          groupId: string | null;
          id: string;
          name: string;
          username?: string | null;
        }>;
        forYou: Array<{
          id: string;
          kind: 'buy' | 'deliver' | 'vote' | 'settle' | 'plan';
          title: string;
          detail: string | null;
          href: string;
        }>;
        memory: Array<{
          id: string;
          recipientLabel: string;
          giftLabel: string;
          contributorCount: number;
          whenISO: string;
        }>;
        groups: Array<{ id: string; name: string }>;
      }
    | undefined;
  state: 'idle' | 'loading' | 'submitting';
} = {
  data: undefined,
  state: 'idle',
};

const track = vi.fn();
const prefetchSpy = vi.fn();
const getUserId = vi.fn();
const wishlistItemCount = vi.fn();
const groupCount = vi.fn();
const poolFindMany = vi.fn();
const useOptionalUser = vi.fn();
const loaderDataSnapshot: {
  activePools: Array<{
    contributorCount: number;
    eventDate: string | null;
    id: string;
    occasionType: string;
    recipientName: string | null;
    status: string;
    title: string;
  }>;
  groupCount: number;
  isLoggedIn: boolean;
  mock?: 'data' | 'empty';
  wishlistCount: number;
} = {
  activePools: [],
  groupCount: 0,
  isLoggedIn: false,
  mock: undefined,
  wishlistCount: 0,
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: fetcherSnapshot.data,
      load: fetcherLoad,
      state: fetcherSnapshot.state,
      submit: vi.fn(),
    }),
    useLoaderData: () => loaderDataSnapshot,
  };
});

vi.mock('#app/components/home/HomepageMockup.tsx', () => ({
  HomepageMockup: ({ alt }: { alt: string }) => <div>{alt}</div>,
}));

vi.mock('#app/hooks/use-background-route-prefetch.ts', () => ({
  useHomeBackgroundPrefetch: (...args: Array<unknown>) => prefetchSpy(...args),
}));

vi.mock('#app/utils/analytics.client.ts', () => ({
  track: (...args: Array<unknown>) => track(...args),
}));

vi.mock('#app/utils/auth.server.ts', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    usersInGiftGroups: {
      count: (...args: Array<unknown>) => groupCount(...args),
    },
    wishlistItem: {
      count: (...args: Array<unknown>) => wishlistItemCount(...args),
    },
    pool: {
      findMany: (...args: Array<unknown>) => poolFindMany(...args),
    },
  },
}));

vi.mock('#app/utils/user.ts', () => ({
  useOptionalUser: () => useOptionalUser(),
}));

import { HOME_COPY } from '#app/components/home/home-copy.ts';
import IndexRoute, { loader, meta } from './index.tsx';

beforeEach(() => {
  fetcherLoad.mockReset();
  fetcherSnapshot.data = undefined;
  fetcherSnapshot.state = 'idle';
  track.mockReset();
  prefetchSpy.mockReset();
  getUserId.mockReset();
  wishlistItemCount.mockReset();
  groupCount.mockReset();
  poolFindMany.mockReset();
  useOptionalUser.mockReset();
  useOptionalUser.mockReturnValue(null);
  loaderDataSnapshot.activePools = [];
  loaderDataSnapshot.groupCount = 0;
  loaderDataSnapshot.isLoggedIn = false;
  loaderDataSnapshot.mock = undefined;
  loaderDataSnapshot.wishlistCount = 0;
});

function renderIndexRoute({
  entry = '/',
  loaderData = {
    activePools: [],
    groupCount: 0,
    isLoggedIn: false,
    mock: undefined,
    wishlistCount: 0,
  },
  user = null,
}: {
  entry?: string;
  loaderData?: {
    activePools: Array<{
      contributorCount: number;
      eventDate: string | null;
      id: string;
      occasionType: string;
      recipientName: string | null;
      status: string;
      title: string;
    }>;
    groupCount: number;
    isLoggedIn: boolean;
    mock?: 'data' | 'empty';
    wishlistCount: number;
  };
  user?: { id: string } | null;
} = {}) {
  useOptionalUser.mockReturnValue(user);
  loaderDataSnapshot.activePools = loaderData.activePools;
  loaderDataSnapshot.groupCount = loaderData.groupCount;
  loaderDataSnapshot.isLoggedIn = loaderData.isLoggedIn;
  loaderDataSnapshot.mock = loaderData.mock;
  loaderDataSnapshot.wishlistCount = loaderData.wishlistCount;

  return render(
    <MemoryRouter initialEntries={[entry]}>
      <IndexRoute />
    </MemoryRouter>,
  );
}

describe('app/routes/index.tsx', () => {
  it('returns logged out defaults when the visitor has no session', async () => {
    getUserId.mockResolvedValue(null);

    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://example.com/?mock=unknown'),
      } as never),
    ).resolves.toEqual({
      activePools: [],
      groupCount: 0,
      isLoggedIn: false,
      mock: undefined,
      wishlistCount: 0,
    });

    expect(wishlistItemCount).not.toHaveBeenCalled();
    expect(groupCount).not.toHaveBeenCalled();
  });

  it('returns mock counts for empty and populated preview states', async () => {
    getUserId.mockResolvedValue('user-1');

    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://example.com/?mock=empty'),
      } as never),
    ).resolves.toEqual({
      activePools: [],
      groupCount: 0,
      isLoggedIn: true,
      mock: 'empty',
      wishlistCount: 0,
    });

    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://example.com/?mock=data'),
      } as never),
    ).resolves.toEqual({
      activePools: [],
      groupCount: 1,
      isLoggedIn: true,
      mock: 'data',
      wishlistCount: 2,
    });
  });

  it('loads real counts for authenticated users', async () => {
    getUserId.mockResolvedValue('user-42');
    wishlistItemCount.mockResolvedValue(3);
    groupCount.mockResolvedValue(5);
    poolFindMany.mockResolvedValue([
      {
        _count: { contributors: 4 },
        eventDate: new Date('2026-06-14T00:00:00.000Z'),
        id: 'pool-1',
        occasionType: 'BIRTHDAY',
        recipientName: null,
        recipientUser: { name: 'Alex', username: 'alex' },
        status: 'OPEN',
        title: 'Alex Birthday Gift',
      },
    ]);

    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://example.com/'),
      } as never),
    ).resolves.toEqual({
      activePools: [
        {
          contributorCount: 4,
          eventDate: '2026-06-14T00:00:00.000Z',
          id: 'pool-1',
          occasionType: 'BIRTHDAY',
          recipientName: 'Alex',
          status: 'OPEN',
          title: 'Alex Birthday Gift',
        },
      ],
      groupCount: 5,
      isLoggedIn: true,
      mock: undefined,
      wishlistCount: 3,
    });

    expect(wishlistItemCount).toHaveBeenCalledWith({
      where: { ownerId: 'user-42' },
    });
    expect(groupCount).toHaveBeenCalledWith({
      where: { userId: 'user-42' },
    });
    expect(poolFindMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      select: {
        _count: { select: { contributors: true } },
        eventDate: true,
        id: true,
        occasionType: true,
        recipientName: true,
        recipientUser: { select: { name: true, username: true } },
        status: true,
        title: true,
      },
      take: 6,
      where: {
        contributors: { some: { userId: 'user-42' } },
        status: { in: ['OPEN', 'VOTING', 'DECIDED', 'PURCHASED'] },
        OR: [
          { recipientUserId: null },
          { recipientUserId: { not: 'user-42' } },
        ],
      },
    });
  });

  it('builds the homepage title from the shared copy', () => {
    expect(meta({} as never)).toEqual([
      { title: `GiftPool — ${HOME_COPY.hero.headline}` },
    ]);
  });

  it('renders the dashboard and enables prefetch for real users', async () => {
    renderIndexRoute({
      loaderData: {
        activePools: [
          {
            contributorCount: 2,
            eventDate: null,
            id: 'pool-1',
            occasionType: 'BIRTHDAY',
            recipientName: 'Alex',
            status: 'OPEN',
            title: 'Alex Birthday Gift',
          },
        ],
        groupCount: 1,
        isLoggedIn: true,
        wishlistCount: 2,
      },
      user: { id: 'user-7' },
    });

    expect(
      screen.getByRole('heading', { name: 'Your pools' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Alex Birthday Gift/i }),
    ).toHaveAttribute('href', '/pools/pool-1');

    expect(prefetchSpy).toHaveBeenCalledWith({
      enabled: true,
      scopeKey: 'user-7',
    });
    await waitFor(() => {
      expect(fetcherLoad).toHaveBeenCalledWith('/resources/home/panels');
    });
  });

  it('renders the marketing page and tracks CTA clicks for logged-out visitors', async () => {
    renderIndexRoute();

    expect(
      screen.getByRole('heading', { name: HOME_COPY.hero.headline }),
    ).toBeInTheDocument();
    expect(screen.getByText(HOME_COPY.hero.visualAlt)).toBeInTheDocument();
    expect(
      screen.getByText(HOME_COPY.howItWorks.steps[1].title),
    ).toBeInTheDocument();
    expect(
      screen.getByText(HOME_COPY.maker.heading, { exact: false }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('link', { name: HOME_COPY.hero.primaryCta }),
    );
    await userEvent.click(
      screen.getByRole('link', { name: HOME_COPY.hero.secondaryCta }),
    );

    expect(track).toHaveBeenNthCalledWith(1, 'home_cta_clicked', {
      cta: 'start_pool',
    });
    expect(track).toHaveBeenNthCalledWith(2, 'home_cta_clicked', {
      cta: 'make_wishlist',
    });
    expect(prefetchSpy).toHaveBeenCalledWith({
      enabled: false,
      scopeKey: null,
    });
  });

  it('disables background prefetch for preview mode', () => {
    renderIndexRoute({
      entry: '/?mock=data',
      loaderData: {
        activePools: [],
        groupCount: 1,
        isLoggedIn: true,
        mock: 'data',
        wishlistCount: 2,
      },
      user: { id: 'user-7' },
    });

    expect(prefetchSpy).toHaveBeenCalledWith({
      enabled: false,
      scopeKey: 'user-7',
    });
  });

  it('renders For you actions, occasions, groups, and gift memory from the fetcher', () => {
    fetcherSnapshot.data = {
      birthdays: [
        {
          dateISO: '2026-04-10',
          dateLabel: 'Apr 10',
          groupId: 'group-1',
          id: 'birthday-1',
          name: 'Alex Johnson',
          username: 'alex',
        },
      ],
      forYou: [
        {
          id: 'buy:p-1',
          kind: 'buy' as const,
          title: 'Buy the gift',
          detail: 'Marco 30th',
          href: '/pools/p-1',
        },
      ],
      memory: [
        {
          id: 'p-2',
          recipientLabel: 'Leo',
          giftLabel: 'Travel kit',
          contributorCount: 3,
          whenISO: '2026-06-01T00:00:00.000Z',
        },
      ],
      groups: [{ id: 'group-1', name: 'The Crew' }],
    };

    renderIndexRoute({
      loaderData: {
        activePools: [],
        groupCount: 1,
        isLoggedIn: true,
        mock: undefined,
        wishlistCount: 1,
      },
      user: { id: 'user-7' },
    });

    // For you leads and links to the responsibility.
    expect(screen.getByTestId('for-you-buy')).toHaveAttribute(
      'href',
      '/pools/p-1',
    );
    // Occasions lead to the person page, not the group.
    expect(screen.getByRole('link', { name: 'Alex Johnson' })).toHaveAttribute(
      'href',
      '/users/alex',
    );
    expect(
      screen.getByRole('link', { name: HOME_COPY.panels.planGift }),
    ).toHaveAttribute('href', '/users/alex');
    // Groups section lists memberships.
    expect(screen.getByRole('link', { name: 'The Crew' })).toHaveAttribute(
      'href',
      '/groups/group-1',
    );
    // Earned memory renders factual history.
    expect(screen.getByTestId('panel-memory')).toBeInTheDocument();
    expect(screen.getByText('Travel kit')).toBeInTheDocument();
  });

  it('hides For you and gift memory until earned', () => {
    fetcherSnapshot.data = {
      birthdays: [],
      forYou: [],
      memory: [],
      groups: [],
    };

    renderIndexRoute({
      loaderData: {
        activePools: [],
        groupCount: 0,
        isLoggedIn: true,
        mock: undefined,
        wishlistCount: 1,
      },
      user: { id: 'user-7' },
    });

    // No pools + no actions → the For you section stays absent (quiet).
    expect(screen.queryByTestId('panel-for-you')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-memory')).not.toBeInTheDocument();
    // Empty-groups nudge still renders inside the groups section.
    expect(screen.getByTestId('empty-groups-cta')).toBeInTheDocument();
  });
});
