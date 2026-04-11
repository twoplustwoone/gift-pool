/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// `react-easy-crop` is loaded via React.lazy inside the sheet. The component
// under test only renders the Cropper once a file has been picked, so for
// the open/closed smoke tests we don't need a real impl — stub the dynamic
// import so jsdom doesn't trip on browser-only globals.
vi.mock('react-easy-crop', () => ({
  default: () => <div data-testid="cropper-stub" />,
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>(
    'react-router',
  );
  return {
    ...actual,
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
    useDoubleCheck: () => ({
      doubleCheck: false,
      getButtonProps: (props: Record<string, unknown> = {}) => props,
    }),
  };
});

import { ProfilePhotoSheet } from './__profile-photo-sheet.tsx';

function renderSheet(
  props: Partial<React.ComponentProps<typeof ProfilePhotoSheet>> = {},
) {
  return render(
    <MemoryRouter>
      <ProfilePhotoSheet
        open
        onOpenChange={() => {}}
        currentImageId="img-1"
        userName="Wade Wilson"
        userUsername="wade"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('<ProfilePhotoSheet />', () => {
  it('renders the dialog with title, description, and choose/save/cancel actions', () => {
    renderSheet();

    expect(
      screen.getByRole('dialog', { name: /profile photo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/upload a clear, centered photo/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /save photo/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /^cancel$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/change photo/i),
    ).toBeInTheDocument();
  });

  it('shows the Remove photo button when the user already has an avatar', () => {
    renderSheet({ currentImageId: 'img-1' });
    expect(
      screen.getByRole('button', { name: /remove photo/i }),
    ).toBeInTheDocument();
  });

  it('hides the Remove photo button when the user has no avatar', () => {
    renderSheet({ currentImageId: null });
    expect(
      screen.queryByRole('button', { name: /remove photo/i }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing visible when the sheet is closed', () => {
    renderSheet({ open: false });
    expect(
      screen.queryByRole('dialog', { name: /profile photo/i }),
    ).not.toBeInTheDocument();
  });
});
