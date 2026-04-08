/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#app/components/ui/skeleton.tsx', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="friend-skeleton-row" data-class-name={className} />
  ),
}));

import { FriendsRouteSkeleton } from './friends-route-skeleton.tsx';

describe('FriendsRouteSkeleton', () => {
  it('renders an accessible loading status with placeholder rows', () => {
    render(<FriendsRouteSkeleton />);

    expect(
      screen.getByRole('status', { name: /loading friends/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('friend-skeleton-row')).toHaveLength(5);
  });
});
