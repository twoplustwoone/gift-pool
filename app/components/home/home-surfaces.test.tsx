/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOME_COPY } from './home-copy';
import { HomepageMockup } from './HomepageMockup.tsx';
import { HomeSocialProof } from './HomeSocialProof.tsx';

describe('home surface components', () => {
  it('renders the homepage mockup as an accessible image with matching caption', () => {
    render(
      <HomepageMockup
        alt="Illustration of a wishlist and gift group activity"
        className="w-full"
      />,
    );

    expect(
      screen.getByRole('img', {
        name: 'Illustration of a wishlist and gift group activity',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Illustration of a wishlist and gift group activity'),
    ).toHaveClass('sr-only');
  });

  it('renders the visible social proof copy and keeps testimonial placeholders hidden', () => {
    render(<HomeSocialProof />);

    expect(screen.getByText(HOME_COPY.social.strip)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: HOME_COPY.social.testimonialsHeading,
      }),
    ).not.toBeInTheDocument();
  });
});
