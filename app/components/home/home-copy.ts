export const HOME_COPY = {
  hero: {
    headline: 'Plan a gift together without spoiling the surprise.',
    subhead:
      'Gift Pool keeps the group organized, ideas private, and everyone clear on who is doing what — without a spreadsheet or a group chat the recipient can read.',
    primaryCta: 'Start a pool',
    secondaryCta: 'Make a wishlist',
    visualAlt: 'Preview of a gift pool with private ideas and clear progress',
  },
  howItWorks: {
    heading: 'How it works',
    steps: [
      {
        key: 'start',
        title: 'Start a pool',
        blurb:
          'Pick the person and the occasion, then collect gift ideas the recipient never sees.',
      },
      {
        key: 'invite',
        title: 'Invite the group',
        blurb:
          'Friends join with a link, add ideas, and choose the gift together.',
      },
      {
        key: 'give',
        title: 'Give the gift',
        blurb:
          'One person buys it, everyone pays them back directly, and the surprise holds.',
      },
    ],
    privacyNote:
      'What each person is comfortable contributing stays private to them. Gift Pool coordinates the plan — money moves directly between friends, never through us.',
  },
  maker: {
    heading: 'A note from the maker',
    body: 'Group chats are great until you are planning a surprise for someone who is in them. Gift Pool is a small tool for keeping ideas and responsibilities clear while the gift stays a surprise.',
  },
  panels: {
    emptyWishlistTitle: 'Your wishlist is empty. Start adding dreams.',
    emptyWishlistCta: 'Add Item',
    emptyGroupsTitle: 'No groups yet. Create one and invite friends.',
    emptyGroupsCta: 'Create Group',
    birthdaysHeading: 'Upcoming birthdays',
    recentActivityHeading: 'Recent activity',
    planGift: 'Plan gift',
  },
  footer: {
    about: 'About',
    contact: 'Contact',
    privacy: 'Privacy',
    terms: 'Terms',
    copy: 'Built to make gifting easier.',
  },
} as const;

export type HomeStep = (typeof HOME_COPY.howItWorks.steps)[number];
