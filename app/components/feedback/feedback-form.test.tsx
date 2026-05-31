/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the router hooks the form depends on so we can render it directly and
// drive the fetcher's resolved state deterministically — no router context or
// real network submission (which jsdom's fetch can't encode) required.
const rootData: { user: unknown } = { user: null };
const fetcherMock: { state: string; data: unknown; Form: React.ElementType } = {
  state: 'idle',
  data: undefined,
  Form: ({ children, ...props }: React.ComponentProps<'form'>) => (
    <form {...props}>{children}</form>
  ),
};

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    useFetcher: () => fetcherMock,
    useLocation: () => ({
      pathname: '/groups',
      search: '',
      hash: '',
      state: null,
      key: 'test',
    }),
    useRouteLoaderData: () => rootData,
  };
});

import { FeedbackForm } from './feedback-form.tsx';

beforeEach(() => {
  rootData.user = null;
  fetcherMock.state = 'idle';
  fetcherMock.data = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FeedbackForm', () => {
  it('renders the type options, message field, and submit button', () => {
    render(<FeedbackForm />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Idea')).toBeInTheDocument();
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send feedback/i }),
    ).toBeInTheDocument();
  });

  it('shows the email field for anonymous visitors', () => {
    rootData.user = null;
    render(<FeedbackForm />);
    // The label carries a required-asterisk, so match loosely.
    expect(screen.getByLabelText(/your email/i)).toBeInTheDocument();
  });

  it('hides the email field for logged-in users', () => {
    rootData.user = { id: 'u1', username: 'tester', name: 'Tester', roles: [] };
    render(<FeedbackForm />);
    expect(screen.queryByLabelText(/your email/i)).not.toBeInTheDocument();
  });

  it('renders the success state and fires onSuccess once submitted', () => {
    const onSuccess = vi.fn();
    fetcherMock.state = 'idle';
    fetcherMock.data = { ok: true };

    render(<FeedbackForm onSuccess={onSuccess} />);

    expect(screen.getByText(/thanks for the feedback/i)).toBeInTheDocument();
    // The form fields are replaced by the confirmation state.
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
  });
});
