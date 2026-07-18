/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router', () => ({
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
}));

vi.mock('./member-actions-menu.tsx', () => ({
  MemberActionsMenu: () => null,
}));

import { MembersList, type MemberListEntry } from './members-list.tsx';

const legacyMember: MemberListEntry = {
  user: {
    id: 'legacy',
    username: 'legacy',
    name: 'Legacy Birthday',
    birthday: '1990-05-01T00:00:00.000Z',
    image: null,
  },
  role: 'MEMBER',
};

const currentMember: MemberListEntry = {
  user: {
    id: 'current',
    username: 'current',
    name: 'Current Birthday',
    birthday: '1992-05-26T12:00:00.000Z',
    image: null,
  },
  role: 'MEMBER',
};

const members: Array<MemberListEntry> = [legacyMember, currentMember];

const renderMembers = (entries: Array<MemberListEntry> = members) => (
  <MembersList
    giftGroupId="group-1"
    viewerRole="MEMBER"
    viewerId="viewer-1"
    members={entries}
  />
);

describe('MembersList birthday hydration', () => {
  it('preserves missing and invalid birthday fallbacks', () => {
    render(
      renderMembers([
        {
          ...legacyMember,
          user: { ...legacyMember.user, birthday: null },
        },
        {
          ...currentMember,
          user: { ...currentMember.user, birthday: 'not-a-date' },
        },
      ]),
    );

    expect(screen.getAllByText('Birthday not set')).toHaveLength(2);
  });

  it('hydrates legacy and current birthday dates without shifting days', async () => {
    const originalTimeZone = process.env.TZ;
    const container = document.createElement('div');
    document.body.append(container);
    const recoverableErrors: Array<unknown> = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;

    try {
      process.env.TZ = 'UTC';
      container.innerHTML = renderToString(renderMembers());

      process.env.TZ = 'America/New_York';
      await act(async () => {
        root = hydrateRoot(container, renderMembers(), {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
        await Promise.resolve();
      });

      expect(container).toHaveTextContent('May 1');
      expect(container).toHaveTextContent('May 26');
      expect(container).not.toHaveTextContent('Apr 30');
      expect(container).not.toHaveTextContent('May 25');
      expect(recoverableErrors).toEqual([]);
    } finally {
      if (root) {
        await act(async () => root?.unmount());
      }
      container.remove();
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
  });
});
