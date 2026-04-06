import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { LuGift } from 'react-icons/lu'
import {
	data,
	Form,
	Link,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	useActionData,
	useLoaderData,
} from 'react-router'
import { z } from 'zod'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Flex, Stack, Text } from '#app/components/ui-kit'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	OCCASION_TYPE,
	OCCASION_TYPE_LABELS,
	DECISION_MODE,
	DECISION_MODE_LABELS,
	type OccasionType,
} from '#app/utils/pool-constants.ts'
import { createPool } from '#app/utils/pool.server.ts'

const CreatePoolSchema = z.object({
	title: z.string().min(1, 'Give your pool a title').max(100),
	occasionType: z.enum(
		Object.values(OCCASION_TYPE) as [OccasionType, ...OccasionType[]],
	),
	eventDate: z.string().optional(),
	decisionMode: z.enum(['ORGANIZER_PICKS', 'VOTE']),
	// Recipient: either a platform username or a free-text name
	recipientUsername: z.string().optional(),
	recipientName: z.string().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserId(request)
	return {}
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: CreatePoolSchema })

	if (submission.status !== 'success') {
		return data(submission.reply(), { status: 400 })
	}

	const {
		title,
		occasionType,
		eventDate,
		decisionMode,
		recipientUsername,
		recipientName,
	} = submission.value

	// Resolve recipient user if a username was provided
	let recipientUserId: string | null = null
	if (recipientUsername) {
		const recipient = await prisma.user.findUnique({
			where: { username: recipientUsername },
			select: { id: true },
		})
		if (!recipient) {
			return data(
				submission.reply({
					fieldErrors: {
						recipientUsername: ['No user found with that username.'],
					},
				}),
				{ status: 400 },
			)
		}
		recipientUserId = recipient.id
	}

	const pool = await createPool({
		title,
		occasionType,
		eventDate: eventDate ? new Date(eventDate) : null,
		decisionMode,
		recipientUserId,
		recipientName: recipientName || null,
		organizerId: userId,
	})

	return redirect(`/pools/${pool.id}`)
}

const NewPool = () => {
	useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		lastResult: actionData,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreatePoolSchema })
		},
		defaultValue: {
			occasionType: OCCASION_TYPE.BIRTHDAY,
			decisionMode: DECISION_MODE.ORGANIZER_PICKS,
		},
	})

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/* Header */}
			<div className="border-b bg-surface px-4 py-4 shadow">
				<div className="container flex items-center gap-3">
					<Button asChild variant="ghost" size="sm" className="px-2">
						<Link to="/pools">
							<Icon name="arrow-left" className="mr-1" /> Pools
						</Link>
					</Button>
					<Flex gap={2} align="center">
						<LuGift className="text-primary" />
						<Text weight="bold">Start a Pool</Text>
					</Flex>
				</div>
			</div>

			{/* Form */}
			<div className="container max-w-lg py-8">
				<Form method="post" {...getFormProps(form)}>
					<Stack gap={6}>
						{/* Title */}
						<Stack gap={2}>
							<Label htmlFor={fields.title.id}>Pool title</Label>
							<Input
								{...getInputProps(fields.title, { type: 'text' })}
								placeholder="e.g. Marco's 30th Birthday"
								autoFocus
							/>
							{fields.title.errors && (
								<Text size="sm" className="text-destructive">
									{fields.title.errors[0]}
								</Text>
							)}
						</Stack>

						{/* Occasion */}
						<Stack gap={2}>
							<Label htmlFor={fields.occasionType.id}>Occasion</Label>
							<select
								{...getInputProps(fields.occasionType, { type: 'text' })}
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
							>
								{Object.entries(OCCASION_TYPE_LABELS).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</Stack>

						{/* Event date */}
						<Stack gap={2}>
							<Label htmlFor={fields.eventDate.id}>
								Event date{' '}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								{...getInputProps(fields.eventDate, { type: 'date' })}
							/>
						</Stack>

						{/* Recipient */}
						<Stack gap={4}>
							<Text weight="medium">Who is this for?</Text>
							<Stack gap={2}>
								<Label htmlFor={fields.recipientUsername.id}>
									Gift Pool username{' '}
									<span className="text-muted-foreground">(optional)</span>
								</Label>
								<Input
									{...getInputProps(fields.recipientUsername, { type: 'text' })}
									placeholder="their username"
								/>
								{fields.recipientUsername.errors && (
									<Text size="sm" className="text-destructive">
										{fields.recipientUsername.errors[0]}
									</Text>
								)}
								<Text size="xs" className="text-muted-foreground">
									If they're on Gift Pool we'll link their wishlist. They'll
									never see this pool.
								</Text>
							</Stack>
							<Stack gap={2}>
								<Label htmlFor={fields.recipientName.id}>
									Or just their name{' '}
									<span className="text-muted-foreground">(optional)</span>
								</Label>
								<Input
									{...getInputProps(fields.recipientName, { type: 'text' })}
									placeholder="e.g. Marco"
								/>
							</Stack>
						</Stack>

						{/* Decision mode */}
						<Stack gap={2}>
							<Label>How will you pick the gift?</Label>
							<Stack gap={2}>
								{Object.entries(DECISION_MODE_LABELS).map(([value, label]) => (
									<label key={value} className="flex cursor-pointer items-center gap-3">
										<input
											type="radio"
											name={fields.decisionMode.name}
											value={value}
											defaultChecked={value === DECISION_MODE.ORGANIZER_PICKS}
											className="text-primary"
										/>
										<Stack gap={0}>
											<Text weight="medium" size="sm">
												{label}
											</Text>
											<Text size="xs" className="text-muted-foreground">
												{value === DECISION_MODE.ORGANIZER_PICKS
													? 'You pick the winner from the ideas list.'
													: 'Everyone votes and the most popular idea wins.'}
											</Text>
										</Stack>
									</label>
								))}
							</Stack>
						</Stack>

						<Flex gap={3} justify="end">
							<Button asChild variant="outline">
								<Link to="/pools">Cancel</Link>
							</Button>
							<Button type="submit">Start Pool</Button>
						</Flex>
					</Stack>
				</Form>
			</div>
		</div>
	)
}

export default NewPool
