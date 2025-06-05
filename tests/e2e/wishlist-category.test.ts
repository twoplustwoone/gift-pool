import { expect, test } from '#tests/playwright-utils.ts'

test('user can create wishlist category and add item', async ({ page, login }) => {
  await login()
  await page.goto('/wishlist')

  await page.getByPlaceholder('New category').fill('Books')
  await page.getByRole('button', { name: /add category/i }).click()
  await expect(page.getByRole('heading', { name: 'Books' })).toBeVisible()

  const itemInputs = page.getByPlaceholder('Add item to your wishlist')
  await itemInputs.nth(1).fill('My Book')
  await page.getByRole('button', { name: 'Add Item' }).nth(1).click()
  await expect(page.getByText('My Book')).toBeVisible()
})
