import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { redirect, useLoaderData } from '@remix-run/react'
import { Wishlist } from '#app/routes/wishlist+/__wishlist.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUsersShareAGroup } from '#app/utils/groups.server.ts'

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { username } = params

	const userId = await requireUserId(request)
	await requireUsersShareAGroup({ userId, username: username! })
        const user = await prisma.user.findFirst({
                select: {
                        id: true,
                        name: true,
                        username: true,
                        wishlistItems: {
                                select: { id: true, title: true, ownerId: true },
                                where: { categoryId: null },
                        },
                        wishlistCategories: {
                                orderBy: { position: 'asc' },
                                select: {
                                        id: true,
                                        name: true,
                                        position: true,
                                        items: {
                                                select: {
                                                        id: true,
                                                        title: true,
                                                        ownerId: true,
                                                },
                                        },
                                },
                        },
                        image: { select: { id: true } },
                },
                where: { username },
        })

	invariantResponse(user, 'User not found', { status: 404 })

	if (user.id === userId) {
		return redirect('/wishlist')
	}

	return json({ user })
}

export default function UserWishlist() {
	const { user } = useLoaderData<typeof loader>()
	return <Wishlist isOwner={false} user={user} />
}
