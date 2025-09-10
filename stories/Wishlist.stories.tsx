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
  },
  {
    id: 'i2',
    title: 'Noise-cancelling headphones',
    ownerId: 'user-1',
    note: 'Any good over-ear model',
    url: '',
    type: 'text' as const,
    categoryId: 'c2',
  },
  {
    id: 'i3',
    title: 'Cozy blanket',
    ownerId: 'user-1',
    note: 'Soft and warm',
    url: '',
    type: 'text' as const,
    categoryId: null,
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
      wishlistItems: items,
      wishlistCategories: categories,
    },
  },
};
