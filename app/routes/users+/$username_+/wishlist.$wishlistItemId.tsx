import { parse } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { json, type ActionFunctionArgs } from '@remix-run/node'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserId } from '#app/utils/auth.server.js'
import { validateCSRF } from '#app/utils/csrf.server.js'
import { z } from 'zod'
import { requireUserWithPermission } from '#app/utils/permissions.js'

const DeleteFormSchema = z.object({
	intent: z.literal('delete-note'),
	noteId: z.string(),
})

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const submission = parse(formData, {
		schema: DeleteFormSchema,
	})

	const { wishlistItemId } = submission.value

	await prisma.wishlistItem.delete({
		where: { id: wishlistItemId },
	})

	const wishlistItem = await prisma.wishlistItem.findFirst({
		select: { id: true, ownerId: true, owner: { select: { username: true } } },
		where: { id: wishlistItemId },
	})

	invariantResponse(wishlistItem, 'Not found', { status: 404 })

	const isOwner = wishlistItem.ownerId === userId
	await requireUserWithPermission(
		request,
		isOwner ? `delete:note:own` : `delete:note:any`,
	)

	await prisma.wishlistItem.delete({ where: { id: wishlistItem.id } })

	return json({ success: true, deletedItemId: wishlistItemId })
}
