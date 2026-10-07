import { type LoaderFunctionArgs, Outlet } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserId(request)
	return {}
}

const PoolsRoute = () => {
	return (
		<main className="w-full min-w-0">
			<div className="w-full min-w-0 rounded-none text-surface-foreground shadow-sm">
				<Outlet />
			</div>
		</main>
	)
}

export default PoolsRoute

// Without this, any pool-page error bubbles to the root boundary, which
// replaces the whole document and drops the nav (GIFTPOOL-UI-36).
export const ErrorBoundary = () => <GeneralErrorBoundary />
