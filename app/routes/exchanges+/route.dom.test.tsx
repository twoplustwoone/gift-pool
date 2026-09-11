/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
}));
vi.mock('#app/utils/auth.server.ts', () => ({ requireUserId: vi.fn() }));

import ExchangesRoute from './route.tsx';

describe('exchanges section layout', () => {
  it('renders its child route in a main region that does not scroll itself', () => {
    render(<ExchangesRoute />);
    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByTestId('outlet'));
    // The app has exactly one scroll container, in root. A section that
    // declares its own boxes the page to the viewport on devices where the
    // percentage height resolves, which is what clipped the form on iOS.
    expect(main.className).not.toContain('overflow-y-auto');
    expect(main.className).not.toContain('h-full');
    // And it must be able to shrink: a grid/flex child at its default
    // `min-width: auto` grows to its content's minimum, which is how a
    // `truncate` header pushed the whole page 644px wide in a 390px viewport.
    expect(main.className).toContain('min-w-0');
  });
});
