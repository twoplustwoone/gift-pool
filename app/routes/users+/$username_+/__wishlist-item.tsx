import { type WishlistItem } from '@prisma/client'
import { useFetcher } from '@remix-run/react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'

export function WishlistItem({
	wishlistItem,
}: {
	wishlistItem: Pick<WishlistItem, 'id' | 'value'>
}) {
	const fetcher = useFetcher()

	return (
		<div className="group flex min-h-14 w-96 items-center justify-between rounded-xl px-4 py-2 text-base hover:bg-accent lg:text-xl">
			<div>{wishlistItem.value}</div>
			<fetcher.Form
				method="delete"
				action={`/users/$username_/wishlist/${wishlistItem.id}`}
			>
				<Button
					variant={'destructive'}
					size={'icon'}
					className="hidden cursor-pointer group-hover:flex"
					type="submit"
				>
					<Icon name="trash" className="h-6 w-6" />
				</Button>
			</fetcher.Form>
		</div>
	)
}
