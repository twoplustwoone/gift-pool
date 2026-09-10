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
  it('renders its child route inside a scrollable main region', () => {
    render(<ExchangesRoute />);
    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByTestId('outlet'));
    expect(main.className).toContain('overflow-y-auto');
  });
});
