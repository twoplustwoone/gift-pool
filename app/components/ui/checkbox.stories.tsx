import type { Meta, StoryObj } from '@storybook/react-vite'
import { Checkbox } from './checkbox'

const meta: Meta<typeof Checkbox> = {
	title: 'UI/Checkbox',
	component: Checkbox,
}
export default meta

export const Unchecked: StoryObj<typeof meta> = {}

export const Checked: StoryObj<typeof meta> = {
	args: { defaultChecked: true },
}
