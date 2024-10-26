import { getFormProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type GroupInvitation } from '@prisma/client'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useFetcher,
	useLoaderData,
} from '@remix-run/react'
import { useState } from 'react'

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
import { prisma } from '#app/utils/db.server.ts'
import {
	createInviteLink,
	destroyInviteLink,
	getInviteLink,
} from '#app/utils/group-invitations.server.ts'
import { userHasGroupPermission } from '#app/utils/group-permissions.server.ts'
import {
	deleteGiftGroup,
	leaveGroup,
	requireUserIdInGroup,
} from '#app/utils/groups.server.ts'
import { useDebounce, useIsPending } from '#app/utils/misc.tsx'
import {
	createToastHeaders,
	redirectWithToast,
} from '#app/utils/toast.server.ts'

export enum GiftGroupIdFormIntent {
	DeleteGiftGroup = 'delete-gift-group',
	CreateInviteLink = 'create-invite-link',
	DestroyInviteLink = 'destroy-invite-link',
	LeaveGiftGroup = 'leave-gift-group',
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

export const DestroyInviteLinkFormSchema = z.object({
	intent: z.literal(GiftGroupIdFormIntent.DestroyInviteLink),
	giftGroupId: z.string(),
	groupInvitationId: z.string(),
})

export const LeaveGroupFormSchema = z.object({
	intent: z.literal(GiftGroupIdFormIntent.LeaveGiftGroup),
	giftGroupId: z.string(),
})

export async function loader({ params, request }: LoaderFunctionArgs) {
	const groupId = params.giftGroupId!
	const userId = await requireUserIdInGroup(request, groupId)

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
	const canLeave = await userHasGroupPermission(userId, groupId, 'leaveGroup')

	let existingInvitation: GroupInvitation | null = null
	if (canInvite) {
		existingInvitation = await prisma.groupInvitation.findFirst({
			where: {
				giftGroupId: groupId,
				expiresAt: { gt: new Date() },
			},
			orderBy: {
				createdAt: 'desc',
			},
		})
	}

	return json({
		giftGroup,
		canInvite,
		canDelete,
		canLeave,
		inviteLink: existingInvitation
			? getInviteLink(existingInvitation.code)
			: null,
		groupInvitationId: existingInvitation?.id,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, {
		schema: DeleteFormSchema.or(CreateInviteLinkFormSchema)
			.or(DestroyInviteLinkFormSchema)
			.or(LeaveGroupFormSchema),
	})

	if (submission.status !== 'success') {
		return json(submission.reply(), {
			status: submission.status === 'error' ? 400 : 200,
		})
	}

	const { giftGroupId } = submission.value

	switch (submission.value.intent) {
		case GiftGroupIdFormIntent.DeleteGiftGroup:
			await deleteGiftGroup(request, submission.value)
			return redirectWithToast('/groups', {
				type: 'success',
				title: 'Success',
				description: 'Group has been deleted.',
			})

		case GiftGroupIdFormIntent.CreateInviteLink:
			await createInviteLink(request, submission.value)
			return json(submission.reply(), {
				headers: await createToastHeaders({
					description: 'Invite link has been created.',
					type: 'success',
				}),
			})

		case GiftGroupIdFormIntent.DestroyInviteLink:
			await destroyInviteLink(request, giftGroupId, submission.value)
			return json(submission.reply(), {
				headers: await createToastHeaders({
					description: 'Invite link has been destroyed.',
					type: 'success',
				}),
			})

		case GiftGroupIdFormIntent.LeaveGiftGroup:
			await leaveGroup(request, giftGroupId)

			return redirectWithToast('/groups', {
				type: 'success',
				title: 'Success',
				description: 'You have left the group.',
			})
	}
}

export default function GiftGroupIndex() {
	const { giftGroup, canInvite, canDelete, canLeave } =
		useLoaderData<typeof loader>()

	return (
		<div>
			<SectionTitle>
				<div className="flex min-h-10 w-full content-between justify-between">
					<Heading>{giftGroup.name}</Heading>
					{(canInvite || canDelete || canLeave) && (
						<div className="flex gap-1">
							{canInvite && <CreateInviteLinkDialog />}
							{canDelete && <DeleteGroupDialog id={giftGroup.id} />}
							{canLeave && <LeaveGroupDialog id={giftGroup.id} />}
						</div>
					)}
				</div>
				<SectionSubtitle>
					<Subheading>{giftGroup.description}</Subheading>
				</SectionSubtitle>
			</SectionTitle>
			<div className="text-body-sm"></div>
			<div>
				<h2 className="mb-8 text-xl font-bold">Members</h2>
				<div className="flex flex-col gap-4">
					{giftGroup.groupMembers.map((groupMember) => (
						<Link
							to={`/users/${groupMember.user.username}`}
							className="flex items-center gap-2 bg-muted"
							key={groupMember.user.id}
						>
							<Avatar
								size={'s'}
								image={groupMember.user.image}
								user={groupMember.user}
							/>
							<div className="text-body-md">{groupMember.user.username}</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	)
}

function CreateInviteLinkDialog() {
	const { inviteLink, giftGroup } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: GiftGroupIdFormIntent.CreateInviteLink,
		lastResult: actionData,
		constraint: getZodConstraint(CreateInviteLinkFormSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreateInviteLinkFormSchema })
		},
		defaultValue: {
			expiresInDays: '7',
		},
	})

	const expiresInDays = useInputControl(fields.expiresInDays)

	const [hasCopied, setHasCopied] = useState(false)

	const debouncedReset = useDebounce(() => setHasCopied(false), 2000)

	const copyLink = () => {
		setHasCopied(true)
		debouncedReset()
		void navigator.clipboard.writeText(inviteLink!)
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
					{inviteLink ? (
						<div className="flex items-center space-x-2">
							<div className="grid flex-1 gap-2">
								<Label htmlFor="link" className="sr-only">
									Link
								</Label>
								<Input
									id="link"
									defaultValue={inviteLink}
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
							<input type="hidden" name="giftGroupId" value={giftGroup.id} />
							<div className="flex items-center">
								<div className="w-1/2">Link expires after</div>
								<div className="w-1/2">
									<Select
										value={expiresInDays.value}
										onValueChange={expiresInDays.change}
										defaultValue={fields.expiresInDays.initialValue}
										name={fields.expiresInDays.name}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select an expiration time" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup
												onFocus={expiresInDays.focus}
												onBlur={expiresInDays.blur}
											>
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
						{inviteLink ? (
							<DestroyInviteLinkButton />
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

function DestroyInviteLinkButton() {
	const { giftGroup, groupInvitationId } = useLoaderData<typeof loader>()
	const fetcher = useFetcher<typeof action>()
	const [form] = useForm({
		id: GiftGroupIdFormIntent.DestroyInviteLink,
		lastResult: fetcher.data,
		constraint: getZodConstraint(DestroyInviteLinkFormSchema),
	})
	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<input type="hidden" name="giftGroupId" value={giftGroup.id} />
			<input type="hidden" name="groupInvitationId" value={groupInvitationId} />
			<StatusButton
				status={
					fetcher.state === 'submitting' ? 'pending' : (form.status ?? 'idle')
				}
				disabled={fetcher.state !== 'idle'}
				value={GiftGroupIdFormIntent.DestroyInviteLink}
				form={form.id}
				variant="destructive"
				type="submit"
				name="intent"
			>
				Destroy link
			</StatusButton>
		</fetcher.Form>
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

function LeaveGroupDialog({ id }: { id: string }) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [form] = useForm({
		id: GiftGroupIdFormIntent.LeaveGiftGroup,
		lastResult: actionData,
	})

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant={'destructive'}>
					<Icon name="exit" className="scale-125 max-md:scale-150">
						<span className="max-md:hidden">Leave group</span>
					</Icon>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Leave group</DialogTitle>
					<DialogDescription>
						Are you sure you want to leave this group?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant={'secondary'} type="button">
							Cancel
						</Button>
					</DialogClose>
					<Form method="POST" {...getFormProps(form)}>
						<input type="hidden" name="giftGroupId" value={id} />
						<StatusButton
							type="submit"
							name="intent"
							value={GiftGroupIdFormIntent.LeaveGiftGroup}
							variant="destructive"
							status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
							disabled={isPending}
							className="w-full max-md:aspect-square max-md:px-0"
						>
							Leave group
						</StatusButton>
					</Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
