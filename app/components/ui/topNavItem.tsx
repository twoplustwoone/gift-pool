import { NavLink } from '@remix-run/react'
import { Icon, type IconName } from './icon'

export function TopNavItem({
	to,
	icon,
	label,
}: {
	to: string
	icon: IconName
	label: string
}) {
	return (
		<NavLink
			to={to}
			className={({ isActive }) =>
				[
					'flex items-center rounded-md px-4 py-2 text-lg font-medium transition-colors duration-200',
					isActive
						? 'bg-accent text-white'
						: 'text-gray-700 hover:bg-muted hover:text-gray-900',
				].join(' ')
			}
		>
			<Icon className="text-body-md" name={icon}>
				{label}
			</Icon>
		</NavLink>
	)
}
