/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { LuGift, LuUsers } from 'react-icons/lu';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

function renderWithRouter(ui: React.ReactNode) {
  const App = createRoutesStub([{ path: '/', Component: () => <>{ui}</> }]);
  render(<App />);
}

describe('PageHeader — section variant', () => {
  it('renders the title', () => {
    renderWithRouter(
      <PageHeader variant="section" icon={<LuGift />} title="Pools" />,
    );
    expect(screen.getByText('Pools')).toBeInTheDocument();
  });

  it('renders children as the action slot', () => {
    renderWithRouter(
      <PageHeader variant="section" icon={<LuUsers />} title="Groups">
        <button type="button">Create Group</button>
      </PageHeader>,
    );
    expect(
      screen.getByRole('button', { name: 'Create Group' }),
    ).toBeInTheDocument();
  });

  it('renders without children', () => {
    renderWithRouter(
      <PageHeader variant="section" icon={<LuGift />} title="Pools" />,
    );
    expect(screen.getByText('Pools')).toBeInTheDocument();
  });

  it('applies max-w-6xl for standard contentWidth (default)', () => {
    renderWithRouter(
      <PageHeader variant="section" icon={<LuGift />} title="Pools" />,
    );
    const inner = document.querySelector('.max-w-6xl');
    expect(inner).toBeInTheDocument();
  });

  it('applies max-w-3xl for narrow contentWidth', () => {
    renderWithRouter(
      <PageHeader
        variant="section"
        contentWidth="narrow"
        icon={<LuGift />}
        title="Pools"
      />,
    );
    const inner = document.querySelector('.max-w-3xl');
    expect(inner).toBeInTheDocument();
  });
});

describe('PageHeader — detail variant', () => {
  it('renders the title', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        back={{ label: 'Pools', href: '/pools' }}
        icon={<LuGift />}
        title="Leo's Graduation"
      />,
    );
    expect(screen.getByText("Leo's Graduation")).toBeInTheDocument();
  });

  it('renders the subtitle when provided', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        back={{ label: 'Pools', href: '/pools' }}
        icon={<LuGift />}
        title="Leo's Graduation"
        subtitle="Graduation for Leo"
      />,
    );
    expect(screen.getByText('Graduation for Leo')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        back={{ label: 'Pools', href: '/pools' }}
        icon={<LuGift />}
        title="Leo's Graduation"
      />,
    );
    expect(screen.queryByText('Graduation for Leo')).not.toBeInTheDocument();
  });

  it('renders the back link with correct href and aria-label', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        back={{ label: 'Pools', href: '/pools' }}
        icon={<LuGift />}
        title="Leo's Graduation"
      />,
    );
    const backLink = screen.getByRole('link', { name: 'Back to Pools' });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/pools');
  });

  it('renders children as the badge slot', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        back={{ label: 'Pools', href: '/pools' }}
        icon={<LuGift />}
        title="Leo's Graduation"
      >
        <span data-testid="status-badge">Decided</span>
      </PageHeader>,
    );
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
    expect(screen.getByText('Decided')).toBeInTheDocument();
  });

  it('renders without children (no badge)', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        back={{ label: 'Home', href: '/' }}
        icon={<LuGift />}
        title="Admin"
        subtitle="Internal operator surface"
      />,
    );
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Internal operator surface')).toBeInTheDocument();
  });

  it('applies max-w-6xl for standard contentWidth (default)', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        back={{ label: 'Pools', href: '/pools' }}
        icon={<LuGift />}
        title="Leo's Graduation"
      />,
    );
    const inner = document.querySelector('.max-w-6xl');
    expect(inner).toBeInTheDocument();
  });

  it('applies max-w-3xl for narrow contentWidth', () => {
    renderWithRouter(
      <PageHeader
        variant="detail"
        contentWidth="narrow"
        back={{ label: 'Pools', href: '/pools' }}
        icon={<LuGift />}
        title="Leo's Graduation"
      />,
    );
    const inner = document.querySelector('.max-w-3xl');
    expect(inner).toBeInTheDocument();
  });
});
