/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TermsOfServiceRoute from './tos.tsx';

describe('TermsOfServiceRoute', () => {
  it('renders the terms with key sections', () => {
    render(<TermsOfServiceRoute />);

    expect(
      screen.getByRole('heading', { level: 1, name: /terms of service/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/acceptance of terms/i)).toBeInTheDocument();
    expect(screen.getByText(/acceptable use/i)).toBeInTheDocument();
    expect(screen.getByText(/gift coordination/i)).toBeInTheDocument();
    expect(
      screen.getByText(/limitation of liability/i),
    ).toBeInTheDocument();
  });
});
