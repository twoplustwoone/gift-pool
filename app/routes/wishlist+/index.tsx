import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { WishlistItem } from './__wishlist-item'
import { WishlistItemEditor, action } from './__wishlist-item-editor'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			wishlistItems: { select: { id: true, value: true, ownerId: true } },
			image: { select: { id: true } },
		},
		where: { id: userId },
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return json({ user })
}

export { action }

export default function WishlistIndex() {
	const data = useLoaderData<typeof loader>()
	const displayName = data.user.name ?? data.user.username
	return (
		<div>
			<Link
				to={`/users/${data.user.username}`}
				className="flex flex-col items-center justify-center gap-2 bg-muted pb-4 pl-8 pr-4 pt-12 lg:flex-row lg:justify-start lg:gap-4"
			>
				<img
					src={getUserImgSrc(data.user.image?.id)}
					alt={displayName}
					className="h-16 w-16 rounded-full object-cover lg:h-24 lg:w-24"
				/>
				<h1 className="text-center text-base font-bold md:text-lg lg:text-left lg:text-2xl">
					{displayName}'s Wishlist
				</h1>
			</Link>
			<div>
				<WishlistItemEditor />
				{data.user.wishlistItems.length === 0 ? (
					<div className="flex w-full flex-col items-center justify-center">
						<p className="text-center text-base text-slate-500">
							Looks like you don't have any items in your wishlist yet! You
							don't want stuff? Really?
						</p>
					</div>
				) : (
					<ul className="overflow-y-auto overflow-x-hidden pb-12">
						{data.user.wishlistItems.map(wishlistItem => (
							<li key={wishlistItem.id}>
								<WishlistItem wishlistItem={wishlistItem} />
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<p>No user with the username "{params.username}" exists</p>
				),
			}}
		/>
	)
}
