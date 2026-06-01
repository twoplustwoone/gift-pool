/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// The route module imports server-only helpers at the top level. Stub them so
// importing the component doesn't pull in Prisma; the render tests drive the
// component through createRoutesStub's loader, not the module loader.
vi.mock('#app/utils/admin.server.ts', () => ({
  listAdminFeedback: vi.fn(),
  getFeedbackStatusCounts: vi.fn(),
  updateFeedbackStatus: vi.fn(),
}));
vi.mock('#app/utils/permissions.server.ts', () => ({
  requireUserWithRole: vi.fn(),
}));

import FeedbackRoute from './feedback.tsx';

type Item = {
  id: string;
  type: string;
  message: string;
  email: string | null;
  user: { id: string; username: string } | null;
  pageUrl: string | null;
  createdAt: Date;
  status: string;
  adminNotes: string | null;
};

const baseCounts = {
  all: 0,
  NEW: 0,
  IN_PROGRESS: 0,
  RESOLVED: 0,
  WONT_FIX: 0,
};

function renderRoute(
  loaderData: Partial<{
    items: Array<Item>;
    total: number;
    counts: typeof baseCounts;
    statusParam: string;
    page: number;
    pageSize: number;
  }>,
) {
  const data = {
    items: [],
    total: 0,
    counts: baseCounts,
    statusParam: 'NEW',
    page: 1,
    pageSize: 25,
    ...loaderData,
  };
  const Stub = createRoutesStub([
    { path: '/admin/feedback', Component: FeedbackRoute, loader: () => data },
  ]);
  render(<Stub initialEntries={['/admin/feedback']} />);
}

const userItem: Item = {
  id: 'f1',
  type: 'BUG',
  message: 'Vote button is dead on mobile.',
  email: 'tester@example.com',
  user: { id: 'u1', username: 'tester' },
  pageUrl: '/groups/123',
  createdAt: new Date(),
  status: 'NEW',
  adminNotes: null,
};

const anonItem: Item = {
  id: 'f2',
  type: 'FEATURE',
  message: 'Please add dark mode to the wishlist.',
  email: 'guest@example.com',
  user: null,
  pageUrl: null,
  createdAt: new Date(),
  status: 'NEW',
  adminNotes: null,
};

describe('admin FeedbackRoute', () => {
  it('renders feedback rows with type, author, and message', async () => {
    renderRoute({
      items: [userItem, anonItem],
      total: 2,
      counts: { ...baseCounts, all: 2, NEW: 2 },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Feedback' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Vote button is dead on mobile.')).toBeInTheDocument();
    expect(
      screen.getByText('Please add dark mode to the wishlist.'),
    ).toBeInTheDocument();

    // Logged-in submitter links to the user detail page; anonymous shows email.
    const userLink = screen.getByRole('link', { name: '@tester' });
    expect(userLink).toHaveAttribute('href', '/admin/users/u1');
    expect(screen.getByText('guest@example.com')).toBeInTheDocument();

    // Each row exposes a Save button and a status select.
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(2);
  });

  it('renders the empty state when there is no feedback', async () => {
    renderRoute({ items: [], total: 0 });
    expect(
      await screen.findByText('Nothing here. Inbox zero.'),
    ).toBeInTheDocument();
  });

  it('renders pagination controls when results span multiple pages', async () => {
    renderRoute({
      items: [userItem],
      total: 60,
      counts: { ...baseCounts, all: 60, NEW: 60 },
      page: 1,
      pageSize: 25,
    });
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /next/i })).toBeInTheDocument();
  });
});
