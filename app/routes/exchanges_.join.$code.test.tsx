/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRouteResultData,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const getUserId = vi.fn();
const getExchangeInvite = vi.fn();
const joinExchangeByCode = vi.fn();
const queueLogEvent = vi.fn();
const redirectWithToast = vi.fn();

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
  };
});

vi.mock('#app/utils/auth.server.ts', () => ({
  getUserId: (...args: Array<unknown>) => getUserId(...args),
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));
vi.mock('#app/utils/exchanges.server.ts', () => ({
  getExchangeInvite: (...args: Array<unknown>) => getExchangeInvite(...args),
  joinExchangeByCode: (...args: Array<unknown>) => joinExchangeByCode(...args),
}));
vi.mock('#app/utils/analytics.server.ts', () => ({
  queueLogEvent: (...args: Array<unknown>) => queueLogEvent(...args),
}));
vi.mock('#app/utils/request-context.server.ts', () => ({
  getRequestContext: () =>
    Promise.resolve({ requestId: 'r1', visitorId: 'v1', sessionId: null }),
}));
vi.mock('#app/utils/toast.server.ts', () => ({
  redirectWithToast: (...args: Array<unknown>) => redirectWithToast(...args),
}));

import JoinExchangePage, { action, loader } from './exchanges_.join.$code.tsx';

const context = {} as never;

const invite = {
  exchangeId: 'x1',
  title: 'Studio Christmas',
  occasionType: 'HOLIDAY' as const,
  eventDate: new Date('2026-12-24T00:00:00Z'),
  organizer: {
    id: 'fd',
    username: 'fd',
    name: 'Francisco Di Giandomenico',
    image: null,
  },
  participantCount: 3,
};

const request = (method = 'GET') =>
  new Request('https://giftpool.app/exchanges/join/abc123', { method });

beforeEach(() => {
  vi.clearAllMocks();
  getUserId.mockResolvedValue(null);
  getExchangeInvite.mockResolvedValue(invite);
});

describe('exchange invite landing', () => {
  it('shows the invitation to someone with no account yet', async () => {
    const result = await loader(
      toLoaderArgs({ context, params: { code: 'abc123' }, request: request() }),
    );
    const dataResult = await getRouteResultData<{
      kind: string;
      title: string;
      isAuthenticated: boolean;
    }>(result);
    expect(dataResult.kind).toBe('ok');
    expect(dataResult.isAuthenticated).toBe(false);
    // requireUserId is never called on the way in — the whole point of the
    // break-out route is that a stranger sees the invitation first.
    expect(requireUserId).not.toHaveBeenCalled();
  });

  it('counts the landing before any gate, valid or not', async () => {
    await loader(
      toLoaderArgs({ context, params: { code: 'abc123' }, request: request() }),
    );
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'invite_landed',
        properties: expect.objectContaining({
          inviteType: 'exchange',
          valid: true,
        }),
      }),
    );

    queueLogEvent.mockClear();
    getExchangeInvite.mockResolvedValue(null);
    const dead = await loader(
      toLoaderArgs({ context, params: { code: 'gone' }, request: request() }),
    );
    expect(await getRouteResultData<{ kind: string }>(dead)).toEqual({
      kind: 'invalid',
    });
    // A dead landing is the drop-off worth measuring, so it counts too.
    expect(queueLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          inviteType: 'exchange',
          valid: false,
        }),
      }),
    );
  });

  it('requires an account to actually join', async () => {
    requireUserId.mockResolvedValue('np');
    joinExchangeByCode.mockResolvedValue({
      status: 'JOINED',
      exchangeId: 'x1',
    });
    await action(
      toActionArgs({
        context,
        params: { code: 'abc123' },
        request: request('POST'),
      }),
    );
    expect(requireUserId).toHaveBeenCalled();
    expect(joinExchangeByCode).toHaveBeenCalledWith({
      code: 'abc123',
      userId: 'np',
    });
    expect(redirectWithToast).toHaveBeenCalledWith(
      '/exchanges/x1',
      expect.objectContaining({ title: "You're in" }),
    );
  });

  it('falls back to the dead-link state if the link died mid-flight', async () => {
    // Names drawn, or the organizer replaced the link, between the page
    // loading and this POST.
    requireUserId.mockResolvedValue('np');
    joinExchangeByCode.mockResolvedValue({ status: 'INVALID' });
    const result = await action(
      toActionArgs({
        context,
        params: { code: 'abc123' },
        request: request('POST'),
      }),
    );
    expect(await getRouteResultData<{ kind: string }>(result)).toEqual({
      kind: 'invalid',
    });
    expect(redirectWithToast).not.toHaveBeenCalled();
  });

  it('renders the invitation, and one dead state for every dead cause', async () => {
    const Stub = createRoutesStub([
      {
        path: '/exchanges/join/:code',
        HydrateFallback: () => null,
        Component: JoinExchangePage,
        loader: async () => ({
          kind: 'ok',
          title: 'Studio Christmas',
          occasionLabel: 'Holiday',
          eventLabel: '24 Dec',
          organizerName: 'Francisco Di Giandomenico',
          participantCount: 3,
          isAuthenticated: false,
        }),
      },
    ]);
    render(<Stub initialEntries={['/exchanges/join/abc123']} />);
    expect(
      await screen.findByText("You're invited to a gift exchange 🎁"),
    ).toBeInTheDocument();
    expect(screen.getByText('Studio Christmas')).toBeInTheDocument();
    expect(
      screen.getByText(/organized by Francisco Di Giandomenico/),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 people are in so far/)).toBeInTheDocument();
  });

  it('says nothing about why a dead link is dead', async () => {
    const Stub = createRoutesStub([
      {
        path: '/exchanges/join/:code',
        HydrateFallback: () => null,
        Component: JoinExchangePage,
        loader: async () => ({ kind: 'invalid' }),
      },
    ]);
    render(<Stub initialEntries={['/exchanges/join/gone']} />);
    // Expired, revoked, already drawn and never-existed all land here. The
    // copy lists the possibilities instead of picking one — naming the real
    // cause would confirm the exchange exists.
    const dead = await screen.findByText(
      /may have expired, been replaced, or the names may already have been drawn/i,
    );
    expect(dead).toBeInTheDocument();
    // Nothing on the page states which of them it actually was.
    expect(document.body.textContent).not.toMatch(
      /(was|has been) (drawn|revoked|replaced)/i,
    );
  });
});
