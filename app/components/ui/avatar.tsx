import { type User, type UserImage } from '@prisma/client'
import { type SerializeFrom } from '@remix-run/node'
import { getUserImgSrc } from '#app/utils/misc.tsx'

type AvatarSize = 's' | 'm' | 'l' | number
type AvatarShape = 'circle' | 'rounded' | 'square'
type AvatarStatus = 'online' | 'offline' | 'away'

interface AvatarProps {
	image?: SerializeFrom<Pick<UserImage, 'id' | 'altText'>> | null
	user: SerializeFrom<Pick<User, 'name' | 'username'>>
	size?: AvatarSize
	shape?: AvatarShape
	placeholderImage?: string
	altText?: string
	className?: string
	style?: React.CSSProperties
	onClick?: React.MouseEventHandler<HTMLImageElement>
	border?: string
	statusIndicator?: AvatarStatus
	loading?: 'lazy' | 'eager'
	ariaLabel?: string
}

export const Avatar = ({
	image,
	user,
	size = 'm',
	shape = 'circle',
	placeholderImage = '/images/default-avatar.png',
	altText,
	className,
	style,
	onClick,
	border = '',
	statusIndicator,
	loading = 'lazy',
	ariaLabel,
}: AvatarProps) => {
	const sizeClass = (() => {
		if (typeof size === 'number') {
			return `h-${size} w-${size}`
		}
		switch (size) {
			case 's':
				return 'h-8 w-8'
			case 'l':
				return 'h-52 w-52'
			case 'm':
			default:
				return 'h-24 w-24'
		}
	})()

	const shapeClass = (() => {
		switch (shape) {
			case 'square':
				return ''
			case 'rounded':
				return 'rounded-md'
			case 'circle':
			default:
				return 'rounded-full'
		}
	})()

	const src = image?.id ? getUserImgSrc(image.id) : placeholderImage

	const imageAlt = altText ?? image?.altText ?? user.name ?? user.username

	const imgClasses = `${sizeClass} ${shapeClass} object-cover ${border} ${className ?? ''}`

	return (
		<div className="relative inline-block">
			<img
				src={src}
				alt={imageAlt}
				className={imgClasses}
				style={style}
				onClick={onClick}
				loading={loading}
				aria-label={ariaLabel ?? imageAlt}
			/>
			{statusIndicator && (
				<span
					className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white ${
						statusIndicator === 'online'
							? 'bg-green-400'
							: statusIndicator === 'offline'
								? 'bg-gray-400'
								: 'bg-yellow-400'
					}`}
					aria-label={statusIndicator}
				></span>
			)}
		</div>
	)
}
