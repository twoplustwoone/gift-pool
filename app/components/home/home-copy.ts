export const HOME_COPY = {
  hero: {
    headline: 'Group gifting, simplified.',
    subhead: 'Create wishlists, start gift groups, and split costs fairly.',
    primaryCta: 'Create Your Wishlist',
    secondaryCta: 'Start a Gift Group',
    visualAlt: 'Illustration of a wishlist and gift group activity',
  },
  features: [
    {
      key: 'wishlists-simple',
      title: 'Wishlists made simple',
      blurb: 'Add links or ideas in seconds.',
    },
    {
      key: 'gift-groups',
      title: 'Gift groups',
      blurb: 'Pool funds for bigger, better gifts.',
    },
    {
      key: 'contribution-limits',
      title: 'Contribution limits',
      blurb: "Everyone pays what they're comfortable with.",
    },
    {
      key: 'reminders',
      title: 'Reminders',
      blurb: 'Never miss a birthday again.',
    },
  ] as const,
  panels: {
    emptyWishlistTitle: 'Your wishlist is empty. Start adding dreams.',
    emptyWishlistCta: 'Add Item',
    emptyGroupsTitle: 'No groups yet. Create one and invite friends.',
    emptyGroupsCta: 'Create Group',
    birthdaysHeading: 'Upcoming birthdays',
    recentActivityHeading: 'Recent activity',
    planGift: 'Plan gift',
  },
  social: {
    strip: 'Perfect for birthdays, weddings, holidays, and more.',
    testimonialsHeading: 'What people are saying',
  },
  footer: {
    about: 'About',
    contact: 'Contact',
    privacy: 'Privacy',
    terms: 'Terms',
    copy: 'Built to make gifting easier.',
  },
} as const;

export type HomeFeature = (typeof HOME_COPY.features)[number];
