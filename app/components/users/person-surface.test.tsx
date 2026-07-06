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
import {
  PersonSurface,
  type PersonSurfaceViewData,
} from './person-surface.tsx';

// Shared capture slot — the mocked <form> writes the submitted FormData here.
const captured = vi.hoisted(() => ({ formData: undefined as FormData | undefined }));

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
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
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
        ideation: { ...emptyIdeation, notes: [{ id: 'n1', body: 'Likes tea' }] },
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
