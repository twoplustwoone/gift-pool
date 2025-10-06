import { type Meta, type StoryObj } from '@storybook/react-vite';
import {
  GroupCard,
  type GroupCardData,
} from '#app/components/groups/GroupCard';

const base: GroupCardData = {
  id: 'g1',
  name: 'Family Gift Exchange',
  description: 'Annual holiday exchange with the whole family.',
  memberCount: 8,
  createdAt: new Date('2024-07-15'),
  myRole: 'MEMBER',
};

const meta = {
  title: 'Groups/GroupCard',
  component: GroupCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    onOpen: { table: { disable: true } },
  },
  args: {
    g: base,
    onOpen: () => {},
  },
} satisfies Meta<typeof GroupCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Member: Story = {};

export const Admin: Story = {
  args: {
    g: { ...base, id: 'g2', name: 'Neighborhood Potluck', myRole: 'ADMIN' },
  },
};

export const Owner: Story = {
  args: {
    g: { ...base, id: 'g3', name: 'Office Secret Santa', myRole: 'OWNER' },
  },
};

export const NoDescription: Story = {
  args: {
    g: { ...base, id: 'g4', name: 'Weekend Camping Crew', description: null },
  },
};

export const LongText: Story = {
  args: {
    g: {
      ...base,
      id: 'g5',
      name: 'A Very Long Group Name That Tests Line Wrapping And Layout',
      description:
        'This is an intentionally long description to ensure the card clamps and layouts remain visually stable across various content lengths. It should not exceed two lines in the UI.',
    },
  },
};
