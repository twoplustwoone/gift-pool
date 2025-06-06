import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { Wishlist } from '#app/components/wishlist'
import { action } from './__wishlist-item-editor.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			wishlistItems: { select: { id: true, title: true, ownerId: true } },
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

	return <Wishlist isOwner user={data.user} />
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
