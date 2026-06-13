/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('remix-utils/honeypot/react', () => ({
  HoneypotInputs: () => null,
}));

// The OTP field (input-otp) observes its size and probes for password
// managers via elementFromPoint; jsdom implements neither.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
document.elementFromPoint ??= () => null;

import VerifyRoute from './verify.tsx';

function renderVerify({
  search,
  action,
}: {
  search: string;
  action?: () => unknown;
}) {
  const App = createRoutesStub([
    {
      Component: VerifyRoute,
      HydrateFallback: () => null,
      path: '/verify',
      action: action as never,
    },
  ]);
  return render(<App initialEntries={[`/verify${search}`]} />);
}

describe('verify route UI', () => {
  it('echoes the email the code was sent to', async () => {
    renderVerify({
      search: '?type=onboarding&target=typo%40example.com',
    });
    expect(await screen.findByText('typo@example.com')).toBeInTheDocument();
    expect(screen.getByText(/we've sent a code to/i)).toBeInTheDocument();
  });

  it('offers resend and start-over for onboarding, preserving redirectTo', async () => {
    renderVerify({
      search:
        '?type=onboarding&target=x%40example.com&redirectTo=%2Fgroups%2Fjoin%2Fabc',
    });
    expect(
      await screen.findByRole('button', { name: /resend code/i }),
    ).toBeInTheDocument();
    const startOver = screen.getByRole('link', {
      name: /wrong email\? start over/i,
    });
    expect(startOver).toHaveAttribute(
      'href',
      '/signup?redirectTo=%2Fgroups%2Fjoin%2Fabc',
    );
  });

  it('posts the resend intent with type, target, and redirectTo', async () => {
    renderVerify({
      search: '?type=onboarding&target=x%40example.com&redirectTo=%2Fwishlist',
    });
    const resendButton = await screen.findByRole('button', {
      name: /resend code/i,
    });
    const form = resendButton.closest('form')!;
    const values = Object.fromEntries(new FormData(form).entries());
    expect(values).toMatchObject({
      intent: 'resend',
      type: 'onboarding',
      target: 'x@example.com',
      redirectTo: '/wishlist',
    });
  });

  it('auto-submits once the sixth digit lands', async () => {
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => {});
    try {
      renderVerify({ search: '?type=onboarding&target=x%40example.com' });
      const codeInput = await screen.findByRole('textbox', { name: /code/i });
      await userEvent.type(codeInput, '123456');
      await waitFor(() => expect(requestSubmit).toHaveBeenCalled());
    } finally {
      requestSubmit.mockRestore();
    }
  });

  it('hides the recovery affordances for non-onboarding types', async () => {
    renderVerify({ search: '?type=2fa&target=user-1' });
    expect(await screen.findByText(/check your 2fa app/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /resend code/i }),
    ).not.toBeInTheDocument();
  });
});
