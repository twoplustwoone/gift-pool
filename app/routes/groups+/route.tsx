import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Outlet } from '@remix-run/react'
import { requireUserId } from '#app/utils/auth.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserId(request)
	return json({})
}

export default function GroupsRoute() {
	return (
		<main className="container flex h-full min-h-[400px] px-0 pb-12 md:px-8">
			<div className="grid w-full bg-muted pl-2 pr-2 md:container md:rounded-3xl">
				<Outlet />
			</div>
		</main>
	)
}
