import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusButton } from './status-button'

const meta: Meta<typeof StatusButton> = {
	title: 'UI/StatusButton',
	component: StatusButton,
}
export default meta

type Story = StoryObj<typeof meta>

export const Idle: Story = {
	args: { status: 'idle', children: 'Save' },
}

export const Pending: Story = {
	args: { status: 'pending', children: 'Save' },
}

export const Success: Story = {
	args: { status: 'success', children: 'Saved' },
}

export const Error: Story = {
	args: { status: 'error', children: 'Error', message: 'Something went wrong' },
}
