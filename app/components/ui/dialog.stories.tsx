import type { Meta, StoryObj } from '@storybook/react-vite'
import {
	Dialog,
	DialogContent,
	DialogTrigger,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from './dialog'
import { Button } from './button'

const meta: Meta<typeof Dialog> = {
	title: 'UI/Dialog',
	component: Dialog,
}
export default meta

export const Default: StoryObj<typeof meta> = {
	render: () => (
		<Dialog defaultOpen>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Dialog Title</DialogTitle>
					<DialogDescription>This is a dialog</DialogDescription>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	),
}

export const WithTrigger: StoryObj<typeof meta> = {
	render: () => (
		<Dialog>
			<DialogTrigger asChild>
				<Button>Open Dialog</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Dialog Title</DialogTitle>
					<DialogDescription>With trigger button</DialogDescription>
				</DialogHeader>
			</DialogContent>
		</Dialog>
	),
}
