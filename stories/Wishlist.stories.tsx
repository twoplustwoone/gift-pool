import { type Meta, type StoryObj } from '@storybook/react-vite';
import { Wishlist } from '#app/components/wishlist/wishlist';

const baseUser = {
  username: 'jane',
  name: 'Jane Doe',
  image: null as { id: string } | null,
};

const categories = [
  { id: 'c1', name: 'Books', order: 0 },
  { id: 'c2', name: 'Gadgets', order: 1 },
];

const items = [
  {
    id: 'i1',
    title: 'Kindle Paperwhite',
    ownerId: 'user-1',
    note: '10th Gen, waterproof',
    url: 'https://www.amazon.com/',
    type: 'link' as const,
    categoryId: 'c2',
    purchase: null,
  },
  {
    id: 'i2',
    title: 'Noise-cancelling headphones',
    ownerId: 'user-1',
    note: 'Any good over-ear model',
    url: '',
    type: 'text' as const,
    categoryId: 'c2',
    purchase: null,
  },
  {
    id: 'i3',
    title: 'Cozy blanket',
    ownerId: 'user-1',
    note: 'Soft and warm',
    url: '',
    type: 'text' as const,
    categoryId: null,
    purchase: null,
  },
];

const viewerItems = [
  {
    id: 'i4',
    title: 'Board game night kit',
    ownerId: 'user-2',
    note: 'Dice, cards, and snacks',
    url: '',
    type: 'text' as const,
    categoryId: 'c1',
    purchase: null,
  },
  {
    id: 'i5',
    title: 'Fancy tea set',
    ownerId: 'user-2',
    note: 'Matcha friendly',
    url: '',
    type: 'text' as const,
    categoryId: 'c1',
    purchase: { purchasedById: 'friend-1' },
  },
  {
    id: 'i6',
    title: 'Wireless charger',
    ownerId: 'user-2',
    note: 'USB-C, fast charge',
    url: '',
    type: 'text' as const,
    categoryId: 'c2',
    purchase: null,
  },
];

const meta = {
  title: 'Wishlist/Wishlist',
  component: Wishlist,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    isOwner: { control: 'boolean' },
  },
} satisfies Meta<typeof Wishlist>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerEmpty: Story = {
  args: {
    isOwner: true,
    user: {
      ...baseUser,
      wishlistItems: [],
      wishlistCategories: [],
    },
  },
};

export const OwnerWithItems: Story = {
  args: {
    isOwner: true,
    user: {
      ...baseUser,
      wishlistItems: items,
      wishlistCategories: categories,
    },
  },
};

export const Viewer: Story = {
  args: {
    isOwner: false,
    user: {
      ...baseUser,
      wishlistItems: viewerItems,
      wishlistCategories: categories,
    },
  },
};
