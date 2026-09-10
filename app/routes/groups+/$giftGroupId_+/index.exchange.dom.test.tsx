/**
 * @vitest-environment jsdom
 */
// The group overview's exchange section: the four states a member can be in,
// rendered through the real page so the section's placement and copy are what
// a member would actually get.
import { render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type GroupExchangeSummary } from '#app/utils/exchanges.server.ts';

const loaderData: {
  actionQueue: unknown[];
  activePools: unknown[];
  upcomingOccasions: unknown[];
  pastGifts: unknown[];
  exchange: GroupExchangeSummary;
} = {
  actionQueue: [],
  activePools: [],
  upcomingOccasions: [],
  pastGifts: [],
  exchange: null,
};

const layoutData = {
  giftGroup: {
    id: 'g1',
    name: 'The Painted',
    description: null,
    groupMembers: [
      {
        user: {
          id: 'np',
          username: 'np',
          name: 'Nicolas Posse',
          birthday: null,
          image: null,
        },
        role: 'MEMBER',
      },
    ],
  },
  inviteLink: null,
  viewer: { userId: 'np', contributionCents: 2000, role: 'MEMBER' },
  canInvite: false,
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => loaderData,
    useRouteLoaderData: () => layoutData,
    useFetcher: () => ({
      Form: ({ children }: { children?: React.ReactNode }) => (
        <form>{children}</form>
      ),
      submit: () => {},
      state: 'idle' as const,
      data: undefined,
      formData: undefined,
    }),
  };
});

import GiftGroupOverview from './index.tsx';

const organizer = {
  id: 'fd',
  username: 'fd',
  name: 'Francisco Di Giandomenico',
  image: null,
};

const summary = (
  overrides: Partial<NonNullable<GroupExchangeSummary>> = {},
): GroupExchangeSummary => ({
  exchange: {
    id: 'x1',
    title: 'The Painted 2026',
    occasionType: 'HOLIDAY',
    eventDate: new Date('2026-12-24T00:00:00Z'),
    status: 'GATHERING',
    stage: 'GATHERING',
    organizer,
    participantCount: 5,
  },
  viewer: {
    isOrganizer: false,
    participation: 'PENDING',
    dismissedJoinPrompt: false,
  },
  ...overrides,
});

const renderOverview = () =>
  render(
    <MemoryRouter initialEntries={['/groups/g1']}>
      <GiftGroupOverview />
    </MemoryRouter>,
  );

const section = () => screen.getByTestId('exchange-section');

beforeEach(() => {
  loaderData.exchange = null;
});

describe('group overview exchange section', () => {
  it('invites the group to start one when there is none', () => {
    renderOverview();
    expect(section()).toHaveTextContent('Everyone draws one person');
    expect(
      screen.getByRole('link', { name: 'Start an exchange' }),
    ).toHaveAttribute('href', '/exchanges/new?groupId=g1');
    expect(
      screen.queryByTestId('exchange-join-prompt'),
    ).not.toBeInTheDocument();
  });

  it('prompts a member who has not answered, and says who to beat', () => {
    loaderData.exchange = summary();
    renderOverview();
    const prompt = screen.getByTestId('exchange-join-prompt');
    expect(prompt).toHaveTextContent('The Painted 2026 is happening');
    expect(prompt).toHaveTextContent(
      'Join before Francisco draws names on 24 Dec.',
    );
    expect(prompt).toHaveTextContent('5 people are in');
    expect(
      screen.getByRole('button', { name: 'Join the exchange' }),
    ).toBeInTheDocument();
  });

  it('drops to a quiet Join line once the prompt is dismissed', () => {
    loaderData.exchange = summary({
      viewer: {
        isOrganizer: false,
        participation: 'PENDING',
        dismissedJoinPrompt: true,
      },
    });
    renderOverview();
    expect(
      screen.queryByTestId('exchange-join-prompt'),
    ).not.toBeInTheDocument();
    const quiet = screen.getByTestId('exchange-quiet-line');
    expect(quiet).toHaveTextContent("you're not in it");
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute(
      'href',
      '/exchanges/x1',
    );
  });

  it('offers a bystander a view, not a join, once names are drawn', () => {
    loaderData.exchange = summary({
      exchange: {
        ...summary()!.exchange,
        status: 'DRAWN',
        stage: 'DRAWN',
      },
    });
    renderOverview();
    const quiet = screen.getByTestId('exchange-quiet-line');
    expect(quiet).toHaveTextContent('names are drawn');
    expect(screen.getByRole('link', { name: 'View' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Join' }),
    ).not.toBeInTheDocument();
  });

  it('gives a participant and the organizer a row card with the stage', () => {
    loaderData.exchange = summary({
      viewer: {
        isOrganizer: false,
        participation: 'IN',
        dismissedJoinPrompt: false,
      },
    });
    const { unmount } = renderOverview();
    expect(section()).toHaveTextContent("You're in");
    expect(section()).toHaveTextContent('Gathering people');
    // The row uses the group overview's own date format (formatMonthDay), so
    // it matches the pool and occasion rows beside it rather than the
    // exchange page's "24 Dec".
    expect(section()).toHaveTextContent('Holiday · Dec 24 · 5 people');
    expect(
      screen.getByRole('link', { name: /The Painted 2026/ }),
    ).toHaveAttribute('href', '/exchanges/x1');
    unmount();

    loaderData.exchange = summary({
      viewer: {
        isOrganizer: true,
        participation: 'IN',
        dismissedJoinPrompt: false,
      },
    });
    renderOverview();
    expect(section()).toHaveTextContent('You organize this one');
  });
});
