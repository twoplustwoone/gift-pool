/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { MutualStrip } from './mutual-strip.tsx';

function renderStrip(props: React.ComponentProps<typeof MutualStrip>) {
  return render(
    <MemoryRouter>
      <MutualStrip {...props} />
    </MemoryRouter>,
  );
}

describe('<MutualStrip />', () => {
  it('renders nothing when both lists are empty', () => {
    const { container } = renderStrip({ groups: [], friends: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders only mutual groups when friends are empty', () => {
    renderStrip({
      groups: [{ id: 'g1', name: 'Book Club' }],
      friends: [],
    });
    expect(screen.getByText('Mutual groups')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Book Club/ })).toHaveAttribute(
      'href',
      '/groups/g1',
    );
    expect(screen.queryByText('Mutual friends')).not.toBeInTheDocument();
  });

  it('renders only mutual friends when groups are empty', () => {
    renderStrip({
      groups: [],
      friends: [
        { id: 'u1', username: 'np', name: 'NP', image: null },
        {
          id: 'u2',
          username: 'sofia',
          name: 'Sofía Vargas',
          image: { id: 'img-1' },
        },
      ],
    });
    expect(screen.getByText('Mutual friends')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NP/ })).toHaveAttribute(
      'href',
      '/users/np',
    );
    expect(
      screen.getByRole('link', { name: /Sofía Vargas/ }),
    ).toHaveAttribute('href', '/users/sofia');
    expect(screen.queryByText('Mutual groups')).not.toBeInTheDocument();
  });

  it('caps visible entries at maxVisible and shows an overflow chip', () => {
    renderStrip({
      groups: Array.from({ length: 7 }, (_, i) => ({
        id: `g${i}`,
        name: `Group ${i}`,
      })),
      friends: [],
      maxVisible: 3,
    });
    // 3 visible group chips + 1 overflow chip
    expect(screen.getByRole('link', { name: /Group 0/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Group 2/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Group 3/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();
  });
});
