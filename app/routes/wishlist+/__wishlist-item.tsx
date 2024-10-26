import { type WishlistItem } from '@prisma/client'
import { useActionData, useFetcher } from '@remix-run/react'
import { z } from 'zod'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { useIsPending } from '#app/utils/misc.tsx'
import { useOptionalUser, userHasPermission } from '#app/utils/user.ts'
import { type action } from './__wishlist-item.server'

export const DeleteFormSchema = z.object({
	intent: z.literal('delete-wishlist-item'),
	wishlistItemId: z.string(),
})

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
