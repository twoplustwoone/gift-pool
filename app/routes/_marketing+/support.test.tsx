/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The form requires a data router + root loader data; render a placeholder
// here and assert on it. The form itself is covered by `api.feedback.test.ts`
// and the `feedback` e2e test.
vi.mock('#app/components/feedback/feedback-form.tsx', () => ({
  FeedbackForm: () => <div data-testid="feedback-form" />,
}));

import SupportRoute from './support.tsx';

describe('SupportRoute', () => {
  it('renders the feedback form, an email fallback link, and the FAQ', () => {
    render(<SupportRoute />);

    expect(
      screen.getByRole('heading', { level: 1, name: /support/i }),
    ).toBeInTheDocument();

    expect(screen.getByTestId('feedback-form')).toBeInTheDocument();

    const emailLink = screen.getByRole('link', {
      name: 'support@giftpool.app',
    });
    expect(emailLink).toHaveAttribute('href', 'mailto:support@giftpool.app');

    expect(
      screen.getByText(/frequently asked questions/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/is giftpool free\?/i)).toBeInTheDocument();
    expect(
      screen.getByText(/can i delete my account\?/i),
    ).toBeInTheDocument();
  });
});
