import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { MOCK_CODE_GITHUB } from '#app/utils/providers/constants'
import {
	cleanupDb,
	createPassword,
	createUser,
	getUserImages,
	img,
} from '#tests/db-utils.ts'
import { insertGitHubUser } from '#tests/mocks/github.ts'

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

	// Roles
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

	// Users
	const totalUsers = 5
	console.time(`👤 Created ${totalUsers} users...`)
	const userImages = await getUserImages()

	for (let index = 0; index < totalUsers; index++) {
		const userData = createUser()
		await prisma.user
			.create({
				select: { id: true },
				data: {
					...userData,
					password: { create: createPassword(userData.username) },
					image: { create: userImages[index % userImages.length] },
					roles: { connect: { name: 'user' } },
					birthday: faker.date.birthdate(),
					address: {
						create: {
							street: faker.location.streetAddress(),
							city: faker.location.city(),
							state: faker.location.state(),
							zip: faker.location.zipCode(),
							country: faker.location.country(),
						},
					},
					wishlistItems: {
						create: Array.from({
							length: faker.number.int({ min: 1, max: 3 }),
						}).map(() => ({
							title: faker.commerce.productName(),
							url: faker.internet.url(),
							notes: faker.commerce.productDescription(),
							priority: faker.number.int({ min: 1, max: 5 }),
							isLink: faker.datatype.boolean(),
						})),
					},
				},
			})
			.catch((e) => {
				console.error('Error creating a user:', e)
				return null
			})
	}
	console.timeEnd(`👤 Created ${totalUsers} users...`)

	console.time(`🧑‍💼 Created admin user "Wade Wilson"`)
	const wadeImage = await img({
		filepath: './tests/fixtures/images/user/wade.png',
	})

	const githubUser = await insertGitHubUser(MOCK_CODE_GITHUB)

	await prisma.user.create({
		select: { id: true },
		data: {
			email: 'wade@example.com',
			username: 'wade',
			name: 'Wade Wilson',
			image: { create: wadeImage },
			password: { create: createPassword('maximumeffort') },
			connections: {
				create: { providerName: 'github', providerId: githubUser.profile.id },
			},
			roles: { connect: [{ name: 'admin' }, { name: 'user' }] },
			birthday: faker.date.birthdate(),
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
						notes: 'Engraved with Deadpool logo. Red + black colorway.',
						priority: 1,
						isLink: true,
					},
				],
			},
		},
	})
	console.timeEnd(`🧑‍💼 Created admin user "Wade Wilson"`)

	console.timeEnd(`🌱 Database has been seeded`)
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
