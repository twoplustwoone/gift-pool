import { Button } from '#app/components/ui/button.js'
import { invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { Heading } from '#app/components/ui/heading.tsx'
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx'
import { prisma } from '#app/utils/db.server.ts'

export async function loader({ params }: LoaderFunctionArgs) {
	const owner = await prisma.user.findFirst({
		select: {
			id: true,
			username: true,
			giftGroups: { select: { giftGroup: true } },
		},
		where: { username: params.username },
	})

	invariantResponse(owner, 'Owner not found', { status: 404 })

	return json({ owner })
}

export default function GroupsIndex() {
	const data = useLoaderData<typeof loader>()

	const { owner } = data
	return (
		<div>
			<SectionTitle>
				<Heading>My Groups</Heading>
				<Button asChild>
					<Link to={`/users/${data.owner.username}/groups/new`}>
						Create Group
					</Link>
				</Button>
			</SectionTitle>
			<div className="mt-4 space-y-4">
				{owner.giftGroups.map(group => (
					<div key={group.giftGroup.id}>
						<Link to={`/users/${owner.username}/groups/${group.giftGroup.id}`}>
							{group.giftGroup.name}
						</Link>
					</div>
				))}
			</div>
		</div>
	)
}
