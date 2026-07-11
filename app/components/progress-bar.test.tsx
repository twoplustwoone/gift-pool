/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';

import { EpicProgress } from './progress-bar';

describe('EpicProgress', () => {
  // jsdom, like pre-Chrome-84 browsers, has no Element.getAnimations —
  // this render doubles as the regression test for that crash.
  it('renders without Element.getAnimations support', () => {
    const App = createRoutesStub([
      { path: '/', Component: () => <EpicProgress /> },
    ]);
    render(<App />);
    expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument();
  });
});
