/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from './site-footer.tsx';

describe('SiteFooter', () => {
  it('renders legal and support links with correct hrefs', () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '/about',
    );
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute(
      'href',
      '/support',
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/tos',
    );
    expect(
      screen.getByRole('link', { name: /buy me a coffee/i }),
    ).toHaveAttribute('href', 'https://buymeacoffee.com/twoplustwoone');
  });
});
