/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom doesn't implement ResizeObserver; the OTPField used by the 2FA
// verify page relies on it. Polyfill with a no-op so the render doesn't
// throw.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as any).ResizeObserver = ResizeObserverStub;
  }
});

// Shared mocks for every settings sub-page smoke test. Each test swaps the
// `useLoaderData` / `useActionData` return value before rendering so we can
// assert the state-dependent branches (2FA enabled vs disabled, etc.) from a
// single file.

const loaderData: Record<string, unknown> = {};
const actionData: unknown = undefined;

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );
  return {
    ...actual,
    Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
    useLoaderData: () => loaderData,
    useActionData: () => actionData,
    useNavigation: () => ({ state: 'idle', formData: undefined }),
    useFetcher: () => ({
      state: 'idle',
      data: undefined,
      formData: undefined,
      submit: vi.fn(),
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
    }),
  };
});

vi.mock('#app/utils/misc.tsx', async () => {
  const actual = await vi.importActual<typeof import('#app/utils/misc.tsx')>(
    '#app/utils/misc.tsx',
  );
  return {
    ...actual,
    getUserImgSrc: (id?: string | null) =>
      id ? `/images/${id}` : '/images/default',
    useIsPending: () => false,
    useDoubleCheck: () => ({
      doubleCheck: false,
      getButtonProps: (props: Record<string, unknown> = {}) => props,
    }),
  };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('settings sub-pages', () => {
  it('renders the Change Email page inside the subpage shell', async () => {
    loaderData.user = { email: 'wade@example.com' };
    const { default: Route } = await import('./profile.change-email.tsx');
    renderWithRouter(<Route />);

    expect(
      screen.getByRole('heading', { level: 1, name: /change email/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/wade@example\.com/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to settings/i }),
    ).toHaveAttribute('href', '/settings/profile');
    expect(
      screen.getByRole('button', { name: /send confirmation/i }),
    ).toBeInTheDocument();
  });

  it('renders the Change Password page with all three fields', async () => {
    Object.keys(loaderData).forEach((k) => delete loaderData[k]);
    const { default: Route } = await import('./profile.password.tsx');
    renderWithRouter(<Route />);

    expect(
      screen.getByRole('heading', { level: 1, name: /change password/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^change password$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^cancel$/i }),
    ).toHaveAttribute('href', '/settings/profile');
  });

  it('renders the Create Password page', async () => {
    Object.keys(loaderData).forEach((k) => delete loaderData[k]);
    const { default: Route } = await import('./profile.password_.create.tsx');
    renderWithRouter(<Route />);

    expect(
      screen.getByRole('heading', { level: 1, name: /create password/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^create password$/i }),
    ).toBeInTheDocument();
  });

  it('renders the 2FA landing page with the enable button when disabled', async () => {
    loaderData.is2FAEnabled = false;
    const { default: Route } = await import('./profile.two-factor.index.tsx');
    renderWithRouter(<Route />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /two-factor authentication/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^enable 2fa$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /disable 2fa/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the 2FA landing page with the disable link when enabled', async () => {
    loaderData.is2FAEnabled = true;
    const { default: Route } = await import('./profile.two-factor.index.tsx');
    renderWithRouter(<Route />);

    expect(
      screen.getByText(/you have enabled two-factor authentication/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /disable 2fa/i }),
    ).toHaveAttribute('href', '/disable');
  });

  it('renders the 2FA verify page with QR code and submit/cancel buttons', async () => {
    loaderData.qrCode = 'data:image/png;base64,abc';
    loaderData.otpUri = 'otpauth://totp/test?secret=XYZ';
    const { default: Route } = await import('./profile.two-factor.verify.tsx');
    renderWithRouter(<Route />);

    expect(
      screen.getByRole('heading', { level: 1, name: /verify two-factor/i }),
    ).toBeInTheDocument();
    expect(screen.getByAltText(/qr code/i)).toHaveAttribute(
      'src',
      'data:image/png;base64,abc',
    );
    expect(screen.getByLabelText(/one-time password uri/i)).toHaveTextContent(
      'otpauth://totp/test?secret=XYZ',
    );
    expect(
      screen.getByRole('button', { name: /^submit$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^cancel$/i }),
    ).toBeInTheDocument();
  });

  it('renders the 2FA disable page with the destructive button', async () => {
    Object.keys(loaderData).forEach((k) => delete loaderData[k]);
    const { default: Route } = await import('./profile.two-factor.disable.tsx');
    renderWithRouter(<Route />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /disable two-factor authentication/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /disable 2fa/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to two-factor/i }),
    ).toHaveAttribute('href', '/settings/profile/two-factor');
  });
});
