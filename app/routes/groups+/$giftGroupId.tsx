import { useForm } from '@conform-to/react'
import { parse } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
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
import { SectionSubtitle } from '#app/components/ui/sectionSubtitle'
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	type GroupPermission,
	type GroupRole,
	groupRolePermissions,
	requireUserWithGroupPermission,
} from '#app/utils/group-permissions.server.ts'
import { getUserImgSrc, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { Subheading } from '../../components/ui/subheading'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const groupId = params.giftGroupId!
	const userId = await requireUserId(request)

	// Ensure the user is a member of the group and get their role
	const userInGroup = await prisma.usersInGiftGroups.findUnique({
		where: {
			userId_giftGroupId: { userId, giftGroupId: groupId },
		},
		select: { role: true },
	})

	if (!userInGroup) {
		throw json(
			{
				error: 'Unauthorized',
				message: `User is not a member of group ${groupId}`,
			},
			{ status: 403 },
		)
	}

	const currentUserRole = userInGroup.role as GroupRole
	const currentUserPermissions = groupRolePermissions[currentUserRole]

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

	invariantResponse(giftGroup, 'Not found', { status: 404 })

	return json({ giftGroup, currentUserRole, currentUserPermissions })
}

const DeleteFormSchema = z.object({
	intent: z.literal('delete-gift-group'),
	giftGroupId: z.string(),
})

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const submission = parse(formData, {
		schema: DeleteFormSchema,
	})

	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const { giftGroupId } = submission.value

	// Check if the user has the 'deleteGroup' permission in the group
	await requireUserWithGroupPermission(request, giftGroupId, 'deleteGroup')

	// Proceed with deleting the group
	await prisma.giftGroup.delete({ where: { id: giftGroupId } })

	return redirectWithToast(`/groups`, {
		type: 'success',
		title: 'Success',
		description: `Group has been deleted.`,
	})
}

export default function GiftGroup() {
	const data = useLoaderData<typeof loader>()
	const { giftGroup, currentUserPermissions } = data

	function hasPermission(permission: GroupPermission) {
		return currentUserPermissions.includes(permission)
	}

	const canDelete = hasPermission('deleteGroup')

	return (
		<div>
			<SectionTitle>
				<div className="flex min-h-10 w-full content-between justify-between">
					<Heading>{giftGroup.name}</Heading>
					{canDelete && <DeleteGroupDialog id={giftGroup.id} />}
				</div>
				<SectionSubtitle>
					<Subheading>{giftGroup.description}</Subheading>
				</SectionSubtitle>
			</SectionTitle>
			<div className="text-body-sm"></div>
			<div>
				<div className="text-xl font-bold">Members</div>
				{giftGroup.groupMembers.map(groupMember => (
					<div key={groupMember.user.id} className="flex items-center gap-2">
						<img
							src={getUserImgSrc(groupMember.user.image?.id)}
							alt={groupMember.user.name ?? groupMember.user.username}
							className="h-8 w-8 rounded-full object-cover"
						/>
						<div className="text-body-md">{groupMember.user.username}</div>
					</div>
				))}
			</div>
		</div>
	)
}

function DeleteGroupDialog({ id }: { id: string }) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [form] = useForm({
		id: 'delete-gift-group',
		lastSubmission: actionData?.submission,
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
					<Form method="POST" {...form.props}>
						<AuthenticityTokenInput />
						<input type="hidden" name="giftGroupId" value={id} />
						<StatusButton
							type="submit"
							name="intent"
							value="delete-gift-group"
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
