import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import {
	cleanupDb,
	createPassword,
	getUserImages,
	img,
} from '#tests/db-utils.ts'
import { ensureNotificationPreferencesForUser } from '#app/utils/notification-preferences.server.ts'
import { POOL_STATUS, DECISION_MODE, OCCASION_TYPE } from '#app/utils/pool-constants.ts'

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	console.time('🧹 Cleaned up the database...')
	await cleanupDb(prisma)
	console.timeEnd('🧹 Cleaned up the database...')

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

	// ── Named seed users (stable usernames for dev login) ─────────────────────
	console.time('👤 Created named users...')
	const userImages = await getUserImages()

	const wadeImage = await img({ filepath: './tests/fixtures/images/user/wade.png' })
	const wade = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'wade@example.com',
			username: 'wade',
			name: 'Wade Wilson',
			image: { create: wadeImage },
			password: { create: createPassword('maximumeffort') },
			roles: { connect: [{ name: 'admin' }, { name: 'user' }] },
			birthday: new Date('1991-06-01'),
			address: {
				create: {
					street: '1991 Chimichanga Lane',
					city: 'Regeneropolis',
					state: 'CA',
					zip: '90210',
					country: 'USA',
				},
			},
			wishlistItems: {
				create: [
					{
						title: 'Custom Katana Set',
						url: 'https://example.com/katana',
						note: 'Engraved with Deadpool logo. Red + black colorway.',
						type: 'text',
						sortOrder: 0,
					},
					{
						title: 'Chimichangas cookbook',
						url: 'https://example.com/chimichangas',
						type: 'text',
						sortOrder: 1,
					},
				],
			},
		},
	})
	await ensureNotificationPreferencesForUser(wade.id)

	// Marco – friend, birthday coming up soon
	const marco = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'marco@example.com',
			username: 'marco',
			name: 'Marco Rodríguez',
			image: { create: userImages[0] },
			password: { create: createPassword('marco') },
			roles: { connect: { name: 'user' } },
			birthday: new Date(new Date().setMonth(new Date().getMonth() + 1)),
			wishlistItems: {
				create: [
					{
						title: 'Sony WH-1000XM5 Headphones',
						url: 'https://www.sony.com/en/articles/wh-1000xm5',
						note: 'Black colourway',
						type: 'text',
						sortOrder: 0,
					},
					{
						title: 'Kindle Paperwhite',
						url: 'https://www.amazon.com/kindle-paperwhite',
						type: 'text',
						sortOrder: 1,
					},
					{
						title: 'AeroPress Coffee Maker',
						url: 'https://aeropress.com',
						type: 'text',
						sortOrder: 2,
					},
				],
			},
		},
	})
	await ensureNotificationPreferencesForUser(marco.id)

	// NP – the Toronto crew member
	const np = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'np@example.com',
			username: 'np',
			name: 'NP',
			image: { create: userImages[1] },
			password: { create: createPassword('np') },
			roles: { connect: { name: 'user' } },
			birthday: faker.date.birthdate(),
		},
	})
	await ensureNotificationPreferencesForUser(np.id)

	// Alvaro – Sydney
	const alvaro = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'alvaro@example.com',
			username: 'alvaro',
			name: 'Alvaro Méndez',
			image: { create: userImages[2] },
			password: { create: createPassword('alvaro') },
			roles: { connect: { name: 'user' } },
			birthday: faker.date.birthdate(),
		},
	})
	await ensureNotificationPreferencesForUser(alvaro.id)

	// Sofia – Buenos Aires
	const sofia = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'sofia@example.com',
			username: 'sofia',
			name: 'Sofía Vargas',
			image: { create: userImages[3] },
			password: { create: createPassword('sofia') },
			roles: { connect: { name: 'user' } },
			birthday: faker.date.birthdate(),
		},
	})
	await ensureNotificationPreferencesForUser(sofia.id)

	console.timeEnd('👤 Created named users...')

	// ── Friend group ──────────────────────────────────────────────────────────
	console.time('👥 Created friend group...')

	const friendGroup = await prisma.giftGroup.create({
		data: {
			name: 'The Crew',
			description: 'Scattered across three continents, but still the same group chat.',
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

	console.timeEnd('👥 Created friend group...')

	// ── Pool 1: Marco's birthday — OPEN, ideas being collected ────────────────
	// Marco is NOT in the friend group (it's his birthday — he can't know!)
	console.time('🎁 Created pool: Marco\'s birthday (OPEN)...')

	const nextMonth = new Date()
	nextMonth.setMonth(nextMonth.getMonth() + 1)

	const marcoPool = await prisma.pool.create({
		data: {
			title: "Marco's Birthday",
			occasionType: OCCASION_TYPE.BIRTHDAY,
			eventDate: nextMonth,
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

	// Propose ideas — two from Marco's wishlist, one freeform
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
				description: "Book a table somewhere good in Buenos Aires when he's back.",
				estimatedPriceCents: 20000,
			},
		],
	})

	console.timeEnd('🎁 Created pool: Marco\'s birthday (OPEN)...')

	// ── Pool 2: Standalone — VOTING in progress ────────────────────────────────
	console.time('🗳️  Created pool: Ana\'s farewell (VOTING)...')

	const twoWeeks = new Date()
	twoWeeks.setDate(twoWeeks.getDate() + 14)

	const anaPool = await prisma.pool.create({
		data: {
			title: "Ana's Farewell",
			occasionType: OCCASION_TYPE.FAREWELL,
			eventDate: twoWeeks,
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
			description: 'A Artifact book with photos from the whole time she worked with us.',
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

	// NP and Sofia have voted
	await prisma.ideaVote.createMany({
		data: [
			{ poolId: anaPool.id, ideaId: anaIdea1.id, voterId: np.id },
			{ poolId: anaPool.id, ideaId: anaIdea2.id, voterId: sofia.id },
		],
	})

	console.timeEnd('🗳️  Created pool: Ana\'s farewell (VOTING)...')

	// ── Pool 3: DECIDED — gift chosen, contributions calculated ───────────────
	console.time('✅ Created pool: Leo\'s graduation (DECIDED)...')

	const lastWeek = new Date()
	lastWeek.setDate(lastWeek.getDate() - 7)

	const leoChosenIdea = {
		name: 'Apple AirPods Pro',
		description: '2nd gen. He travels a lot, perfect gift.',
		url: 'https://www.apple.com/airpods-pro/',
		estimatedPriceCents: 24900,
	}

	const leoPool = await prisma.pool.create({
		data: {
			title: "Leo's Graduation",
			occasionType: OCCASION_TYPE.GRADUATION,
			eventDate: lastWeek,
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

	// Create the chosen idea and link it back
	const leoIdea = await prisma.giftIdea.create({
		data: {
			poolId: leoPool.id,
			proposedById: wade.id,
			...leoChosenIdea,
		},
	})

	await prisma.pool.update({
		where: { id: leoPool.id },
		data: { chosenIdeaId: leoIdea.id },
	})

	// Also add a runner-up idea for realism
	await prisma.giftIdea.create({
		data: {
			poolId: leoPool.id,
			proposedById: np.id,
			name: 'Cash in an envelope (classic)',
			estimatedPriceCents: 24900,
		},
	})

	console.timeEnd('✅ Created pool: Leo\'s graduation (DECIDED)...')

	// ── Pool 4: DELIVERED — fully completed, for history view ─────────────────
	console.time('🎉 Created pool: Marta\'s anniversary (DELIVERED)...')

	const twoMonthsAgo = new Date()
	twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

	const martaPool = await prisma.pool.create({
		data: {
			title: "Marta & Carlos' Anniversary",
			occasionType: OCCASION_TYPE.ANNIVERSARY,
			eventDate: twoMonthsAgo,
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

	console.timeEnd(`🌱 Database has been seeded`)

	console.log(`
┌─────────────────────────────────────────────────────┐
│  Dev login: wade@example.com / maximumeffort        │
│                                                     │
│  Pools seeded:                                      │
│  • Marco's Birthday     → OPEN (ideas, no vote)     │
│  • Ana's Farewell       → VOTING (2 ideas, 2 votes) │
│  • Leo's Graduation     → DECIDED (gift chosen)     │
│  • Marta's Anniversary  → DELIVERED (completed)     │
│                                                     │
│  Group: "The Crew" (wade, np, alvaro, sofia)        │
└─────────────────────────────────────────────────────┘
	`)
}

seed()
	.catch(e => {
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
