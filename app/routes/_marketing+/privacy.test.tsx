/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrivacyRoute from './privacy.tsx';

describe('PrivacyRoute', () => {
  it('renders the policy with key sections', () => {
    render(<PrivacyRoute />);

    expect(
      screen.getByRole('heading', { level: 1, name: /privacy policy/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/information we collect/i)).toBeInTheDocument();
    expect(screen.getByText(/third-party services/i)).toBeInTheDocument();
    expect(screen.getByText(/cookies and sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/data retention/i)).toBeInTheDocument();
    expect(
      screen.getByText(/normalized browser, device, viewport/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/browser notification permission state/i),
    ).toBeInTheDocument();
  });
});
