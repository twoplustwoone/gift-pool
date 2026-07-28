/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { createRoutesStub } from 'react-router';
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

const withPoolLink: ClaimDisclosure = {
  show: true,
  tone: 'pool',
  text: 'Your pool Dave’s 40th is getting this',
  name: 'Dave’s 40th',
  poolLink: '/pools/pool-1',
  canJoinPool: false,
};

const renderInRouter = (ui: ReactElement) => {
  const App = createRoutesStub([{ path: '/', Component: () => ui }]);
  return render(<App />);
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

  describe('variant="label" with a poolLink', () => {
    it('wraps the badge content in a Link pointing at exactly disclosure.poolLink', () => {
      renderInRouter(<ClaimDescriptor disclosure={withPoolLink} variant="label" />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', withPoolLink.poolLink);
      expect(link).toContainElement(screen.getByRole('status'));
      expect(link).toHaveTextContent(withPoolLink.text);
    });

    it('renders no link when poolLink is null', () => {
      renderInRouter(<ClaimDescriptor disclosure={base} variant="label" />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('non-navigable surfaces never render a Link, even with a poolLink', () => {
    it('variant="badge" renders the badge but no link', () => {
      renderInRouter(<ClaimDescriptor disclosure={withPoolLink} variant="badge" />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(withPoolLink.text);
    });

    it('variant="row" renders the badge but no link', () => {
      renderInRouter(<ClaimDescriptor disclosure={withPoolLink} variant="row" />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(withPoolLink.text);
    });
  });

  describe('variant="row"', () => {
    it('applies the tight single-line row classes', () => {
      render(<ClaimDescriptor disclosure={base} variant="row" />);
      const status = screen.getByRole('status');
      expect(status.className).toContain('px-2');
      expect(status.className).toContain('py-0');
      expect(status).not.toHaveTextContent(''); // sanity: still renders text
      expect(status).toHaveTextContent(base.text);
    });
  });

  describe('tone="none"', () => {
    it('renders nothing, matching show: false behaviour', () => {
      const { container } = render(
        <ClaimDescriptor disclosure={{ ...base, tone: 'none' }} variant="badge" />,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
});
