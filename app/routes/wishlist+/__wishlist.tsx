import {
	type User,
	type UserImage,
	type WishlistItem as WishlistItemType,
} from '@prisma/client'
import { Link, useFetcher } from '@remix-run/react'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { WishlistItem } from './__wishlist-item'
import { WishlistItemEditor } from './__wishlist-item-editor'

export function Wishlist({
	user,
	isOwner,
}: {
        user: Pick<User, 'username' | 'name'> & {
                image: Pick<UserImage, 'id'> | null
                wishlistItems: Pick<WishlistItemType, 'id' | 'title' | 'ownerId'>[]
                wishlistCategories: {
                        id: string
                        name: string
                        position: number
                        items: Pick<WishlistItemType, 'id' | 'title' | 'ownerId'>[]
                }[]
        }
	isOwner: boolean
}) {
       const displayName = user.name ?? user.username
       const addCategoryFetcher = useFetcher()
	return (
		<div>
			<Link
				to={`/users/${user.username}`}
				className="flex flex-col items-center justify-center gap-2 bg-muted pb-4 pl-8 pr-4 pt-12 lg:flex-row lg:justify-start lg:gap-4"
			>
				<img
					src={getUserImgSrc(user.image?.id)}
					alt={displayName}
					className="h-16 w-16 rounded-full object-cover lg:h-24 lg:w-24"
				/>
				<h1 className="text-center text-base font-bold md:text-lg lg:text-left lg:text-2xl">
					{displayName}'s Wishlist
				</h1>
			</Link>
                        <div className="space-y-4">
                                {isOwner && (
                                        <addCategoryFetcher.Form method="POST" action="/resources/wishlist-categories" className="flex gap-2">
                                                <input name="name" className="flex-1 rounded border px-2" placeholder="New category" />
                                                <button type="submit">➕ Add category</button>
                                        </addCategoryFetcher.Form>
                                )}
                                {isOwner && <WishlistItemEditor />}
                                {user.wishlistCategories.map((category) => (
                                        <div key={category.id} className="rounded-md border p-2">
                                                <div className="mb-2 flex items-center justify-between">
                                                        <h2 className="font-semibold">{category.name}</h2>
                                                        {isOwner && (
                                                                <WishlistItemEditor wishlistItem={{ categoryId: category.id, id: '', title: '' }} />
                                                        )}
                                                </div>
                                                {category.items.length ? (
                                                        <ul className="overflow-x-hidden pb-2">
                                                                {category.items.map((wishlistItem) => (
                                                                        <li key={wishlistItem.id}>
                                                                                <WishlistItem wishlistItem={wishlistItem} />
                                                                        </li>
                                                                ))}
                                                        </ul>
                                                ) : (
                                                        <p className="text-sm text-slate-500">No items</p>
                                                )}
                                        </div>
                                ))}
                                {user.wishlistItems.length ? (
                                        <ul className="overflow-y-auto overflow-x-hidden pb-12">
                                                {user.wishlistItems.map((wishlistItem) => (
                                                        <li key={wishlistItem.id}>
                                                                <WishlistItem wishlistItem={wishlistItem} />
                                                        </li>
                                                ))}
                                        </ul>
                                ) : null}
                                {user.wishlistItems.length === 0 && user.wishlistCategories.length === 0 && (
                                        <div className="flex w-full flex-col items-center justify-center">
                                                {isOwner ? (
                                                        <p className="text-center text-base text-slate-500">
                                                                Looks like you don't have any items in your wishlist yet! You
                                                                don't want stuff? Really?
                                                        </p>
                                                ) : (
                                                        <p className="text-center text-base text-slate-500">
                                                                {displayName} doesn't have any items in their wishlist yet!
                                                        </p>
                                                )}
                                        </div>
                                )}
                        </div>
		</div>
	)
}
