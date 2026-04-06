/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getRouteResultData,
  getRouteResultStatus,
  toActionArgs,
  toLoaderArgs,
} from '#tests/route-module-test-utils.ts';

const requireUserId = vi.fn();
const findUnique = vi.fn();
const createPool = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

vi.mock('#app/utils/db.server.ts', () => ({
  prisma: {
    user: {
      findUnique: (...args: Array<unknown>) => findUnique(...args),
    },
  },
}));

vi.mock('#app/utils/pool.server.ts', () => ({
  createPool: (...args: Array<unknown>) => createPool(...args),
}));

import NewPoolPage, { action, loader } from './new.tsx';

function createFormRequest(form: Record<string, string>) {
  return new Request('https://giftpool.app/pools/new', {
    body: new URLSearchParams(form).toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
}

describe('app/routes/pools+/new.tsx', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('viewer-1');
    findUnique.mockReset();
    createPool.mockReset().mockResolvedValue({ id: 'pool-1' });
  });

  it('requires an authenticated user in the loader', async () => {
    await expect(
      loader(
        toLoaderArgs({
          context: {} as never,
          params: {},
          request: new Request('https://giftpool.app/pools/new'),
        }),
      ),
    ).resolves.toEqual({});

    expect(requireUserId).toHaveBeenCalledWith(expect.any(Request));
  });

  it('returns a validation payload for invalid form data', async () => {
    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          decisionMode: 'ORGANIZER_PICKS',
          occasionType: 'BIRTHDAY',
          title: '',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      status: 'error',
    });
  });

  it('returns a recipient username error when the user does not exist', async () => {
    findUnique.mockResolvedValue(null);

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          decisionMode: 'VOTE',
          occasionType: 'BIRTHDAY',
          recipientUsername: 'missing-user',
          title: 'Alex Birthday Pool',
        }),
      }),
    );

    expect(getRouteResultStatus(result)).toBe(400);
    await expect(getRouteResultData(result)).resolves.toMatchObject({
      error: {
        recipientUsername: ['No user found with that username.'],
      },
    });
  });

  it('creates a pool and redirects to the new pool page', async () => {
    findUnique.mockResolvedValue({ id: 'recipient-1' });

    const result = await action(
      toActionArgs({
        context: {} as never,
        params: {},
        request: createFormRequest({
          decisionMode: 'VOTE',
          eventDate: '2026-06-14',
          occasionType: 'BIRTHDAY',
          recipientName: 'Alex',
          recipientUsername: 'alex',
          title: 'Alex Birthday Pool',
        }),
      }),
    );

    expect(createPool).toHaveBeenCalledWith({
      decisionMode: 'VOTE',
      eventDate: new Date('2026-06-14'),
      occasionType: 'BIRTHDAY',
      organizerId: 'viewer-1',
      recipientName: 'Alex',
      recipientUserId: 'recipient-1',
      title: 'Alex Birthday Pool',
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/pools/pool-1');
  });

  it('renders the pool creation form', async () => {
    const App = createRoutesStub([
      {
        path: '/pools/new',
        loader: async () => ({}),
        HydrateFallback: () => null,
        Component: NewPoolPage,
      },
    ]);

    render(<App initialEntries={['/pools/new']} />);

    expect(await screen.findByLabelText('Pool title')).toBeInTheDocument();
    expect(screen.getByLabelText('Occasion')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Gift Pool username/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Pool' })).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Organizer chooses/i }),
    ).toBeChecked();
  });
});
