import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { useOptionalUser } from '#app/utils/user.ts'
import { WishlistItem } from './__wishlist-item'
import { WishlistItemEditor, action } from './__wishlist-item-editor'

export async function loader({ params }: LoaderFunctionArgs) {
	const owner = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			wishlistItems: { select: { id: true, value: true, ownerId: true } },
			image: { select: { id: true } },
		},
		where: { username: params.username },
	})

	invariantResponse(owner, 'Owner not found', { status: 404 })

	return json({ owner })
}

export { action }

export default function WishlistRoute() {
	const data = useLoaderData<typeof loader>()
	const user = useOptionalUser()
	const isOwner = user?.id === data.owner.id
	const ownerDisplayName = data.owner.name ?? data.owner.username

	return (
		<main className="container flex h-full min-h-[400px] px-0 pb-12 md:px-8">
			<div className="grid w-full bg-muted pl-2 md:container md:rounded-3xl md:pr-0">
				<div>
					<div>
						<Link
							to={`/users/${data.owner.username}`}
							className="flex flex-col items-center justify-center gap-2 bg-muted pb-4 pl-8 pr-4 pt-12 lg:flex-row lg:justify-start lg:gap-4"
						>
							<img
								src={getUserImgSrc(data.owner.image?.id)}
								alt={ownerDisplayName}
								className="h-16 w-16 rounded-full object-cover lg:h-24 lg:w-24"
							/>
							<h1 className="text-center text-base font-bold md:text-lg lg:text-left lg:text-2xl">
								{ownerDisplayName}'s Wishlist
							</h1>
						</Link>
						{
							<div>
								{isOwner ? <WishlistItemEditor /> : null}
								{data.owner.wishlistItems.length === 0 ? (
									<div className="flex w-full flex-col items-center justify-center">
										{isOwner ? (
											<p className="text-center text-base text-slate-500">
												Looks like you don't have any items in your wishlist
												yet! You don't want stuff? Really?
											</p>
										) : (
											<p className="text-center text-base text-slate-500">
												Oh no! {ownerDisplayName} doesn't have any items in
												their wishlist yet! Maybe you should throw something at
												them? 🤔
											</p>
										)}
									</div>
								) : (
									<ul className="overflow-y-auto overflow-x-hidden pb-12">
										{data.owner.wishlistItems.map(wishlistItem => (
											<li key={wishlistItem.id}>
												<WishlistItem wishlistItem={wishlistItem} />
											</li>
										))}
									</ul>
								)}
							</div>
						}
					</div>
				</div>
			</div>
		</main>
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
