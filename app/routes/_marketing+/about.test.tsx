/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import AboutRoute from './about.tsx';

describe('AboutRoute', () => {
  it('renders the page with values and a Buy Me a Coffee link', () => {
    render(
      <MemoryRouter>
        <AboutRoute />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /about giftpool/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('People first')).toBeInTheDocument();
    expect(screen.getByText('No fees, no ads')).toBeInTheDocument();
    expect(screen.getByText('Privacy by default')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /get in touch/i })).toHaveAttribute(
      'href',
      '/support',
    );
    expect(
      screen.getByRole('link', { name: /buy me a coffee/i }),
    ).toHaveAttribute('href', 'https://buymeacoffee.com/twoplustwoone');
  });
});
