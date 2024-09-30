import { parse } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { type WishlistItem } from '@prisma/client'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { useActionData, useFetcher, useParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import {
	requireUserWithPermission,
	userHasPermission,
} from '#app/utils/permissions.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { useOptionalUser } from '#app/utils/user.ts'

const DeleteFormSchema = z.object({
	intent: z.literal('delete-wishlist-item'),
	wishlistItemId: z.string(),
})

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
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

	const { wishlistItemId } = submission.value

	const wishlistItem = await prisma.wishlistItem.findFirst({
		select: { id: true, ownerId: true, owner: { select: { username: true } } },
		where: { id: wishlistItemId },
	})
	invariantResponse(wishlistItem, 'Not found', { status: 404 })

	const isOwner = wishlistItem.ownerId === userId
	await requireUserWithPermission(
		request,
		isOwner ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
	)

	await prisma.wishlistItem.delete({ where: { id: wishlistItem.id } })

	return redirectWithToast(`/users/${wishlistItem.owner.username}/wishlist`, {
		type: 'success',
		title: 'Success',
		description: 'Your wishlist item has been deleted.',
	})
}

export function WishlistItem({
	wishlistItem,
}: {
	wishlistItem: Pick<WishlistItem, 'id' | 'value' | 'ownerId'>
}) {
	const user = useOptionalUser()
	const isOwner = user?.id === wishlistItem.ownerId
	const canDelete = userHasPermission(
		user,
		isOwner ? `delete:note:own` : `delete:note:any`,
	)

	return (
		<div className="group flex min-h-14 w-96 items-center justify-between rounded-xl px-4 py-2 text-base hover:bg-accent lg:text-xl">
			<div>{wishlistItem.value}</div>
			{canDelete && (
				<DeleteWishlistItem
					id={wishlistItem.id}
					className={'hidden group-hover:flex'}
				/>
			)}
		</div>
	)
}

export function DeleteWishlistItem({
	id,
	className,
}: {
	id: string
	className?: string
}) {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const fetcher = useFetcher()

	return (
		<fetcher.Form
			method="DELETE"
			action={`/wishlist/${id}`}
			className={className}
		>
			<AuthenticityTokenInput />
			<input type="hidden" name="wishlistItemId" value={id} />
			<StatusButton
				type="submit"
				name="intent"
				value="delete-wishlist-item"
				variant="destructive"
				status={isPending ? 'pending' : (actionData?.status ?? 'idle')}
				disabled={isPending}
				className="w-full max-md:aspect-square max-md:px-0"
			>
				<Icon name="trash" className="scale-125 max-md:scale-150"></Icon>
			</StatusButton>
		</fetcher.Form>
	)
}
