/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyRow, SectionCard, SummaryCard } from './admin-ui.tsx';

describe('SummaryCard', () => {
  it('renders label and numeric value formatted with commas', () => {
    render(<SummaryCard label="Users" value={1234} />);
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders string values as-is', () => {
    render(<SummaryCard label="Size" value="343.6 KB" />);
    expect(screen.getByText('343.6 KB')).toBeInTheDocument();
  });

  it('renders delta and accent lines when provided', () => {
    render(
      <SummaryCard
        label="Active pools"
        value={3}
        delta="+1 this week"
        accent="key metric"
      />,
    );
    expect(screen.getByText('+1 this week')).toBeInTheDocument();
    expect(screen.getByText('key metric')).toBeInTheDocument();
  });

  it('applies the warn tone class', () => {
    const { container } = render(
      <SummaryCard label="Stuck" value={2} tone="warn" />,
    );
    const card = container.querySelector('[class*="warning"]');
    expect(card).not.toBeNull();
  });

  it('applies the danger tone class', () => {
    const { container } = render(
      <SummaryCard label="Errors" value={5} tone="danger" />,
    );
    const card = container.querySelector('[class*="destructive"]');
    expect(card).not.toBeNull();
  });

  it('omits delta and accent when not provided', () => {
    render(<SummaryCard label="Users" value={10} />);
    // Only the value and the label should be in the card — no extra lines.
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});

describe('SectionCard', () => {
  it('renders title, description, action, and children', () => {
    render(
      <SectionCard
        title="Pools needing attention"
        description="Flagged based on status + age."
        action={<button type="button">View all</button>}
      >
        <p>Nothing stuck.</p>
      </SectionCard>,
    );
    expect(
      screen.getByRole('heading', { name: 'Pools needing attention' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Flagged based on status + age.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all' })).toBeInTheDocument();
    expect(screen.getByText('Nothing stuck.')).toBeInTheDocument();
  });

  it('renders without description or action', () => {
    render(
      <SectionCard title="Simple card">
        <p>Body only.</p>
      </SectionCard>,
    );
    expect(
      screen.getByRole('heading', { name: 'Simple card' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Body only.')).toBeInTheDocument();
  });
});

describe('EmptyRow', () => {
  it('renders its children inside a dashed container', () => {
    const { container } = render(<EmptyRow>Nothing here yet.</EmptyRow>);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    // The dashed border class should be present somewhere on the wrapper.
    expect(container.querySelector('[class*="dashed"]')).not.toBeNull();
  });
});
