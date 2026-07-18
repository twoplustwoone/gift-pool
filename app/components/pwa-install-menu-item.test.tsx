/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock('sonner', () => ({ toast }));

vi.mock('./ui/dropdown-menu.tsx', () => ({
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import {
  PwaInstallMenuItem,
  type PwaInstallMenuItemProps,
} from './pwa-install-menu-item.tsx';

const makeInstallState = (
  overrides: Partial<PwaInstallMenuItemProps> = {},
): PwaInstallMenuItemProps => ({
  capability: 'prompt',
  isInstalled: false,
  isPrompting: false,
  manualPlatform: null,
  promptInstall: vi.fn().mockResolvedValue('accepted'),
  ...overrides,
});

const renderItem = (props: PwaInstallMenuItemProps) =>
  render(
    <MemoryRouter>
      <PwaInstallMenuItem {...props} />
    </MemoryRouter>,
  );

beforeEach(() => {
  toast.error.mockReset();
  toast.info.mockReset();
  toast.success.mockReset();
});

describe('<PwaInstallMenuItem />', () => {
  it.each([
    ['unsupported browsers', { capability: 'unsupported' }],
    ['installed apps', { isInstalled: true }],
  ] satisfies Array<[string, Partial<PwaInstallMenuItemProps>]>)(
    'renders nothing for %s',
    (_label, overrides) => {
      const { container } = renderItem(makeInstallState(overrides));
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('links manual installs to the platform-specific instructions', () => {
    renderItem(
      makeInstallState({
        capability: 'manual',
        manualPlatform: 'ios-chrome',
      }),
    );
    expect(screen.getByRole('link', { name: 'Install app' })).toHaveAttribute(
      'href',
      '/pwa-install?platform=ios-chrome',
    );
  });

  it('disables the native install action while prompting', () => {
    renderItem(makeInstallState({ isPrompting: true }));
    expect(screen.getByRole('button', { name: 'Install app' })).toBeDisabled();
  });

  it.each([
    [
      'accepted',
      'success',
      'GiftPool installed',
      'You can now launch it from your Home Screen.',
    ],
    [
      'dismissed',
      'info',
      'Install dismissed',
      'You can install later from your account menu.',
    ],
    [
      'unavailable',
      'error',
      'Install not available',
      'Your browser did not expose an install option.',
    ],
    [
      'error',
      'error',
      'Install failed',
      'Something went wrong. Please try again.',
    ],
  ] as const)(
    'reports a native prompt outcome of %s',
    async (outcome, level, title, description) => {
      const promptInstall = vi.fn().mockResolvedValue(outcome);
      renderItem(makeInstallState({ promptInstall }));

      fireEvent.click(screen.getByRole('button', { name: 'Install app' }));

      await waitFor(() => expect(promptInstall).toHaveBeenCalledTimes(1));
      expect(toast[level]).toHaveBeenCalledWith(title, { description });
    },
  );

  it('reports unexpected prompt rejections as failures', async () => {
    renderItem(
      makeInstallState({
        promptInstall: vi.fn().mockRejectedValue(new Error('prompt failed')),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Install failed', {
        description: 'Something went wrong. Please try again.',
      }),
    );
  });
});
