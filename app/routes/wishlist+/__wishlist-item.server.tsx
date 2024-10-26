import { parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithPermission } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { DeleteFormSchema } from './__wishlist-item'

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: DeleteFormSchema,
	})
	if (submission.status !== 'success') {
		return json(submission.reply(), {
			status: submission.status === 'error' ? 400 : 200,
		})
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
