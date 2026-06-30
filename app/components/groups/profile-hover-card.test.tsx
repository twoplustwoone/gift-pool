/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children?: React.ReactNode;
    }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

// Force the non-hover (touch) branch so the cluster renders plain avatar
// links we can count deterministically.
vi.mock('#app/hooks/use-has-hover.ts', () => ({ useHasHover: () => false }));

import { GroupAvatarCluster } from './group-avatar-cluster.tsx';
import { ProfilePreviewCard } from './profile-preview-card.tsx';

const member = (id: string, name: string, role = 'MEMBER') => ({
  user: {
    id,
    username: name.toLowerCase(),
    name,
    birthday: new Date('1992-07-04'),
    image: null,
  },
  role,
});

describe('<ProfilePreviewCard />', () => {
  it('reads "View profile" for another member', () => {
    render(
      <ProfilePreviewCard member={member('marco', 'Marco')} isYou={false} />,
    );
    expect(screen.getByText('Marco')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view profile/i });
    expect(link).toHaveAttribute('href', '/users/marco');
    expect(screen.queryByText('you')).not.toBeInTheDocument();
  });

  it('reads "Your profile" for your own avatar', () => {
    render(<ProfilePreviewCard member={member('you', 'Ada')} isYou={true} />);
    expect(
      screen.getByRole('link', { name: /your profile/i }),
    ).toHaveAttribute('href', '/users/ada');
    expect(screen.getByText('you')).toBeInTheDocument();
  });
});

describe('<GroupAvatarCluster />', () => {
  it('shows at most 5 avatars and a +N overflow chip', () => {
    const members = [
      member('a', 'Ada', 'OWNER'),
      member('b', 'Bo'),
      member('c', 'Cy'),
      member('d', 'Di'),
      member('e', 'Ed'),
      member('f', 'Fi'),
      member('g', 'Gus'),
    ];
    render(<GroupAvatarCluster members={members} viewerId="a" />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('omits the chip when 5 or fewer members', () => {
    const members = [member('a', 'Ada'), member('b', 'Bo')];
    render(<GroupAvatarCluster members={members} viewerId="a" />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });
});
