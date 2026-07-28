/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type ClaimDisclosure } from '#app/utils/wishlist-claim-disclosure.ts';
import { ClaimDescriptor } from './claim-descriptor.tsx';

const base: ClaimDisclosure = {
  show: true,
  tone: 'warning',
  text: 'Already claimed',
  name: null,
  poolLink: null,
  canJoinPool: false,
};

describe('ClaimDescriptor', () => {
  it('renders nothing when the disclosure is hidden', () => {
    const { container } = render(
      <ClaimDescriptor disclosure={{ ...base, show: false }} variant="label" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('carries an icon and text, never colour alone', () => {
    render(<ClaimDescriptor disclosure={base} variant="badge" />);
    expect(screen.getByText('Already claimed')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAccessibleName(/already claimed/i);
  });

  it('uses warning tone styling for conflicts and pool tone for reassurance', () => {
    const { rerender } = render(<ClaimDescriptor disclosure={base} variant="badge" />);
    expect(screen.getByRole('status').className).toContain('warning');

    rerender(
      <ClaimDescriptor
        disclosure={{ ...base, tone: 'pool', text: 'Your pool Dave’s 40th is getting this' }}
        variant="label"
      />,
    );
    expect(screen.getByRole('status').className).toContain('pool');
  });
});
