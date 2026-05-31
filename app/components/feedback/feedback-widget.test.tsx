/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';

import { FeedbackWidget } from './feedback-widget.tsx';

// No loaders → the stub renders synchronously. The embedded form (rendered only
// once the dialog opens) reads optional root loader data, which is simply
// undefined here, so it renders in its anonymous state.
function renderAt(pathname: string) {
  const Stub = createRoutesStub([
    { id: 'root', path: '*', Component: () => <FeedbackWidget /> },
  ]);
  render(<Stub initialEntries={[pathname]} />);
}

describe('FeedbackWidget', () => {
  it('renders the trigger button on a normal route', () => {
    renderAt('/groups');
    expect(
      screen.getByRole('button', { name: 'Give feedback' }),
    ).toBeInTheDocument();
  });

  it.each(['/support', '/login', '/signup', '/onboarding', '/verify'])(
    'is suppressed on %s',
    (pathname) => {
      renderAt(pathname);
      expect(
        screen.queryByRole('button', { name: 'Give feedback' }),
      ).not.toBeInTheDocument();
    },
  );

  it('opens a dialog containing the feedback form when clicked', () => {
    renderAt('/groups');
    fireEvent.click(screen.getByRole('button', { name: 'Give feedback' }));

    expect(screen.getByText('Send us feedback')).toBeInTheDocument();
    // The embedded form renders its submit button once the dialog is open.
    expect(
      screen.getByRole('button', { name: /send feedback/i }),
    ).toBeInTheDocument();
  });
});
