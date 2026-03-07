/**
 * @vitest-environment jsdom
 */

import { createRoutesStub } from 'react-router';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { FriendSummary } from './friend-summary.tsx';

vi.mock('../ui/avatar.tsx', () => ({
  Avatar: ({ user }: { user: { username: string } }) => (
    <div data-testid="avatar" aria-hidden="true">
      avatar-{user.username}
    </div>
  ),
}));

describe('<FriendSummary />', () => {
  const user = {
    id: 'user-1',
    username: 'taylor',
    name: 'Taylor Swift',
    image: { id: 'img-1', altText: 'Taylor' },
  };

  test('links the profile summary to the wishlist', () => {
    const App = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <FriendSummary
            user={user}
            displayName={user.name!}
            mutualGroups={[
              { id: '1', name: 'Swifties' },
              { id: '2', name: 'Music Club' },
            ]}
            extraGroupCount={2}
          />
        ),
      },
    ]);

    render(<App />);

    const button = screen.getByRole('button', { name: /taylor swift/i });
    expect(button).toHaveAttribute('type', 'button');
    expect(screen.getByText('@taylor')).toBeInTheDocument();
    expect(screen.getByText('Swifties')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });
});
