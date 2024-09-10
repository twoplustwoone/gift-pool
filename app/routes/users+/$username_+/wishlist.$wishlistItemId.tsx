/* eslint-disable import/order */
import { parse } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithPermission } from '#app/utils/permissions.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'

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
