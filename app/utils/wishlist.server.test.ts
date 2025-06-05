/**
 * @vitest-environment node
 */
import { expect, test } from 'vitest'
import { prisma } from './db.server'
import { createCategory, addItemToCategory, listCategories } from './wishlist.server'
import { createUser, createPassword } from '#tests/db-utils.ts'

// @vitest-environment node

test('create category and add item', async () => {
  const userData = createUser()
  const user = await prisma.user.create({
    data: {
      ...userData,
      password: { create: createPassword() },
      roles: { connect: { name: 'user' } },
    },
    select: { id: true },
  })

  const category = await createCategory(user.id, 'Test Cat')
  const item = await prisma.wishlistItem.create({
    data: { ownerId: user.id, title: 'gift' },
    select: { id: true },
  })

  await addItemToCategory(item.id, category.id)

  const categories = await listCategories(user.id)
  expect(categories).toHaveLength(1)
  expect(categories[0]?.items[0]?.id).toBe(item.id)
})
