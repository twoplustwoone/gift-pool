/** @vitest-environment jsdom */
/**
 * Form-emission regression net for the person surface — the direct guard for
 * the "button rendered but did nothing" class of bug. Each action's form must
 * actually SUBMIT its intent and required fields.
 *
 * We render the real (exported) PersonSurface and mock react-router's `Form`
 * (and `useFetcher().Form`) to a plain <form> that captures the submitted
 * FormData on submit — no network, no data router. A form whose button emits
 * the wrong intent, or drops a required field, fails here. ResponsiveDialog is
 * mocked to pass-through elements so dialog-wrapped forms render inline.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_CLAIM_DISCLOSURE } from '#app/utils/wishlist-claim-disclosure.ts';
import {
  PersonSurface,
  type PersonSurfaceViewData,
} from './person-surface.tsx';

// Shared capture slot — the mocked <form> writes the submitted FormData here.
const captured = vi.hoisted(() => ({
  formData: undefined as FormData | undefined,
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  const react = await import('react');
  const Form = ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
    method?: string;
  }) =>
    react.createElement(
      'form',
      {
        className,
        onSubmit: (e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          captured.formData = new FormData(e.currentTarget);
        },
      },
      children,
    );
  return {
    ...actual,
    Form,
    useFetcher: () => ({
      Form,
      submit: () => {},
      state: 'idle' as const,
      data: undefined,
    }),
  };
});

vi.mock('#app/components/ui/responsive-dialog.tsx', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  );
  return {
    ResponsiveDialog: Pass,
    ResponsiveDialogContent: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
    ResponsiveDialogHeader: Pass,
    ResponsiveDialogFooter: Pass,
    ResponsiveDialogTitle: ({ children }: { children?: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    ResponsiveDialogDescription: ({
      children,
    }: {
      children?: React.ReactNode;
    }) => <p>{children}</p>,
    ResponsiveDialogTrigger: Pass,
    ResponsiveDialogClose: Pass,
  };
});

const emptyIdeation: PersonSurfaceViewData['ideation'] = {
  giftHistory: [],
  proposedUnused: [],
  notes: [],
  savedIdeas: [],
};

function baseData(
  overrides: Partial<PersonSurfaceViewData> = {},
): PersonSurfaceViewData {
  return {
    user: {
      id: 'target-1',
      username: 'casey',
      name: 'Casey Jones',
      bio: null,
      birthday: null,
      image: null,
    },
    userJoinedDisplay: 'Jan 2024',
    relationship: {
      state: 'FRIENDS',
      friendshipId: 'f1',
      incomingRequestId: null,
      outgoingRequestId: null,
    },
    isFriend: true,
    birthdayVisible: true,
    canViewWishlist: true,
    mutualGroups: [],
    mutualFriends: [],
    // occasion-near renders the ActionRow (Save idea / Just me / Not this time)
    // and the OccasionHeader (no FriendActionButton to stub out).
    temporalState: 'occasion-near',
    occasion: { label: 'Tomorrow', daysUntil: 1 },
    declined: false,
    organizeGroups: [],
    budgetLine: null,
    wishlistSource: [],
    ideation: emptyIdeation,
    openPools: [],
    continuePool: null,
    postOccasion: null,
    ...overrides,
  };
}

function renderSurface(data: PersonSurfaceViewData) {
  render(
    <MemoryRouter initialEntries={['/users/casey']}>
      <PersonSurface {...data} />
    </MemoryRouter>,
  );
}

function submitButton(name: RegExp | string) {
  const submit = screen
    .getAllByRole('button', { name })
    .find((b) => (b as HTMLButtonElement).type === 'submit');
  if (!submit) throw new Error(`No submit button matching ${name}`);
  return submit;
}

describe('PersonSurface form emission', () => {
  beforeEach(() => {
    captured.formData = undefined;
  });

  it('propose from a saved idea emits propose-to-pool with giftListItemId', async () => {
    const user = userEvent.setup();
    renderSurface(
      baseData({
        ideation: {
          ...emptyIdeation,
          savedIdeas: [
            {
              id: 'gli1',
              name: 'Ceramics class',
              url: null,
              priceCents: null,
              currency: null,
            },
          ],
        },
        openPools: [{ id: 'p1', title: 'Pool' }],
      }),
    );

    await user.click(screen.getByRole('button', { name: /propose to pool/i }));

    const fd = captured.formData!;
    expect(fd).toBeDefined();
    expect(fd.get('intent')).toBe('propose-to-pool');
    expect(fd.get('poolId')).toBe('p1');
    expect(fd.get('name')).toBe('Ceramics class');
    expect(fd.get('giftListItemId')).toBe('gli1');
    expect(fd.get('wishlistItemId')).toBeNull();
  });

  it('propose from a wishlist item emits propose-to-pool with wishlistItemId', async () => {
    const user = userEvent.setup();
    renderSurface(
      baseData({
        wishlistSource: [
          {
            id: 'w1',
            title: 'Immersion blender',
            url: null,
            priceCents: null,
            currency: null,
            claimed: false,
            claimedByViewer: false,
            claimDisclosure: HIDDEN_CLAIM_DISCLOSURE,
          },
        ],
        openPools: [{ id: 'p1', title: 'Pool' }],
      }),
    );

    await user.click(screen.getByRole('button', { name: /propose to pool/i }));

    const fd = captured.formData!;
    expect(fd).toBeDefined();
    expect(fd.get('intent')).toBe('propose-to-pool');
    expect(fd.get('poolId')).toBe('p1');
    expect(fd.get('name')).toBe('Immersion blender');
    expect(fd.get('wishlistItemId')).toBe('w1');
    expect(fd.get('giftListItemId')).toBeNull();
  });

  it('save-idea emits its intent and name', async () => {
    const user = userEvent.setup();
    // A note gives the surface memory, suppressing DayOneCapture — otherwise it
    // renders a second SaveIdeaDialog and the "Idea" control is ambiguous.
    renderSurface(
      baseData({
        ideation: {
          ...emptyIdeation,
          notes: [{ id: 'n1', body: 'Likes tea' }],
        },
      }),
    );

    await user.type(screen.getByLabelText('Idea'), 'Handmade journal');
    await user.click(submitButton('Save idea'));

    const fd = captured.formData!;
    expect(fd).toBeDefined();
    expect(fd.get('intent')).toBe('save-idea');
    expect(fd.get('name')).toBe('Handmade journal');
  });

  it('decline-occasion emits its intent', async () => {
    const user = userEvent.setup();
    renderSurface(baseData());

    await user.click(screen.getByRole('button', { name: 'Not this time' }));

    expect(captured.formData).toBeDefined();
    expect(captured.formData!.get('intent')).toBe('decline-occasion');
  });

  it('solo-commit emits its intent and required name', async () => {
    const user = userEvent.setup();
    renderSurface(baseData());

    await user.type(
      screen.getByLabelText('What are you getting them?'),
      'Handmade mug',
    );
    await user.click(submitButton("I've got this"));

    const fd = captured.formData!;
    expect(fd).toBeDefined();
    expect(fd.get('intent')).toBe('solo-commit');
    expect(fd.get('name')).toBe('Handmade mug');
  });
});

describe('PersonSurface pool continuation (§6.3)', () => {
  it('replaces Organize with Continue planning when an active pool exists', () => {
    renderSurface(
      baseData({
        continuePool: {
          id: 'p1',
          title: "Casey's 30th",
          status: 'VOTING',
          contributorCount: 3,
        },
      }),
    );

    expect(
      screen.getByRole('link', { name: /continue planning/i }),
    ).toHaveAttribute('href', '/pools/p1');
    expect(screen.getByText('3 friends in')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /organize/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps the Organize path when no active pool exists', () => {
    renderSurface(baseData());

    expect(
      screen.getByRole('button', { name: /organize a gift/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('continue-planning')).not.toBeInTheDocument();
  });
});

describe('PersonSurface wishlist claim attribution', () => {
  it('renders the tiered ClaimDescriptor text in place of the old generic "Spoken for" badge', () => {
    renderSurface(
      baseData({
        wishlistSource: [
          {
            id: 'w1',
            title: 'Espresso machine',
            url: null,
            priceCents: null,
            currency: null,
            claimed: true,
            claimedByViewer: false,
            claimDisclosure: {
              show: true,
              tone: 'pool',
              text: 'Kitchen Crew is getting this',
              name: 'Kitchen Crew',
              poolLink: '/pools/p1',
              canJoinPool: true,
            },
          },
        ],
      }),
    );

    expect(
      screen.getByText('Kitchen Crew is getting this'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Spoken for')).not.toBeInTheDocument();
    expect(
      screen.queryByText("Someone's already covering this one."),
    ).not.toBeInTheDocument();
    // No claim/unclaim form for an item someone else already has.
    expect(
      screen.queryByRole('button', { name: /getting this/i }),
    ).not.toBeInTheDocument();
  });

  it('renders zero-attribution text when the viewer has no relationship to the holding pool', () => {
    renderSurface(
      baseData({
        wishlistSource: [
          {
            id: 'w1',
            title: 'Espresso machine',
            url: null,
            priceCents: null,
            currency: null,
            claimed: true,
            claimedByViewer: false,
            claimDisclosure: {
              show: true,
              tone: 'warning',
              text: 'Already claimed',
              name: null,
              poolLink: null,
              canJoinPool: false,
            },
          },
        ],
      }),
    );

    expect(screen.getByText('Already claimed')).toBeInTheDocument();
    expect(screen.queryByText('Spoken for')).not.toBeInTheDocument();
  });
});
