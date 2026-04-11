/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ProfileHeader } from './profile-header.tsx';

vi.mock('#app/components/ui/avatar.tsx', () => ({
  Avatar: ({ user }: { user: { username: string } }) => (
    <div data-testid="avatar">{user.username}</div>
  ),
}));

const baseUser = {
  id: 'user-1',
  name: 'Taylor Swift',
  username: 'taylor',
  image: { id: 'image-1' },
};

function renderHeader(overrides: Partial<React.ComponentProps<typeof ProfileHeader>> = {}) {
  return render(
    <MemoryRouter>
      <ProfileHeader user={baseUser} {...overrides} />
    </MemoryRouter>,
  );
}

describe('<ProfileHeader />', () => {
  it('renders the display name, username handle, and avatar', () => {
    renderHeader();
    expect(
      screen.getByRole('heading', { name: 'Taylor Swift' }),
    ).toBeInTheDocument();
    expect(screen.getByText('@taylor')).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toHaveTextContent('taylor');
  });

  it('falls back to the username when no display name is set', () => {
    renderHeader({
      user: { ...baseUser, name: null },
    });
    expect(
      screen.getByRole('heading', { name: 'taylor' }),
    ).toBeInTheDocument();
  });

  it('shows the birthday pill when a label is provided', () => {
    renderHeader({ birthdayLabel: 'Jun 3' });
    expect(screen.getByLabelText('Birthday Jun 3')).toBeInTheDocument();
  });

  it('hides the birthday pill when no label is provided', () => {
    renderHeader();
    expect(screen.queryByLabelText(/^Birthday /)).not.toBeInTheDocument();
  });

  it('renders joined display when provided', () => {
    renderHeader({ joinedDisplay: '4/10/2026' });
    expect(screen.getByText('Joined 4/10/2026')).toBeInTheDocument();
  });

  it('renders actions slot content', () => {
    renderHeader({
      actions: <button>Custom action</button>,
    });
    expect(
      screen.getByRole('button', { name: 'Custom action' }),
    ).toBeInTheDocument();
  });
});
