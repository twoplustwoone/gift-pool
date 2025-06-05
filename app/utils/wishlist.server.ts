import { prisma } from './db.server.ts'

export async function createCategory(ownerId: string, name: string) {
  const position =
    (await prisma.wishlistCategory.count({ where: { ownerId } })) + 1
  return prisma.wishlistCategory.create({
    data: { ownerId, name, position },
  })
}

export async function listCategories(ownerId: string) {
  return prisma.wishlistCategory.findMany({
    where: { ownerId },
    orderBy: { position: 'asc' },
    include: { items: true },
  })
}

export async function addItemToCategory(itemId: string, categoryId: string) {
  return prisma.wishlistItem.update({ where: { id: itemId }, data: { categoryId } })
}

// TODO moveItemBetweenCategories
