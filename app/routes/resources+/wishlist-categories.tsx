import { type ActionFunctionArgs, json } from '@remix-run/node'
import { requireUserId } from '#app/utils/auth.server.ts'
import { createCategory } from '#app/utils/wishlist.server.ts'

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request)
  const formData = await request.formData()
  const name = formData.get('name')
  if (typeof name !== 'string' || !name) {
    return json({ error: 'Name required' }, { status: 400 })
  }
  const category = await createCategory(userId, name)
  return json({ category })
}
