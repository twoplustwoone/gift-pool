/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, type Location } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetcherState = {
  data: undefined as
    | undefined
    | {
        result: {
          error?: Record<string, Array<string>>;
          initialValue?: Record<string, string>;
          state?: string;
        };
      },
  state: 'idle' as 'idle' | 'submitting',
};

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');

  return {
    ...actual,
    useFetcher: () => ({
      Form: (props: React.ComponentProps<'form'>) => <form {...props} />,
      data: fetcherState.data,
      state: fetcherState.state,
    }),
  };
});

import ForgotPasswordRoute, { meta } from './forgot-password.tsx';

const location = {
  hash: '',
  key: 'test',
  pathname: '/forgot-password',
  search: '',
  state: null,
  unstable_mask: undefined,
} satisfies Location;

function renderRoute() {
  return render(
    <MemoryRouter>
      <ForgotPasswordRoute />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetcherState.data = undefined;
  fetcherState.state = 'idle';
});

describe('app/routes/_auth+/forgot-password.tsx', () => {
  it('renders the recovery form and back-to-login link', () => {
    renderRoute();

    expect(
      screen.getByRole('heading', { name: 'Forgot Password' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No worries, we'll send you reset instructions."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /username or email/i }),
    ).toHaveAttribute('type', 'text');
    expect(
      screen.getByRole('button', { name: 'Recover password' }),
    ).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Back to Login' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('shows a pending submit state and surfaces returned form errors', () => {
    fetcherState.state = 'submitting';
    fetcherState.data = {
      result: {
        error: {
          '': ['Email service unavailable'],
        },
      },
    };

    renderRoute();

    expect(
      screen.getByRole('button', { name: 'Recover password' }),
    ).toBeDisabled();
    expect(screen.getByText('Email service unavailable')).toBeInTheDocument();
  });

  it('sets the password recovery page title', () => {
    expect(
      meta({
        data: undefined,
        loaderData: undefined,
        location,
        matches: [],
        params: {},
      }),
    ).toEqual([
      {
        title: 'Password Recovery for GiftPool',
      },
    ]);
  });
});
