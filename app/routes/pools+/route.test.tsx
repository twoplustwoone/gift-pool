/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { createRoutesStub } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireUserId = vi.fn();

vi.mock('#app/utils/auth.server.ts', () => ({
  requireUserId: (...args: Array<unknown>) => requireUserId(...args),
}));

import PoolsRoute, { loader } from './route.tsx';

describe('app/routes/pools+/route.tsx', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
  });

  it('requires an authenticated user in the loader', async () => {
    await expect(
      loader({
        context: {},
        params: {},
        request: new Request('https://giftpool.app/pools'),
      } as never),
    ).resolves.toEqual({});

    expect(requireUserId).toHaveBeenCalledWith(expect.any(Request));
  });

  it('renders child routes inside the shell', () => {
    const App = createRoutesStub([
      {
        path: '/pools',
        Component: PoolsRoute,
        children: [
          {
            index: true,
            Component: () => <div>Pool list content</div>,
          },
        ],
      },
    ]);

    render(<App initialEntries={['/pools']} />);

    expect(screen.getByText('Pool list content')).toBeInTheDocument();
  });
});
