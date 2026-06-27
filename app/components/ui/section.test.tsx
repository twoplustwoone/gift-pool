/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Section } from './section.tsx';

describe('Section', () => {
  it('renders title, description, action, and children', () => {
    render(
      <Section
        title="Your preferences"
        description="How GiftPool reaches out."
        action={<button type="button">Edit</button>}
      >
        <p>Body content.</p>
      </Section>,
    );
    expect(
      screen.getByRole('heading', { name: 'Your preferences' }),
    ).toBeInTheDocument();
    expect(screen.getByText('How GiftPool reaches out.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('Body content.')).toBeInTheDocument();
  });

  it('renders children with no header when title/description/action are omitted', () => {
    const { container } = render(
      <Section>
        <p>Body only.</p>
      </Section>,
    );
    expect(screen.getByText('Body only.')).toBeInTheDocument();
    // No heading element should be rendered when there is no title.
    expect(container.querySelector('h2')).toBeNull();
  });

  it('honors a custom heading element and wires titleId for aria-labelledby', () => {
    render(
      <Section as="h3" titleId="prefs-title" title="Privacy">
        <p>Body.</p>
      </Section>,
    );
    const heading = screen.getByRole('heading', { name: 'Privacy', level: 3 });
    expect(heading).toHaveAttribute('id', 'prefs-title');
  });
});
