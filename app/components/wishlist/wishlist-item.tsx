import { type WishlistItem as WishlistItemType } from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { z } from 'zod'
import { Button } from '#app/components/ui/button.tsx'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '#app/components/ui/dialog.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { useIsPending } from '#app/utils/misc.tsx'
import { useOptionalUser, userHasPermission } from '#app/utils/user.ts'

export const DeleteFormSchema = z.object({
	intent: z.literal('delete-wishlist-item'),
	wishlistItemId: z.string(),
})

export function WishlistItem({
	wishlistItem,
}: {
	wishlistItem: Pick<WishlistItemType, 'id' | 'title' | 'ownerId'>
}) {
	const user = useOptionalUser()
	const isOwner = user?.id === wishlistItem.ownerId
	const canDelete = userHasPermission(
		user,
		isOwner ? `delete:wishlistItem:own` : `delete:wishlistItem:any`,
	)

	return (
		<div className="group flex min-h-14 w-96 items-center justify-between rounded-xl px-4 py-2 text-base hover:bg-accent lg:text-xl">
			<div>{wishlistItem.title}</div>
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
	const isPending = useIsPending()
	const fetcher = useFetcher()

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="destructive" className={className}>
					<Icon name="trash" className="scale-125 max-md:scale-150" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Delete wishlist item</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this item? This action cannot be
						undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<fetcher.Form
						method="DELETE"
						action={`/wishlist/${id}`}
						className="flex w-full gap-4"
					>
						<input type="hidden" name="wishlistItemId" value={id} />
						<Button
							type="submit"
							name="intent"
							value="delete-wishlist-item"
							variant="destructive"
							disabled={isPending}
							className="flex-1"
						>
							Delete
						</Button>
					</fetcher.Form>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
