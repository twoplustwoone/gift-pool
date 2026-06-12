import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import {
	cleanupDb,
	createPassword,
	getUserImages,
	img,
} from '#tests/db-utils.ts'
import { ensureNotificationPreferencesForUser } from '#app/utils/notification-preferences.server.ts'
import {
	POOL_STATUS,
	DECISION_MODE,
	OCCASION_TYPE,
} from '#app/utils/pool-constants.ts'
import { NOTIFICATION_TYPES } from '#app/utils/notification-registry.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

const daysFromNow = (days: number, { atHour = 12 }: { atHour?: number } = {}) => {
	const d = new Date()
	d.setDate(d.getDate() + days)
	d.setHours(atHour, 0, 0, 0)
	return d
}

const minutesAgo = (mins: number) => new Date(Date.now() - mins * 60 * 1000)
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000)
const daysAgo = (days: number) => daysFromNow(-days)

// Build a "birthday" whose month/day lands `daysAhead` from now, for a given age.
// The app's Upcoming Birthdays card uses month+day and ignores year, so this
// lets us deterministically cluster birthdays in the next 60 days.
const birthdayInDays = (daysAhead: number, age = 30) => {
	const d = daysFromNow(daysAhead)
	d.setFullYear(d.getFullYear() - age)
	return d
}

// Friendship stores one row per pair with sorted ids in (userAId, userBId).
// The relationship helpers in `friends.server.ts` query both sides, so any
// consistent ordering works — we sort to satisfy the @@unique constraint
// regardless of which direction we pass the ids in.
const makeFriendship = (aId: string, bId: string) => {
	const userAId = aId < bId ? aId : bId
	const userBId = aId < bId ? bId : aId
	return prisma.friendship.create({ data: { userAId, userBId } })
}

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	console.time('🧹 Cleaned up the database...')
	await cleanupDb(prisma)
	console.timeEnd('🧹 Cleaned up the database...')

	// ── Permissions + roles ─────────────────────────────────────────────────────
	console.time('🔑 Created permissions...')
	const entities = ['user', 'wishlistItem', 'giftGroup']
	const actions = ['create', 'read', 'update', 'delete']
	const accesses = ['own', 'any'] as const
	for (const entity of entities) {
		for (const action of actions) {
			for (const access of accesses) {
				await prisma.permission.create({ data: { entity, action, access } })
			}
		}
	}
	console.timeEnd('🔑 Created permissions...')

	console.time('👑 Created roles...')
	await prisma.role.create({
		data: {
			name: 'admin',
			permissions: {
				connect: await prisma.permission.findMany({
					select: { id: true },
					where: { access: 'any' },
				}),
			},
		},
	})
	await prisma.role.create({
		data: {
			name: 'user',
			permissions: {
				connect: await prisma.permission.findMany({
					select: { id: true },
					where: { access: 'own' },
				}),
			},
		},
	})
	console.timeEnd('👑 Created roles...')

	// ── Named seed users ────────────────────────────────────────────────────────
	console.time('👤 Created named users...')
	const userImages = await getUserImages()

	// Grab a handful of user-portrait JPEGs to reuse as wishlist item fixture
	// images. They're not "real" item photos but they exercise the exact same
	// storage / `hasImage=true` / `imageSource=UPLOAD` / binary-blob pipeline
	// the production upload path uses, so the item card UI renders with real
	// bytes instead of broken-image states.
	const itemImageBlobs = userImages.slice(0, 5)
	const itemImage = (index: number) => ({
		image: itemImageBlobs[index % itemImageBlobs.length]!.blob,
		hasImage: true,
		imageSource: 'UPLOAD',
	})

	// Wade — dev login, admin, deadpool avatar
	const wadeImage = await img({
		filepath: './tests/fixtures/images/user/wade.png',
	})
	const wade = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'wade@example.com',
			username: 'wade',
			name: 'Wade Wilson',
			image: { create: wadeImage },
			password: { create: createPassword('maximumeffort') },
			roles: { connect: [{ name: 'admin' }, { name: 'user' }] },
			bio: 'Mercenary with a mouth. Accepting chimichangas and katana sharpeners.',
			birthday: birthdayInDays(45, 34), // show up in Home? No — 45 days < 60, so yes
			// birthdayVisibility defaults to FRIENDS
			address: {
				create: {
					street: '1991 Chimichanga Lane',
					city: 'Regeneropolis',
					state: 'CA',
					zip: '90210',
					country: 'USA',
				},
			},
		},
	})
	await ensureNotificationPreferencesForUser(wade.id)

	// Marco — birthday in +22 days. Lives in Book Club with Wade (see below),
	// but intentionally NOT in The Crew because that's his birthday pool.
	const marco = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'marco@example.com',
			username: 'marco',
			name: 'Marco Rodríguez',
			image: { create: userImages[0] },
			password: { create: createPassword('marco') },
			roles: { connect: { name: 'user' } },
			bio: 'Third-wave coffee evangelist. Currently obsessed with cold brew.',
			birthday: birthdayInDays(22, 31),
		},
	})
	await ensureNotificationPreferencesForUser(marco.id)

	// NP — The Crew member. Birthday in +37 days.
	const np = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'np@example.com',
			username: 'np',
			name: 'NP',
			image: { create: userImages[1] },
			password: { create: createPassword('np') },
			roles: { connect: { name: 'user' } },
			// Exercises EVERYONE — her birthday is visible to anyone rendering her.
			birthdayVisibility: 'EVERYONE',
			birthday: birthdayInDays(37, 28),
		},
	})
	await ensureNotificationPreferencesForUser(np.id)

	// Alvaro — The Crew member. Birthday in +54 days (edge: just inside window).
	const alvaro = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'alvaro@example.com',
			username: 'alvaro',
			name: 'Alvaro Méndez',
			image: { create: userImages[2] },
			password: { create: createPassword('alvaro') },
			roles: { connect: { name: 'user' } },
			bio: 'Vinyl collector, espresso tinkerer, occasional sourdough failure.',
			birthday: birthdayInDays(54, 29),
		},
	})
	await ensureNotificationPreferencesForUser(alvaro.id)

	// Sofia — The Crew member. Birthday in +88 days (edge: OUTSIDE 60-day
	// window). This is deliberate — we want at least one friend whose birthday
	// shouldn't appear on the Home card so we can verify the filter.
	const sofia = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'sofia@example.com',
			username: 'sofia',
			name: 'Sofía Vargas',
			image: { create: userImages[3] },
			password: { create: createPassword('sofia') },
			roles: { connect: { name: 'user' } },
			birthday: birthdayInDays(88, 32),
		},
	})
	await ensureNotificationPreferencesForUser(sofia.id)

	// Hana — Book Club. Birthday TOMORROW (imminent edge case).
	// Wade's friend. Rich wishlist + past items.
	const hana = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'hana@example.com',
			username: 'hana',
			name: 'Hana Okafor',
			image: { create: userImages[4] },
			password: { create: createPassword('hana') },
			roles: { connect: { name: 'user' } },
			bio: 'Bookworm, amateur potter, and permanent tea-forward.',
			// Exercises NOBODY — her birthday should be hidden everywhere even
			// though she has one in the DB and is a friend of Wade.
			birthdayVisibility: 'NOBODY',
			birthday: birthdayInDays(1, 27),
		},
	})
	await ensureNotificationPreferencesForUser(hana.id)

	// Leo — Wade's friend, deliberately empty wishlist (edge case). Book Club.
	// Birthday in +25 days.
	const leo = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'leo@example.com',
			username: 'leo',
			name: 'Leonardo Bianchi',
			image: { create: userImages[5] },
			password: { create: createPassword('leo') },
			roles: { connect: { name: 'user' } },
			birthday: birthdayInDays(25, 33),
		},
	})
	await ensureNotificationPreferencesForUser(leo.id)

	// Zoe — NOT Wade's friend. Has sent Wade a pending friend request.
	// Has a small wishlist which Wade should NOT be able to see until accept.
	const zoe = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'zoe@example.com',
			username: 'zoe',
			name: 'Zoe Whitfield',
			image: { create: userImages[6] },
			password: { create: createPassword('zoe') },
			roles: { connect: { name: 'user' } },
			birthday: birthdayInDays(200, 26),
		},
	})
	await ensureNotificationPreferencesForUser(zoe.id)

	// Ben — NOT Wade's friend. Wade has sent them a pending friend request.
	const ben = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'ben@example.com',
			username: 'ben',
			name: 'Benjamin Park',
			image: { create: userImages[7] },
			password: { create: createPassword('ben') },
			roles: { connect: { name: 'user' } },
			birthday: birthdayInDays(150, 36),
		},
	})
	await ensureNotificationPreferencesForUser(ben.id)

	console.timeEnd('👤 Created named users...')

	// ── Friendships ─────────────────────────────────────────────────────────────
	// IMPORTANT: these must exist BEFORE any WishlistPurchase is seeded — the
	// wishlist page loader runs `cleanupWishlistPurchasesForOwner` on load and
	// will delete any purchase whose purchaser isn't a friend or in a shared
	// group with the owner.
	console.time('🤝 Created friendships...')

	// Wade's inner circle
	await makeFriendship(wade.id, marco.id)
	await makeFriendship(wade.id, np.id)
	await makeFriendship(wade.id, alvaro.id)
	await makeFriendship(wade.id, sofia.id)
	await makeFriendship(wade.id, hana.id)
	await makeFriendship(wade.id, leo.id)

	// Cross-connections inside The Crew (so friend-of-friend flows work)
	await makeFriendship(np.id, alvaro.id)
	await makeFriendship(np.id, sofia.id)
	await makeFriendship(alvaro.id, sofia.id)

	// Hana knows Sofia independently — gives us a "mutual friend" for UX bits
	await makeFriendship(hana.id, sofia.id)

	console.timeEnd('🤝 Created friendships...')

	// ── Pending friend requests ─────────────────────────────────────────────────
	console.time('✉️  Created pending friend requests...')

	// Zoe → Wade (Wade has an incoming request)
	const zoeToWadeRequest = await prisma.friendRequest.create({
		data: {
			fromUserId: zoe.id,
			toUserId: wade.id,
			status: 'PENDING',
		},
	})

	// Wade → Ben (Wade has an outgoing request)
	await prisma.friendRequest.create({
		data: {
			fromUserId: wade.id,
			toUserId: ben.id,
			status: 'PENDING',
		},
	})

	console.timeEnd('✉️  Created pending friend requests...')

	// ── Gift groups ─────────────────────────────────────────────────────────────
	console.time('👥 Created gift groups...')

	const friendGroup = await prisma.giftGroup.create({
		data: {
			name: 'The Crew',
			description:
				'Scattered across three continents, but still the same group chat.',
			groupMembers: {
				create: [
					{ userId: wade.id, role: 'OWNER', contributionCents: 3000 },
					{ userId: np.id, role: 'MEMBER', contributionCents: 2500 },
					{ userId: alvaro.id, role: 'MEMBER', contributionCents: 2000 },
					{ userId: sofia.id, role: 'MEMBER', contributionCents: 2000 },
				],
			},
		},
	})

	// Book Club — gives Wade a shared-group context with Marco + Hana + Leo so
	// their birthdays can surface on Home (which is membership-based) and so
	// past-item purchases by Marco/Hana pass the wishlist cleanup filter.
	await prisma.giftGroup.create({
		data: {
			name: 'Book Club',
			description: 'Meets monthly, reads inconsistently.',
			groupMembers: {
				create: [
					{ userId: wade.id, role: 'OWNER', contributionCents: 1500 },
					{ userId: marco.id, role: 'MEMBER', contributionCents: 1500 },
					{ userId: hana.id, role: 'MEMBER', contributionCents: 1500 },
					{ userId: leo.id, role: 'MEMBER', contributionCents: 1500 },
				],
			},
		},
	})

	console.timeEnd('👥 Created gift groups...')

	// ── Wade's wishlist categories + active items ──────────────────────────────
	console.time('💝 Created Wade\'s wishlist...')

	const wadeTech = await prisma.wishlistCategory.create({
		data: { ownerId: wade.id, name: 'Tech', order: 0 },
	})
	const wadeHome = await prisma.wishlistCategory.create({
		data: { ownerId: wade.id, name: 'Home', order: 1 },
	})
	const wadeBooks = await prisma.wishlistCategory.create({
		data: { ownerId: wade.id, name: 'Books', order: 2 },
	})
	const wadeExperiences = await prisma.wishlistCategory.create({
		data: { ownerId: wade.id, name: 'Experiences', order: 3 },
	})

	// Active (non-archived) items spread across categories.
	// Variety: images/no-images, long titles, long notes, various URL hosts,
	// items without a URL, items without a note.
	await prisma.wishlistItem.createMany({
		data: [
			// ── Tech ───────────────────────────────────────────────────────────
			{
				ownerId: wade.id,
				categoryId: wadeTech.id,
				sortOrder: 0,
				title: 'Sony WH-1000XM5 over-ear noise-cancelling headphones',
				note: 'Black preferred. The XM4 are fine but these have better mic quality for calls.',
				url: 'https://www.sony.com/electronics/headband-headphones/wh-1000xm5',
				type: 'text',
				priceCents: 39_999,
				currency: 'USD',
				...itemImage(0),
			},
			{
				ownerId: wade.id,
				categoryId: wadeTech.id,
				sortOrder: 1,
				title: 'Keychron Q1 Pro (ISO layout)',
				note: 'Black knob version. Gateron Jupiter Browns if available.',
				url: 'https://www.keychron.com/products/keychron-q1-pro-qmk-via-wireless-custom-mechanical-keyboard',
				type: 'text',
				priceCents: 21_900,
				currency: 'USD',
			},
			{
				ownerId: wade.id,
				categoryId: wadeTech.id,
				sortOrder: 2,
				title: '27" 4K monitor',
				note: 'Any brand with USB-C power delivery. LG 27UP850N-W is on my radar.',
				url: 'https://www.lg.com/us/monitors/lg-27up850n-w',
				type: 'text',
				...itemImage(1),
			},
			{
				ownerId: wade.id,
				categoryId: wadeTech.id,
				sortOrder: 3,
				title: 'Anker 737 power bank',
				url: 'https://www.anker.com/products/a1289',
				type: 'text',
			},
			{
				ownerId: wade.id,
				categoryId: wadeTech.id,
				sortOrder: 4,
				title: 'USB-C cable organizer',
				type: 'text', // no URL, no note — minimal-info edge case
			},
			// ── Home ───────────────────────────────────────────────────────────
			{
				ownerId: wade.id,
				categoryId: wadeHome.id,
				sortOrder: 0,
				title: 'Lodge 12" pre-seasoned cast iron skillet',
				note: 'The heavy one. Already have the 10".',
				url: 'https://www.lodgecastiron.com/product/seasoned-cast-iron-skillet?sku=L10SK3',
				type: 'text',
				...itemImage(2),
			},
			{
				ownerId: wade.id,
				categoryId: wadeHome.id,
				sortOrder: 1,
				title: 'Aeropress Original',
				note: 'Mine cracked.',
				url: 'https://aeropress.com/products/aeropress-coffee-maker',
				type: 'text',
			},
			{
				ownerId: wade.id,
				categoryId: wadeHome.id,
				sortOrder: 2,
				title: 'Merino wool throw blanket',
				note: 'Something natural-colored. 50"x70" or bigger.',
				type: 'text',
			},
			{
				ownerId: wade.id,
				categoryId: wadeHome.id,
				sortOrder: 3,
				title: 'Ceramic planter for the monstera (10–12")',
				type: 'text',
			},
			// ── Books ──────────────────────────────────────────────────────────
			{
				ownerId: wade.id,
				categoryId: wadeBooks.id,
				sortOrder: 0,
				title: 'The Lord of the Rings (illustrated 70th anniversary edition)',
				note: 'The Alan Lee illustrated hardcover. Only the complete set, not just Fellowship.',
				url: 'https://www.harpercollins.com/products/the-lord-of-the-rings-illustrated-edition-j-r-r-tolkien',
				type: 'text',
				...itemImage(3),
			},
			{
				ownerId: wade.id,
				categoryId: wadeBooks.id,
				sortOrder: 1,
				title: 'Designing Data-Intensive Applications — Martin Kleppmann',
				url: 'https://dataintensive.net/',
				type: 'text',
			},
			{
				ownerId: wade.id,
				categoryId: wadeBooks.id,
				sortOrder: 2,
				title: 'The Name of the Wind (paperback)',
				type: 'text',
			},
			{
				ownerId: wade.id,
				categoryId: wadeBooks.id,
				sortOrder: 3,
				title: 'Blood, Sweat, and Pixels',
				note: 'Jason Schreier. I keep meaning to read it.',
				type: 'text',
			},
			// ── Experiences ────────────────────────────────────────────────────
			{
				ownerId: wade.id,
				categoryId: wadeExperiences.id,
				sortOrder: 0,
				title: 'Indoor bouldering gym day pass + shoe rental',
				note: 'Anywhere local is fine.',
				type: 'text',
			},
			{
				ownerId: wade.id,
				categoryId: wadeExperiences.id,
				sortOrder: 1,
				title: 'Concert tickets — whoever is playing nearby',
				type: 'text',
			},
			{
				ownerId: wade.id,
				categoryId: wadeExperiences.id,
				sortOrder: 2,
				title: 'Pasta-making class for two',
				note: 'Eataly runs these, or any local cooking school.',
				url: 'https://www.eataly.com/us_en/experiences/cooking-classes',
				type: 'text',
				...itemImage(4),
			},
		],
	})

	console.timeEnd('💝 Created Wade\'s wishlist...')

	// ── Wade's past (archived) items + purchases ───────────────────────────────
	// These model "someone already got me this — move it to past items". The
	// main wishlist view hides ARCHIVED items; the Past items tab shows them.
	// Each archived item has a matching WishlistPurchase so we can render
	// "purchased by X" + relative dates.
	console.time('📦 Created Wade\'s past items...')

	const wadePast1 = await prisma.wishlistItem.create({
		data: {
			ownerId: wade.id,
			categoryId: wadeTech.id,
			sortOrder: 100,
			title: 'Logitech MX Master 3S',
			note: 'Finally upgraded from the MX Anywhere 2S.',
			url: 'https://www.logitech.com/en-us/products/mice/mx-master-3s.html',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(3),
			...itemImage(0),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: wadePast1.id,
			purchasedById: marco.id,
			createdAt: daysAgo(3),
		},
	})

	const wadePast2 = await prisma.wishlistItem.create({
		data: {
			ownerId: wade.id,
			categoryId: wadeBooks.id,
			sortOrder: 101,
			title: 'The Lean Startup',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(12),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: wadePast2.id,
			purchasedById: np.id,
			createdAt: daysAgo(12),
		},
	})

	const wadePast3 = await prisma.wishlistItem.create({
		data: {
			ownerId: wade.id,
			categoryId: wadeHome.id,
			sortOrder: 102,
			title: 'Fellow Stagg EKG electric kettle',
			note: 'Matte black.',
			url: 'https://fellowproducts.com/products/staggekg-electric-pour-over-kettle',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(28),
			...itemImage(1),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: wadePast3.id,
			purchasedById: alvaro.id,
			createdAt: daysAgo(28),
		},
	})

	const wadePast4 = await prisma.wishlistItem.create({
		data: {
			ownerId: wade.id,
			categoryId: wadeExperiences.id,
			sortOrder: 103,
			title: 'Hot air balloon ride over Cappadocia',
			note: 'Honeymoon throwback. This was a wild one.',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(60),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: wadePast4.id,
			purchasedById: hana.id,
			createdAt: daysAgo(60),
		},
	})

	const wadePast5 = await prisma.wishlistItem.create({
		data: {
			ownerId: wade.id,
			categoryId: wadeBooks.id,
			sortOrder: 104,
			title: 'A Gentleman in Moscow',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(120),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: wadePast5.id,
			purchasedById: np.id,
			createdAt: daysAgo(120),
		},
	})

	const wadePast6 = await prisma.wishlistItem.create({
		data: {
			ownerId: wade.id,
			categoryId: wadeTech.id,
			sortOrder: 105,
			title: 'Magic Trackpad',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(200),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: wadePast6.id,
			purchasedById: marco.id,
			createdAt: daysAgo(200),
		},
	})

	console.timeEnd('📦 Created Wade\'s past items...')

	// ── Friends' wishlists ─────────────────────────────────────────────────────
	console.time('💝 Created friends\' wishlists...')

	// Marco — categorized, mix of images
	const marcoFavourites = await prisma.wishlistCategory.create({
		data: { ownerId: marco.id, name: 'Top of the list', order: 0 },
	})
	await prisma.wishlistItem.createMany({
		data: [
			{
				ownerId: marco.id,
				categoryId: marcoFavourites.id,
				sortOrder: 0,
				title: 'Sony WH-1000XM5 Headphones',
				note: 'Black colourway.',
				url: 'https://www.sony.com/en/articles/wh-1000xm5',
				type: 'text',
				...itemImage(0),
			},
			{
				ownerId: marco.id,
				categoryId: marcoFavourites.id,
				sortOrder: 1,
				title: 'Kindle Paperwhite (32GB, no ads)',
				url: 'https://www.amazon.com/kindle-paperwhite',
				type: 'text',
			},
			{
				ownerId: marco.id,
				categoryId: marcoFavourites.id,
				sortOrder: 2,
				title: 'AeroPress Coffee Maker',
				url: 'https://aeropress.com',
				type: 'text',
			},
			{
				ownerId: marco.id,
				sortOrder: 3,
				title: 'Running socks (bulk pack)',
				note: 'Any merino brand.',
				type: 'text',
			},
			{
				ownerId: marco.id,
				sortOrder: 4,
				title: 'Italian espresso cups set',
				type: 'text',
				...itemImage(2),
			},
			{
				ownerId: marco.id,
				sortOrder: 5,
				title: 'A really well-made cutting board',
				type: 'text',
			},
			{
				ownerId: marco.id,
				sortOrder: 6,
				title: 'New running shoes (size 10.5)',
				note: 'Saucony Endorphin Speed 4 preferred.',
				url: 'https://www.saucony.com/en/endorphin-speed-4',
				type: 'text',
			},
		],
	})

	// NP — two categories, more utilitarian
	const npGear = await prisma.wishlistCategory.create({
		data: { ownerId: np.id, name: 'Gear', order: 0 },
	})
	const npFood = await prisma.wishlistCategory.create({
		data: { ownerId: np.id, name: 'Food & drink', order: 1 },
	})
	await prisma.wishlistItem.createMany({
		data: [
			{
				ownerId: np.id,
				categoryId: npGear.id,
				sortOrder: 0,
				title: 'Patagonia Nano Puff jacket (M, navy)',
				url: 'https://www.patagonia.com/product/mens-nano-puff-hoody',
				type: 'text',
				...itemImage(3),
			},
			{
				ownerId: np.id,
				categoryId: npGear.id,
				sortOrder: 1,
				title: 'Daypack (20–25L)',
				note: 'Prefer something minimal, no giant brand logo.',
				type: 'text',
			},
			{
				ownerId: np.id,
				categoryId: npGear.id,
				sortOrder: 2,
				title: 'Leatherman Wave+',
				type: 'text',
			},
			{
				ownerId: np.id,
				categoryId: npFood.id,
				sortOrder: 0,
				title: 'Single-origin coffee subscription (3 months)',
				type: 'text',
			},
			{
				ownerId: np.id,
				categoryId: npFood.id,
				sortOrder: 1,
				title: 'Japanese whisky — Nikka From The Barrel',
				url: 'https://www.nikka.com/eng/brands/nikka-from-the-barrel',
				type: 'text',
			},
			{
				ownerId: np.id,
				categoryId: npFood.id,
				sortOrder: 2,
				title: 'Good olive oil (don\'t cheap out)',
				type: 'text',
			},
		],
	})

	// Alvaro — NO categories (exercises the Default/Uncategorized rendering)
	await prisma.wishlistItem.createMany({
		data: [
			{
				ownerId: alvaro.id,
				sortOrder: 0,
				title: 'Vinyl record — any early Sabbath',
				type: 'text',
			},
			{
				ownerId: alvaro.id,
				sortOrder: 1,
				title: 'Espresso tamper (58mm)',
				type: 'text',
				...itemImage(4),
			},
			{
				ownerId: alvaro.id,
				sortOrder: 2,
				title: 'A pair of good slippers',
				note: 'The kind you wear on hardwood without sliding.',
				type: 'text',
			},
			{
				ownerId: alvaro.id,
				sortOrder: 3,
				title: 'Fermentation crock (2L)',
				type: 'text',
			},
			{
				ownerId: alvaro.id,
				sortOrder: 4,
				title: 'Gift card to the bookshop on the corner',
				type: 'text',
			},
		],
	})

	// Sofia — three categories, longer and more detailed
	const sofiaArt = await prisma.wishlistCategory.create({
		data: { ownerId: sofia.id, name: 'Art & craft', order: 0 },
	})
	const sofiaKitchen = await prisma.wishlistCategory.create({
		data: { ownerId: sofia.id, name: 'Kitchen', order: 1 },
	})
	const sofiaOutdoors = await prisma.wishlistCategory.create({
		data: { ownerId: sofia.id, name: 'Outdoors', order: 2 },
	})
	await prisma.wishlistItem.createMany({
		data: [
			{
				ownerId: sofia.id,
				categoryId: sofiaArt.id,
				sortOrder: 0,
				title: 'Watercolor paper (Arches 300gsm cold-press block)',
				url: 'https://www.arches-papers.com/',
				type: 'text',
				...itemImage(0),
			},
			{
				ownerId: sofia.id,
				categoryId: sofiaArt.id,
				sortOrder: 1,
				title: 'A nice fountain pen (medium nib)',
				note: 'Something in the $80–150 range. Lamy 2000 or Pilot Vanishing Point.',
				type: 'text',
			},
			{
				ownerId: sofia.id,
				categoryId: sofiaKitchen.id,
				sortOrder: 0,
				title: 'Santoku knife (7 inch)',
				url: 'https://www.shun.kaiusa.com/classic-7-santoku-knife.html',
				type: 'text',
			},
			{
				ownerId: sofia.id,
				categoryId: sofiaKitchen.id,
				sortOrder: 1,
				title: 'Marble pastry board',
				type: 'text',
			},
			{
				ownerId: sofia.id,
				categoryId: sofiaKitchen.id,
				sortOrder: 2,
				title: 'Microplane grater',
				type: 'text',
			},
			{
				ownerId: sofia.id,
				categoryId: sofiaOutdoors.id,
				sortOrder: 0,
				title: 'Lightweight hiking poles',
				type: 'text',
			},
			{
				ownerId: sofia.id,
				categoryId: sofiaOutdoors.id,
				sortOrder: 1,
				title: 'Headlamp (rechargeable, ~300 lumens)',
				type: 'text',
				...itemImage(1),
			},
		],
	})

	// Hana — mostly categorized with images, PLUS two past items
	const hanaDesk = await prisma.wishlistCategory.create({
		data: { ownerId: hana.id, name: 'Desk', order: 0 },
	})
	const hanaMisc = await prisma.wishlistCategory.create({
		data: { ownerId: hana.id, name: 'Miscellaneous', order: 1 },
	})
	await prisma.wishlistItem.createMany({
		data: [
			{
				ownerId: hana.id,
				categoryId: hanaDesk.id,
				sortOrder: 0,
				title: 'Desk mat (large, dark gray)',
				type: 'text',
				...itemImage(2),
			},
			{
				ownerId: hana.id,
				categoryId: hanaDesk.id,
				sortOrder: 1,
				title: 'Webcam that doesn\'t look like 2012',
				note: 'Opal Tadpole if budget allows, Logitech Brio otherwise.',
				url: 'https://opalcamera.com/products/tadpole',
				type: 'text',
				...itemImage(3),
			},
			{
				ownerId: hana.id,
				categoryId: hanaDesk.id,
				sortOrder: 2,
				title: 'Moleskine grid notebook (A5)',
				type: 'text',
			},
			{
				ownerId: hana.id,
				categoryId: hanaDesk.id,
				sortOrder: 3,
				title: 'Nice mouse pad — wrist rest kind',
				type: 'text',
			},
			{
				ownerId: hana.id,
				categoryId: hanaMisc.id,
				sortOrder: 0,
				title: 'A really good umbrella',
				note: 'The kind that doesn\'t invert when the wind hits.',
				type: 'text',
			},
			{
				ownerId: hana.id,
				categoryId: hanaMisc.id,
				sortOrder: 1,
				title: 'Linen apron',
				type: 'text',
				...itemImage(4),
			},
			{
				ownerId: hana.id,
				categoryId: hanaMisc.id,
				sortOrder: 2,
				title: 'Polaroid instant film (any format)',
				type: 'text',
			},
			{
				ownerId: hana.id,
				categoryId: hanaMisc.id,
				sortOrder: 3,
				title: 'Succulent — something interesting, not just echeveria',
				type: 'text',
			},
		],
	})

	// Hana past items (so her Past items tab also has content)
	const hanaPast1 = await prisma.wishlistItem.create({
		data: {
			ownerId: hana.id,
			categoryId: hanaMisc.id,
			sortOrder: 100,
			title: 'Silk scarf',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(14),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: hanaPast1.id,
			purchasedById: sofia.id,
			createdAt: daysAgo(14),
		},
	})

	const hanaPast2 = await prisma.wishlistItem.create({
		data: {
			ownerId: hana.id,
			categoryId: hanaDesk.id,
			sortOrder: 101,
			title: 'Mechanical pencil set',
			type: 'text',
			status: 'ARCHIVED',
			updatedAt: daysAgo(40),
		},
	})
	await prisma.wishlistPurchase.create({
		data: {
			wishlistItemId: hanaPast2.id,
			purchasedById: wade.id,
			createdAt: daysAgo(40),
		},
	})

	// Leo — intentionally NO wishlist items. Edge case: empty wishlist.

	// Zoe — wishlist exists but Wade can't see it (pending request state)
	await prisma.wishlistItem.createMany({
		data: [
			{
				ownerId: zoe.id,
				sortOrder: 0,
				title: 'Pottery wheel',
				type: 'text',
			},
			{
				ownerId: zoe.id,
				sortOrder: 1,
				title: 'Cold brew carafe',
				type: 'text',
			},
			{
				ownerId: zoe.id,
				sortOrder: 2,
				title: 'Hiking daypack (Osprey Tempest 20)',
				type: 'text',
			},
			{
				ownerId: zoe.id,
				sortOrder: 3,
				title: 'Art museum membership',
				type: 'text',
			},
		],
	})

	// Ben — same (pending outgoing request)
	await prisma.wishlistItem.createMany({
		data: [
			{
				ownerId: ben.id,
				sortOrder: 0,
				title: 'Classical guitar strings',
				type: 'text',
			},
			{
				ownerId: ben.id,
				sortOrder: 1,
				title: 'Notebook (Leuchtturm1917, dotted)',
				type: 'text',
			},
			{
				ownerId: ben.id,
				sortOrder: 2,
				title: 'Neapolitan pizza cookbook',
				type: 'text',
			},
		],
	})

	console.timeEnd('💝 Created friends\' wishlists...')

	// ── Pool 1: Marco's birthday — OPEN ─────────────────────────────────────────
	console.time('🎁 Created pool: Marco\'s birthday (OPEN)...')

	const marcoPool = await prisma.pool.create({
		data: {
			title: "Marco's Birthday",
			occasionType: OCCASION_TYPE.BIRTHDAY,
			eventDate: daysFromNow(22),
			status: POOL_STATUS.OPEN,
			decisionMode: DECISION_MODE.ORGANIZER_PICKS,
			recipientUserId: marco.id,
			giftGroupId: friendGroup.id,
			organizerId: wade.id,
			contributors: {
				create: [
					{ userId: wade.id, contributionCents: 3000 },
					{ userId: np.id, contributionCents: 2500 },
					{ userId: alvaro.id, contributionCents: 2000 },
					{ userId: sofia.id, contributionCents: 2000 },
				],
			},
		},
	})

	const sonyHeadphonesItem = await prisma.wishlistItem.findFirst({
		where: { ownerId: marco.id, title: { contains: 'Sony' } },
		select: { id: true },
	})
	const kindleItem = await prisma.wishlistItem.findFirst({
		where: { ownerId: marco.id, title: { contains: 'Kindle' } },
		select: { id: true },
	})

	await prisma.giftIdea.createMany({
		data: [
			{
				poolId: marcoPool.id,
				proposedById: np.id,
				name: 'Sony WH-1000XM5 Headphones',
				description: 'He had these on his list. Black colourway.',
				url: 'https://www.sony.com/en/articles/wh-1000xm5',
				estimatedPriceCents: 34999,
				wishlistItemId: sonyHeadphonesItem?.id ?? null,
			},
			{
				poolId: marcoPool.id,
				proposedById: wade.id,
				name: 'Kindle Paperwhite',
				description: 'He reads a lot. 32GB, no ads.',
				url: 'https://www.amazon.com/kindle-paperwhite',
				estimatedPriceCents: 15999,
				wishlistItemId: kindleItem?.id ?? null,
			},
			{
				poolId: marcoPool.id,
				proposedById: alvaro.id,
				name: 'Nice restaurant dinner, all on us',
				description:
					"Book a table somewhere good in Buenos Aires when he's back.",
				estimatedPriceCents: 20000,
			},
		],
	})

	console.timeEnd('🎁 Created pool: Marco\'s birthday (OPEN)...')

	// ── Pool 2: Ana's farewell — VOTING ─────────────────────────────────────────
	console.time('🗳️  Created pool: Ana\'s farewell (VOTING)...')

	const anaPool = await prisma.pool.create({
		data: {
			title: "Ana's Farewell",
			occasionType: OCCASION_TYPE.FAREWELL,
			eventDate: daysFromNow(14),
			status: POOL_STATUS.VOTING,
			decisionMode: DECISION_MODE.VOTE,
			recipientName: 'Ana',
			organizerId: wade.id,
			contributors: {
				create: [
					{ userId: wade.id, contributionCents: 5000 },
					{ userId: np.id, contributionCents: 3000 },
					{ userId: sofia.id, contributionCents: 2000 },
				],
			},
		},
	})

	const anaIdea1 = await prisma.giftIdea.create({
		data: {
			poolId: anaPool.id,
			proposedById: np.id,
			name: 'Personalised photo book',
			description:
				'A Artifact book with photos from the whole time she worked with us.',
			estimatedPriceCents: 8000,
		},
	})

	const anaIdea2 = await prisma.giftIdea.create({
		data: {
			poolId: anaPool.id,
			proposedById: sofia.id,
			name: 'Luggage set',
			description: "She's moving cities — could use new luggage.",
			url: 'https://example.com/luggage',
			estimatedPriceCents: 18000,
		},
	})

	await prisma.ideaVote.createMany({
		data: [
			{ poolId: anaPool.id, ideaId: anaIdea1.id, voterId: np.id },
			{ poolId: anaPool.id, ideaId: anaIdea2.id, voterId: sofia.id },
		],
	})

	console.timeEnd('🗳️  Created pool: Ana\'s farewell (VOTING)...')

	// ── Pool 3: Leo's graduation — DECIDED ──────────────────────────────────────
	console.time('✅ Created pool: Leo\'s graduation (DECIDED)...')

	const leoPool = await prisma.pool.create({
		data: {
			title: "Leo's Graduation",
			occasionType: OCCASION_TYPE.GRADUATION,
			eventDate: daysAgo(7),
			status: POOL_STATUS.DECIDED,
			decisionMode: DECISION_MODE.ORGANIZER_PICKS,
			recipientName: 'Leo',
			organizerId: wade.id,
			purchaserId: wade.id,
			finalPriceCents: 24900,
			contributors: {
				create: [
					{ userId: wade.id, contributionCents: 10000 },
					{ userId: np.id, contributionCents: 8000 },
					{ userId: alvaro.id, contributionCents: 7000 },
				],
			},
		},
	})

	const leoIdea = await prisma.giftIdea.create({
		data: {
			poolId: leoPool.id,
			proposedById: wade.id,
			name: 'Apple AirPods Pro',
			description: '2nd gen. He travels a lot, perfect gift.',
			url: 'https://www.apple.com/airpods-pro/',
			estimatedPriceCents: 24900,
		},
	})

	await prisma.pool.update({
		where: { id: leoPool.id },
		data: { chosenIdeaId: leoIdea.id },
	})

	await prisma.giftIdea.create({
		data: {
			poolId: leoPool.id,
			proposedById: np.id,
			name: 'Cash in an envelope (classic)',
			estimatedPriceCents: 24900,
		},
	})

	console.timeEnd('✅ Created pool: Leo\'s graduation (DECIDED)...')

	// ── Pool 4: Marta's anniversary — DELIVERED ─────────────────────────────────
	console.time('🎉 Created pool: Marta\'s anniversary (DELIVERED)...')

	const martaPool = await prisma.pool.create({
		data: {
			title: "Marta & Carlos' Anniversary",
			occasionType: OCCASION_TYPE.ANNIVERSARY,
			eventDate: daysAgo(60),
			status: POOL_STATUS.DELIVERED,
			decisionMode: DECISION_MODE.ORGANIZER_PICKS,
			recipientName: 'Marta & Carlos',
			giftGroupId: friendGroup.id,
			organizerId: sofia.id,
			purchaserId: sofia.id,
			delivererId: sofia.id,
			finalPriceCents: 12000,
			contributors: {
				create: [
					{ userId: wade.id, contributionCents: 3000, hasPaid: true },
					{ userId: sofia.id, contributionCents: 3000, hasPaid: true },
					{ userId: np.id, contributionCents: 3000, hasPaid: true },
					{ userId: alvaro.id, contributionCents: 3000, hasPaid: true },
				],
			},
		},
	})

	const martaIdea = await prisma.giftIdea.create({
		data: {
			poolId: martaPool.id,
			proposedById: sofia.id,
			name: 'Weekend getaway voucher',
			description: 'Punta del Este spa hotel, 2 nights.',
			estimatedPriceCents: 12000,
		},
	})

	await prisma.pool.update({
		where: { id: martaPool.id },
		data: { chosenIdeaId: martaIdea.id },
	})

	console.timeEnd('🎉 Created pool: Marta\'s anniversary (DELIVERED)...')

	// ── Notifications for Wade ──────────────────────────────────────────────────
	// Mix of unread + read across the three supported types. Shapes match
	// what `app/utils/notification-service.server.tsx` produces.
	console.time('🔔 Created notifications for Wade...')

	// UNREAD — Zoe sent a friend request (attached to the PENDING request)
	await prisma.notification.create({
		data: {
			userId: wade.id,
			type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
			status: 'UNREAD',
			messageKey: 'notifications.friendRequest.message',
			messageParams: JSON.stringify({ name: 'Zoe Whitfield' }),
			targetUrl: '/friends#incoming-requests',
			metadata: JSON.stringify({
				senderUserId: zoe.id,
				senderDisplayName: 'Zoe Whitfield',
				senderAvatarId: null,
			}),
			actions: JSON.stringify([
				{
					kind: 'FRIEND_ACCEPT',
					labelKey: 'notifications.friendRequest.accept',
				},
				{
					kind: 'FRIEND_REJECT',
					labelKey: 'notifications.friendRequest.reject',
				},
			]),
			sourceIdentifier: `friend-request:${zoeToWadeRequest.id}:received`,
			friendRequestId: zoeToWadeRequest.id,
			createdAt: minutesAgo(15),
		},
	})

	// UNREAD — Hana accepted Wade's friend request (recently)
	await prisma.notification.create({
		data: {
			userId: wade.id,
			type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
			status: 'UNREAD',
			messageKey: 'notifications.friendRequestAccepted.message',
			messageParams: JSON.stringify({ name: 'Hana Okafor' }),
			targetUrl: '/friends',
			metadata: JSON.stringify({
				senderUserId: hana.id,
				senderDisplayName: 'Hana Okafor',
				senderAvatarId: null,
			}),
			sourceIdentifier: `friend-request:seed-hana-accept:accepted`,
			createdAt: hoursAgo(3),
		},
	})

	// UNREAD — Hana's birthday is tomorrow
	await prisma.notification.create({
		data: {
			userId: wade.id,
			type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
			status: 'UNREAD',
			messageKey: 'notifications.upcomingBirthday.message',
			messageParams: JSON.stringify({
				name: 'Hana Okafor',
				daysUntil: 1,
			}),
			targetUrl: '/friends',
			metadata: JSON.stringify({
				birthdayUserId: hana.id,
				birthdayDisplayName: 'Hana Okafor',
				daysUntil: 1,
			}),
			sourceIdentifier: `upcoming-birthday:${hana.id}:1`,
			createdAt: hoursAgo(12),
		},
	})

	// READ — older "Marco accepted your request"
	await prisma.notification.create({
		data: {
			userId: wade.id,
			type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
			status: 'READ',
			readAt: daysAgo(5),
			messageKey: 'notifications.friendRequestAccepted.message',
			messageParams: JSON.stringify({ name: 'Marco Rodríguez' }),
			targetUrl: '/friends',
			metadata: JSON.stringify({
				senderUserId: marco.id,
				senderDisplayName: 'Marco Rodríguez',
				senderAvatarId: null,
			}),
			sourceIdentifier: `friend-request:seed-marco-accept:accepted`,
			createdAt: daysAgo(6),
		},
	})

	// READ — older upcoming birthday reminder for Marco
	await prisma.notification.create({
		data: {
			userId: wade.id,
			type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
			status: 'READ',
			readAt: daysAgo(1),
			messageKey: 'notifications.upcomingBirthday.message',
			messageParams: JSON.stringify({
				name: 'Marco Rodríguez',
				daysUntil: 30,
			}),
			targetUrl: '/friends',
			metadata: JSON.stringify({
				birthdayUserId: marco.id,
				birthdayDisplayName: 'Marco Rodríguez',
				daysUntil: 30,
			}),
			sourceIdentifier: `upcoming-birthday:${marco.id}:30`,
			createdAt: daysAgo(2),
		},
	})

	console.timeEnd('🔔 Created notifications for Wade...')

	// Silence the unused-import warning for faker. We keep it imported so adding
	// more randomized fixtures later (e.g. extra filler users) is one line away.
	void faker

	console.timeEnd(`🌱 Database has been seeded`)

	console.log(`
┌─────────────────────────────────────────────────────┐
│  Dev login: wade@example.com / maximumeffort        │
│                                                     │
│  People:                                            │
│  • wade (you) — admin                               │
│  • marco, np, alvaro, sofia, hana, leo — friends    │
│  • zoe — sent you a pending request                 │
│  • ben — you have a pending request out to them     │
│                                                     │
│  Groups:                                            │
│  • The Crew   — wade, np, alvaro, sofia             │
│  • Book Club  — wade, marco, hana, leo              │
│                                                     │
│  Upcoming birthdays on Home should show:            │
│  • Hana (tomorrow), Leo (~25d), Marco (~22d),       │
│    NP (~37d), Alvaro (~54d)                         │
│  • Sofía is intentionally outside the 60d window    │
│                                                     │
│  Wade's wishlist: 16 active items across 4          │
│  categories + 6 past items purchased by friends.    │
│                                                     │
│  Pools:                                             │
│  • Marco's Birthday     → OPEN                      │
│  • Ana's Farewell       → VOTING                    │
│  • Leo's Graduation     → DECIDED                   │
│  • Marta's Anniversary  → DELIVERED                 │
└─────────────────────────────────────────────────────┘
	`)
}

seed()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})

// we're ok to import from the test directory in this file
/*
eslint
	no-restricted-imports: "off",
*/
