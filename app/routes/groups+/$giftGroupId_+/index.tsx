import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { nanoid } from 'nanoid'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'

import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Avatar } from '#app/components/ui/avatar.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from '#app/components/ui/dialog.tsx'
import { Heading } from '#app/components/ui/heading.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { SectionSubtitle } from '#app/components/ui/sectionSubtitle'
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { Subheading } from '#app/components/ui/subheading.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getInviteLink } from '#app/utils/group-invitations.server.ts'
import {
	requireUserInGroup,
	requireUserWithGroupPermission,
	userHasGroupPermission,
} from '#app/utils/group-permissions.server.ts'
import { useDebounce, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'

export enum GiftGroupIdFormIntent {
	DeleteGiftGroup = 'delete-gift-group',
	CreateInviteLink = 'create-invite-link',
}

const DeleteFormSchema = z.object({
	intent: z.literal(GiftGroupIdFormIntent.DeleteGiftGroup),
	giftGroupId: z.string(),
})

export const CreateInviteLinkFormSchema = z.object({
	intent: z.literal(GiftGroupIdFormIntent.CreateInviteLink),
	giftGroupId: z.string(),
	expiresInDays: z.string(),
})

export async function loader({ params, request }: LoaderFunctionArgs) {
	const groupId = params.giftGroupId!
	const userId = await requireUserInGroup(request, groupId)

	const giftGroup = await prisma.giftGroup.findUnique({
		where: { id: groupId },
		select: {
			name: true,
			description: true,
			id: true,
			groupMembers: {
				select: {
					user: {
						select: {
							id: true,
							username: true,
							name: true,
							image: {
								select: {
									id: true,
									altText: true,
								},
							},
						},
					},
					role: true,
				},
			},
		},
	})

	if (!giftGroup) {
		throw new Response('Group not found', { status: 404 })
	}

	const canDelete = await userHasGroupPermission(userId, groupId, 'deleteGroup')
	const canInvite = await userHasGroupPermission(userId, groupId, 'addMember')

	// Fetch existing invitation link if it exists
	let inviteLink: string | null = null
	if (canInvite) {
		const existingInvitation = await prisma.groupInvitation.findFirst({
			where: {
				giftGroupId: groupId,
				expiresAt: { gt: new Date() },
			},
			orderBy: {
				createdAt: 'desc',
			},
		})

		if (existingInvitation) {
			inviteLink = getInviteLink(existingInvitation.code)
		}
	}

	return json({ giftGroup, canInvite, canDelete, inviteLink })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const formIntent = formData.get('intent')

	let submission
	let giftGroupId
	switch (formIntent) {
		case GiftGroupIdFormIntent.DeleteGiftGroup:
			submission = parseWithZod(formData, {
				schema: DeleteFormSchema,
			})

			if (submission.status !== 'success') {
				return json(submission.reply(), {
					status: submission.status === 'error' ? 400 : 200,
				})
			}

			// if (submission.intent !== 'submit') {
			// 	return json({
			// 		intent: GiftGroupIdFormIntent.DeleteGiftGroup,
			// 		status: 'idle',
			// 		submission,
			// 	})
			// }
			// if (!submission.value) {
			// 	return json(
			// 		{
			// 			intent: GiftGroupIdFormIntent.DeleteGiftGroup,
			// 			status: 'error',
			// 			submission,
			// 		},
			// 		{ status: 400 },
			// 	)
			// }

			giftGroupId = submission.value.giftGroupId

			await requireUserWithGroupPermission(request, giftGroupId, 'deleteGroup')

			await prisma.giftGroup.delete({ where: { id: giftGroupId } })

			return redirectWithToast(`/groups`, {
				type: 'success',
				title: 'Success',
				description: `Group has been deleted.`,
			})
		case GiftGroupIdFormIntent.CreateInviteLink:
			submission = parseWithZod(formData, {
				schema: CreateInviteLinkFormSchema,
			})

			if (submission.status !== 'success') {
				return json(submission.reply(), {
					status: submission.status === 'error' ? 400 : 200,
				})
			}

			// if (submission.intent !== 'submit') {
			// 	return json({
			// 		status: 'idle',
			// 		submission,
			// 		intent: GiftGroupIdFormIntent.CreateInviteLink,
			// 	})
			// }
			// if (!submission.value) {
			// 	return json(
			// 		{
			// 			status: 'error',
			// 			submission,
			// 			intent: GiftGroupIdFormIntent.CreateInviteLink,
			// 		},
			// 		{ status: 400 },
			// 	)
			// }

			const { expiresInDays } = submission.value
			giftGroupId = submission.value.giftGroupId

			const expiresAt = new Date()
			expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays, 10))

			const userId = await requireUserWithGroupPermission(
				request,
				giftGroupId,
				'addMember',
			)

			await prisma.groupInvitation.create({
				data: {
					giftGroupId,
					code: nanoid(),
					expiresAt,
					createdById: userId,
				},
			})

			// TODO: need to load this instead of returning it from action maybe?
			// const inviteLink = getInviteLink(invitation.code)

			return json(
				submission.reply(),
				// {
				// status: 'success',
				// inviteLink,
				// submission,
				// intent: GiftGroupIdFormIntent.CreateInviteLink,
				// }
			)
		default:
			throw new Error(`Unknown form intent: ${formIntent}`)
	}
}

export default function GiftGroupIndex() {
	const { giftGroup, canInvite, canDelete, inviteLink } =
		useLoaderData<typeof loader>()

	return (
		<div>
			<SectionTitle>
				<div className="flex min-h-10 w-full content-between justify-between">
					<Heading>{giftGroup.name}</Heading>
					<div className="flex gap-1">
						{canInvite && (
							<CreateInviteLinkDialog
								giftGroupId={giftGroup.id}
								link={inviteLink}
							/>
						)}
						{canDelete && <DeleteGroupDialog id={giftGroup.id} />}
					</div>
				</div>
				<SectionSubtitle>
					<Subheading>{giftGroup.description}</Subheading>
				</SectionSubtitle>
			</SectionTitle>
			<div className="text-body-sm"></div>
			<div>
				<div className="text-xl font-bold">Members</div>
				{giftGroup.groupMembers.map((groupMember) => (
					<div key={groupMember.user.id} className="flex items-center gap-2">
						<Avatar
							size={'s'}
							image={groupMember.user.image}
							user={groupMember.user}
						/>
						<div className="text-body-md">{groupMember.user.username}</div>
					</div>
				))}
			</div>
		</div>
	)
}

function CreateInviteLinkDialog({
	link: initialLink,
	giftGroupId,
}: {
	link: string | null
	giftGroupId: string
}) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [form] = useForm({
		id: GiftGroupIdFormIntent.CreateInviteLink,
		lastResult: actionData,
		constraint: getZodConstraint(CreateInviteLinkFormSchema),
		// onValidate({ formData }) {
		// 	return parseWithZod(formData, { schema: CreateInviteLinkFormSchema })
		// },
		defaultValue: {
			expiresInDays: '7',
		},
	})

	const [link /* , setLink */] = useState(initialLink)
	const [hasCopied, setHasCopied] = useState(false)

	// TODO: load from loader
	// useEffect(() => {
	// 	if (actionData?.inviteLink) {
	// 		setLink(actionData.inviteLink)
	// 	}
	// }, [actionData])

	const debouncedReset = useDebounce(() => setHasCopied(false), 2000)

	const copyLink = () => {
		setHasCopied(true)
		debouncedReset()
		void navigator.clipboard.writeText(link!)
	}

	const handleInputClick = (
		event: React.MouseEvent<HTMLInputElement, MouseEvent>,
	) => {
		event.currentTarget.select()
		copyLink()
	}

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant={'default'}>
					<Icon name="link-2" className="scale-125 max-md:scale-150">
						<span className="max-md:hidden">Invite</span>
					</Icon>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create invite link</DialogTitle>
					<DialogDescription>
						Invite others to join this group using a link.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					{link ? (
						<div className="flex items-center space-x-2">
							<div className="grid flex-1 gap-2">
								<Label htmlFor="link" className="sr-only">
									Link
								</Label>
								<Input
									id="link"
									defaultValue={link}
									readOnly
									onClick={handleInputClick}
								/>
							</div>
							<TooltipProvider>
								<Tooltip open={hasCopied}>
									<TooltipTrigger asChild className="h-full">
										<Button onClick={copyLink} size="sm" className="px-3">
											<span className="sr-only">Copy</span>
											<Icon name="copy" className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Copied to clipboard</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					) : (
						<Form method="POST" {...getFormProps(form)}>
							<AuthenticityTokenInput />
							<input type="hidden" name="giftGroupId" value={giftGroupId} />
							<div className="flex items-center">
								<div className="w-1/2">Link expires after</div>
								<div className="w-1/2">
									<Select
										defaultValue="7"
										onValueChange={() => {
											// TODO: hook up change to form
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select an expiration time" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="1">1 day</SelectItem>
												<SelectItem value="3">3 days</SelectItem>
												<SelectItem value="7">7 days</SelectItem>
												<SelectItem value="14">14 days</SelectItem>
												<SelectItem value="30">30 days</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
								</div>
							</div>
						</Form>
					)}
					<DialogFooter>
						<DialogClose asChild>
							<Button variant={'secondary'} type="button">
								Cancel
							</Button>
						</DialogClose>
						{/* <input type="hidden" name="giftGroupId" value={id} /> */}
						{link ? (
							<StatusButton
								status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
								variant="destructive"
							>
								{/* Probably need a better label than this */}
								{/* On click, will invalidate the code in the backend */}
								Destroy link
							</StatusButton>
						) : (
							<StatusButton
								type="submit"
								name="intent"
								value={GiftGroupIdFormIntent.CreateInviteLink}
								variant="default"
								status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
								disabled={isPending}
								className="max-md:aspect-square max-md:px-0"
								form={form.id}
							>
								Create link
							</StatusButton>
						)}
						<ErrorList errors={form.errors} id={form.errorId} />
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function DeleteGroupDialog({ id }: { id: string }) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [form] = useForm({
		id: GiftGroupIdFormIntent.DeleteGiftGroup,
		lastResult: actionData,
	})

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant={'destructive'}>
					<Icon name="trash" className="scale-125 max-md:scale-150">
						<span className="max-md:hidden">Delete</span>
					</Icon>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Delete group</DialogTitle>
					<DialogDescription>
						Warning! This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					Are you sure you want to delete this group?
				</div>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant={'secondary'} type="button">
							Cancel
						</Button>
					</DialogClose>
					<Form method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<input type="hidden" name="giftGroupId" value={id} />
						<StatusButton
							type="submit"
							name="intent"
							value={GiftGroupIdFormIntent.DeleteGiftGroup}
							variant="destructive"
							status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
							disabled={isPending}
							className="w-full max-md:aspect-square max-md:px-0"
						>
							Delete group
						</StatusButton>
						<ErrorList errors={form.errors} id={form.errorId} />
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
