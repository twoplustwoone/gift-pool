import { json, type ActionFunctionArgs } from '@remix-run/node'
import { prisma } from '#app/utils/db.server.ts'

export async function action({ params }: ActionFunctionArgs) {
	const { wishlistItemId } = params

	await prisma.wishlistItem.delete({
		where: { id: wishlistItemId },
	})

	return json({ success: true, deletedItemId: wishlistItemId })
}
