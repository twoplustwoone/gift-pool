/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SupportRoute from './support.tsx';

describe('SupportRoute', () => {
  it('renders contact channels and the FAQ', () => {
    render(<SupportRoute />);

    expect(
      screen.getByRole('heading', { level: 1, name: /support/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /email us/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /report a bug/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /suggest a feature/i }),
    ).toBeInTheDocument();

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
