import type { Meta, StoryObj } from '@storybook/react';
import { RoleBadge } from '../app/components/groups/RoleBadge';
import type { GroupRole } from '../app/utils/group-role';

const meta = {
  title: 'Groups/RoleBadge',
  component: RoleBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    role: {
      control: { type: 'radio' },
      options: ['OWNER', 'ADMIN', 'MEMBER'],
    },
  },
  args: {
    role: 'MEMBER' satisfies GroupRole,
  },
} satisfies Meta<typeof RoleBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Member: Story = {
  args: { role: 'MEMBER' },
};

export const Admin: Story = {
  args: { role: 'ADMIN' },
};

export const Owner: Story = {
  args: { role: 'OWNER' },
};

