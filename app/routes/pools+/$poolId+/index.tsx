// Re-export so React Router routes form submissions to the right action.
// The loader is on _layout.tsx; the action must also be here since forms
// in a child route submit to that child's action, not the parent's.
export { action } from './__route.server'

import { useEffect, useState } from 'react'
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import {
	LuCheck,
	LuClipboard,
	LuLink,
	LuPackage,
	LuThumbsUp,
	LuTruck,
	LuX,
} from 'react-icons/lu'
import {
	Form,
	useFetcher,
	useNavigation,
	useRouteLoaderData,
} from 'react-router'
import { z } from 'zod'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { Flex, Stack, Text } from '#app/components/ui-kit'
import { formatCents } from '#app/utils/pool-contributions.ts'
import {
	DECISION_MODE,
	POOL_STATUS,
	type PoolStatus,
} from '#app/utils/pool-constants.ts'
import { type loader as routeLoader } from './__route.server'

type LoaderData = Awaited<ReturnType<typeof routeLoader>>
type Pool = LoaderData['pool']
type Idea = Pool['ideas'][number]
type Contributor = Pool['contributors'][number]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const getUserDisplayName = (u: {
	name: string | null
	username: string
}) => (u.name && u.name.length > 0 ? u.name : `@${u.username}`)

export const getInitials = (u: { name: string | null; username: string }) => {
	const name = u.name && u.name.length > 0 ? u.name : u.username
	return name.slice(0, 2).toUpperCase()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
	<Text weight="semibold" className="text-sm text-muted-foreground">
		{children}
	</Text>
)

// Inline form for updating your own contribution amount.
// The Save button only appears once the value has changed from the current one.
const ContributionEditor = ({
	poolId,
	currentCents,
}: {
	poolId: string
	currentCents: number | null
}) => {
	const fetcher = useFetcher()
	// User enters dollars (e.g. "30.00"); server converts to cents.
	const defaultValue = currentCents !== null ? (currentCents / 100).toFixed(2) : ''
	const [value, setValue] = useState(defaultValue)
	useEffect(() => {
		setValue(defaultValue)
	}, [defaultValue])

	const parsedValue = value === '' ? null : Number.parseFloat(value)
	const parsedDefaultValue =
		defaultValue === '' ? null : Number.parseFloat(defaultValue)
	// Compare parsed floats so "30" and "30.00" are treated as equal (no false dirty).
	const isDirty = parsedValue !== parsedDefaultValue

	const [form, fields] = useForm({
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: z.object({
					intent: z.literal('update-contribution'),
					poolId: z.string(),
					// User types dollars; validation just checks it's a non-negative number.
					contributionCents: z.coerce.number().min(0),
				}),
			})
		},
	})

	return (
		<fetcher.Form
			method="post"
			{...getFormProps(form)}
			className="flex items-center gap-2"
		>
			<input type="hidden" name="intent" value="update-contribution" />
			<input type="hidden" name="poolId" value={poolId} />
			<div className="relative">
				<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
					$
				</span>
				<Input
					{...getInputProps(fields.contributionCents, { type: 'text' })}
					data-testid="contribution-input"
					inputMode="decimal"
					pattern="[0-9]*\.?[0-9]{0,2}"
					value={value}
					onChange={e => setValue(e.target.value)}
					placeholder="0.00"
					className="w-24 pl-6 [appearance:textfield]"
				/>
			</div>
			{isDirty && (
				<Button type="submit" size="sm" variant="default" className="shrink-0">
					Save
				</Button>
			)}
		</fetcher.Form>
	)
}

// A single idea card
const IdeaCard = ({
	idea,
	poolId,
	isVoting,
	myVoteIdeaId,
	canManage,
	canDelete,
	canChoose,
}: {
	idea: Idea
	poolId: string
	isVoting: boolean
	myVoteIdeaId: string | null
	canManage: boolean
	canDelete: boolean
	canChoose: boolean
}) => {
	const voteFetcher = useFetcher()
	const chooseFetcher = useFetcher()
	const deleteFetcher = useFetcher()

	const hasMyVote = myVoteIdeaId === idea.id
	const isChoosingThis =
		chooseFetcher.state !== 'idle' &&
		(chooseFetcher.formData?.get('ideaId') as string) === idea.id

	return (
		<Card className="overflow-hidden" data-testid="idea-card">
			{/* Body */}
			<div className="p-4">
				{/* Title — no delete button here */}
				<p className="text-sm font-semibold leading-snug">{idea.name}</p>
				{idea.description && (
					<p className="mt-1 text-sm text-muted-foreground">{idea.description}</p>
				)}

				{/* Badges + link */}
				<div className="mt-3 flex flex-wrap items-center gap-2">
					{idea.estimatedPriceCents !== null && (
						<span
							className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
							data-testid="idea-price-badge"
						>
							≈ {formatCents(idea.estimatedPriceCents)}
						</span>
					)}
					{idea.url && (
						<a
							href={idea.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 text-xs text-primary hover:underline"
						>
							<LuLink size={11} /> View link
						</a>
					)}
					{idea.wishlistItem && (
						<span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
							From wishlist
						</span>
					)}
				</div>
			</div>

			{/* Footer: attribution left, actions right */}
			<div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2.5">
				{/* Who proposed it */}
				<span className="text-xs text-muted-foreground">
					by{' '}
					<span className="font-medium text-foreground">
						{getUserDisplayName(idea.proposedBy)}
					</span>
				</span>

				{/* Actions */}
				<div className="flex items-center gap-2">
					{/* Vote count (non-voting state) */}
					{!isVoting && idea._count.votes > 0 && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<LuThumbsUp size={11} />
							{idea._count.votes}
						</span>
					)}

					{/* Vote button (VOTING state) */}
					{isVoting && (
						<voteFetcher.Form method="post">
							<input type="hidden" name="intent" value="cast-vote" />
							<input type="hidden" name="poolId" value={poolId} />
							<input type="hidden" name="ideaId" value={idea.id} />
							<Button
								type="submit"
								size="sm"
								variant={hasMyVote ? 'default' : 'outline'}
								className="h-7 gap-1.5 text-xs"
								disabled={voteFetcher.state !== 'idle'}
							>
								<LuThumbsUp size={12} />
								{hasMyVote ? 'Voted' : 'Vote'}
								{idea._count.votes > 0 && (
									<span className="rounded-full bg-background/40 px-1.5">
										{idea._count.votes}
									</span>
								)}
							</Button>
						</voteFetcher.Form>
					)}

					{/* Choose this — outline so it doesn't shout on every card */}
					{canChoose && (
						<chooseFetcher.Form method="post">
							<input type="hidden" name="intent" value="choose-idea" />
							<input type="hidden" name="poolId" value={poolId} />
							<input type="hidden" name="ideaId" value={idea.id} />
							<Button
								type="submit"
								size="sm"
								variant="outline"
								className="h-7 gap-1.5 text-xs"
								disabled={isChoosingThis}
							>
								<LuCheck size={12} />
								{isChoosingThis ? 'Choosing…' : 'Choose'}
							</Button>
						</chooseFetcher.Form>
					)}

					{/* Remove — in the footer, separated from title */}
					{deleteFetcher.state === 'idle' && canDelete && (
						<deleteFetcher.Form method="post">
							<input type="hidden" name="intent" value="delete-idea" />
							<input type="hidden" name="poolId" value={poolId} />
							<input type="hidden" name="ideaId" value={idea.id} />
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								className="h-7 w-7 text-muted-foreground/70 hover:text-destructive"
								aria-label="Remove idea"
							>
								<LuX size={13} />
							</Button>
						</deleteFetcher.Form>
					)}
				</div>
			</div>
		</Card>
	)
}

// Propose idea form
const ProposeIdeaForm = ({ poolId }: { poolId: string }) => {
	const fetcher = useFetcher()
	const [form, fields] = useForm({
		lastResult: fetcher.data as any,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: z.object({
					intent: z.literal('propose-idea'),
					poolId: z.string(),
					name: z.string().min(1, 'Give the idea a name').max(200),
					description: z.string().max(500).optional(),
					url: z
						.string()
						.url('Must be a valid URL')
						.optional()
						.or(z.literal('')),
					// User enters dollars; server converts to cents.
					estimatedPriceCents: z.coerce
						.number()
						.min(0)
						.optional()
						.or(z.literal('')),
				}),
			})
		},
	})

	const isSubmitting = fetcher.state !== 'idle'

	return (
		<fetcher.Form method="post" {...getFormProps(form)}>
			<input type="hidden" name="intent" value="propose-idea" />
			<input type="hidden" name="poolId" value={poolId} />
			<Card className="p-4">
				<Stack gap={3}>
					<Text weight="medium" size="sm">
						Propose an idea
					</Text>
					<Stack gap={2}>
						<Input
							{...getInputProps(fields.name, { type: 'text' })}
							placeholder="What should we get them?"
							autoComplete="off"
						/>
						{fields.name.errors && (
							<Text size="xs" className="text-destructive">
								{fields.name.errors[0]}
							</Text>
						)}
					</Stack>
					<Flex gap={2}>
						<Input
							{...getInputProps(fields.url, { type: 'text' })}
							placeholder="Link (optional)"
							className="flex-1"
						/>
						<div className="relative">
							<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
								$
							</span>
							<Input
								{...getInputProps(fields.estimatedPriceCents, { type: 'text' })}
								data-testid="idea-price-input"
								inputMode="decimal"
								pattern="[0-9]*\.?[0-9]{0,2}"
								placeholder="0.00"
								className="w-24 pl-6 [appearance:textfield]"
							/>
						</div>
					</Flex>
					<Textarea
						{...getInputProps(fields.description, { type: 'text' })}
						placeholder="Notes (optional)"
						rows={2}
					/>
					<Flex justify="end">
						<Button type="submit" size="sm" disabled={isSubmitting}>
							{isSubmitting ? 'Adding…' : 'Add idea'}
						</Button>
					</Flex>
				</Stack>
			</Card>
		</fetcher.Form>
	)
}

// Chosen gift banner (shown when DECIDED+)
const ChosenGiftBanner = ({
	idea,
	finalPriceCents,
	poolId,
	canManage,
}: {
	idea: Idea
	finalPriceCents: number | null
	poolId: string
	canManage: boolean
}) => {
	const fetcher = useFetcher()

	return (
		<Card className="border-primary/20 bg-primary/5 p-5">
			<Stack gap={3}>
				<Flex gap={2} align="center">
					<LuCheck className="text-primary" size={18} />
					<Text weight="semibold">Chosen gift</Text>
				</Flex>
				<Stack gap={1}>
					<Text weight="semibold" size="lg">
						{idea.name}
					</Text>
					{idea.description && (
						<Text size="sm" className="text-muted-foreground">
							{idea.description}
						</Text>
					)}
					{idea.url && (
						<a
							href={idea.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 text-sm text-primary hover:underline"
						>
							<LuLink size={13} /> View link
						</a>
					)}
				</Stack>
				{/* Final price: display + optional inline editor for managers */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-xs text-muted-foreground">Final price</p>
						<p className="text-lg font-semibold" data-testid="final-price-display">
							{finalPriceCents !== null
								? formatCents(finalPriceCents)
								: idea.estimatedPriceCents !== null
									? `≈ ${formatCents(idea.estimatedPriceCents)}`
									: 'Not set'}
						</p>
					</div>
					{canManage && (
						<fetcher.Form method="post" className="flex items-center gap-2">
							<input type="hidden" name="intent" value="update-final-price" />
							<input type="hidden" name="poolId" value={poolId} />
							<div className="relative">
								<span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
									$
								</span>
								<Input
									name="finalPriceCents"
									type="text"
									data-testid="final-price-input"
									inputMode="decimal"
									pattern="[0-9]*\.?[0-9]{0,2}"
									defaultValue={
										finalPriceCents !== null
											? (finalPriceCents / 100).toFixed(2)
											: idea.estimatedPriceCents !== null
												? (idea.estimatedPriceCents / 100).toFixed(2)
												: ''
									}
									placeholder="0.00"
									className="w-24 pl-6 text-sm"
									min={0}
								/>
							</div>
							<Button type="submit" size="sm" variant="outline">
								Update
							</Button>
						</fetcher.Form>
					)}
				</div>
			</Stack>
		</Card>
	)
}

// Contribution breakdown table (shown when DECIDED+)
const ContributionBreakdown = ({
	breakdown,
	poolId,
	isPurchaser,
}: {
	breakdown: NonNullable<LoaderData['contributionBreakdown']>
	poolId: string
	isPurchaser: boolean
}) => {
	const fetcher = useFetcher()

	return (
		<Card className="p-4">
			<Stack gap={3}>
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<SectionHeading>What everyone owes the buyer</SectionHeading>
					{breakdown.shortfallCents > 0 && (
						<Badge className="shrink-0 bg-muted text-xs text-muted-foreground">
							Buyer covers {formatCents(breakdown.shortfallCents)}
						</Badge>
					)}
				</div>
				<div className="flex flex-col gap-2">
					{breakdown.breakdown.map(b => (
						<div
							key={b.userId}
							className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
							data-testid="contribution-breakdown-row"
						>
							<div className="flex min-w-0 items-center gap-2">
								<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
									{getInitials(b.user)}
								</span>
								<span className="truncate text-sm">{getUserDisplayName(b.user)}</span>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<span className="text-sm font-semibold">{formatCents(b.owedCents)}</span>
								{isPurchaser && (
									<fetcher.Form method="post">
										<input type="hidden" name="intent" value="mark-paid" />
										<input type="hidden" name="poolId" value={poolId} />
										<input type="hidden" name="targetUserId" value={b.userId} />
										<input
											type="hidden"
											name="hasPaid"
											value={b.hasPaid ? 'false' : 'true'}
										/>
										<Button
											type="submit"
											size="sm"
											variant={b.hasPaid ? 'default' : 'outline'}
											className="h-7 gap-1 text-xs"
										>
											{b.hasPaid ? (
												<>
													<LuCheck size={12} /> Paid
												</>
											) : (
												'Mark paid'
											)}
										</Button>
									</fetcher.Form>
								)}
								{!isPurchaser && b.hasPaid && (
									<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
										Paid
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			</Stack>
		</Card>
	)
}

// Clean contributor row — name + role badges on the left, amount on the right.
// Role assignment is handled separately in AssignRolesSection.
const ContributorsList = ({
	contributors,
	poolId,
	viewerUserId,
	organizerId,
	purchaserId,
	delivererId,
	canManage,
	isDecided,
}: {
	contributors: Contributor[]
	poolId: string
	viewerUserId: string
	organizerId: string
	purchaserId: string | null
	delivererId: string | null
	canManage: boolean
	isDecided: boolean
}) => {
	return (
		<Card className="p-4">
			<Stack gap={3}>
				<SectionHeading>Contributors ({contributors.length})</SectionHeading>
				<p className="text-xs text-muted-foreground">
					How much each person is chipping in for this one gift.
				</p>
				<Stack gap={2}>
					{contributors.map(c => {
						const isMe = c.userId === viewerUserId
						const isOrganizer = c.userId === organizerId
						const isPurchaser = c.userId === purchaserId
						const isDeliverer = c.userId === delivererId

						return (
							<div
								key={c.userId}
								className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
							>
								{/* Left: avatar + name + badges */}
								<div className="flex min-w-0 items-center gap-2.5">
									<span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
										{getInitials(c.user)}
									</span>
									<div className="min-w-0">
										<div className="flex items-center gap-1.5 text-sm">
											<span className={isMe ? 'font-semibold' : ''}>
												{getUserDisplayName(c.user)}
											</span>
											{isMe && (
												<span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
													you
												</span>
											)}
										</div>
										{(isOrganizer || isPurchaser || isDeliverer) && (
											<div className="mt-0.5 flex flex-wrap gap-1">
												{isOrganizer && (
													<Badge className="h-4 px-1.5 text-[10px]">Organizer</Badge>
												)}
												{isPurchaser && (
													<Badge className="h-4 bg-amber-100 px-1.5 text-[10px] text-amber-800 dark:bg-amber-900 dark:text-amber-200">
														Buyer
													</Badge>
												)}
												{isDeliverer && (
													<Badge className="h-4 bg-blue-100 px-1.5 text-[10px] text-blue-800 dark:bg-blue-900 dark:text-blue-200">
														Delivery
													</Badge>
												)}
											</div>
										)}
									</div>
								</div>

								{/* Right: contribution amount or editor */}
								<div className="shrink-0">
									{isMe && !isDecided ? (
										<ContributionEditor
											poolId={poolId}
											currentCents={c.contributionCents}
										/>
									) : (
										<span className="text-sm text-muted-foreground">
											{c.contributionCents !== null
												? formatCents(c.contributionCents)
												: '—'}
										</span>
									)}
								</div>
							</div>
						)
					})}
				</Stack>
			</Stack>
		</Card>
	)
}

// Separate card for assigning buyer / deliverer roles — only shown to organizer
// in DECIDED+ state. Keeps the contributor list rows clean.
const AssignRolesSection = ({
	contributors,
	poolId,
	purchaserId,
	delivererId,
}: {
	contributors: Contributor[]
	poolId: string
	purchaserId: string | null
	delivererId: string | null
}) => {
	const buyerFetcher = useFetcher()
	const delivererFetcher = useFetcher()

	return (
		<Card className="p-4">
			<Stack gap={4}>
				<SectionHeading>Assign roles</SectionHeading>

				{/* Who's buying */}
				<Stack gap={2}>
					<div className="flex items-center gap-1.5 text-sm font-medium">
						<LuPackage size={14} className="text-amber-600" />
						Who's buying the gift?
					</div>
					<div className="flex flex-col gap-1.5">
						{contributors.map(c => {
							const isCurrentBuyer = c.userId === purchaserId
							return (
								<buyerFetcher.Form key={c.userId} method="post">
									<input type="hidden" name="intent" value="assign-purchaser" />
									<input type="hidden" name="poolId" value={poolId} />
									<input type="hidden" name="userId" value={c.userId} />
									<button
										type="submit"
										disabled={isCurrentBuyer}
										className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
											isCurrentBuyer
												? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
												: 'hover:bg-muted/50'
										}`}
									>
										<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
											{getInitials(c.user)}
										</span>
										<span className="flex-1">{getUserDisplayName(c.user)}</span>
										{isCurrentBuyer && (
											<LuCheck size={14} className="text-amber-600" />
										)}
									</button>
								</buyerFetcher.Form>
							)
						})}
					</div>
				</Stack>

				{/* Who's delivering */}
				<Stack gap={2}>
					<div className="flex items-center gap-1.5 text-sm font-medium">
						<LuTruck size={14} className="text-blue-600" />
						Who's delivering?
						<span className="text-xs font-normal text-muted-foreground">(optional)</span>
					</div>
					<div className="flex flex-col gap-1.5">
						{contributors.map(c => {
							const isCurrentDeliverer = c.userId === delivererId
							return (
								<delivererFetcher.Form key={c.userId} method="post">
									<input type="hidden" name="intent" value="assign-deliverer" />
									<input type="hidden" name="poolId" value={poolId} />
									<input type="hidden" name="userId" value={c.userId} />
									<button
										type="submit"
										disabled={isCurrentDeliverer}
										className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
											isCurrentDeliverer
												? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
												: 'hover:bg-muted/50'
										}`}
									>
										<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
											{getInitials(c.user)}
										</span>
										<span className="flex-1">{getUserDisplayName(c.user)}</span>
										{isCurrentDeliverer && (
											<LuCheck size={14} className="text-blue-600" />
										)}
									</button>
								</delivererFetcher.Form>
							)
						})}
					</div>
				</Stack>
			</Stack>
		</Card>
	)
}

// Invite link section
const InviteSection = ({
	poolId,
	inviteUrl,
}: {
	poolId: string
	inviteUrl: string | null
}) => {
	const fetcher = useFetcher()
	const freshUrl =
		fetcher.data && 'inviteUrl' in (fetcher.data as object)
			? (fetcher.data as { inviteUrl: string }).inviteUrl
			: inviteUrl

	const copyToClipboard = () => {
		if (freshUrl) void navigator.clipboard.writeText(freshUrl)
	}

	return (
		<Card className="p-4">
			<Stack gap={3}>
				<SectionHeading>Invite contributors</SectionHeading>
				<p className="text-xs text-muted-foreground">
					Anyone with this link can join as a contributor.
				</p>
				{freshUrl ? (
					<Flex gap={2}>
						<Input value={freshUrl} readOnly className="flex-1 text-xs" />
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={copyToClipboard}
							className="gap-1.5 shrink-0"
						>
							<LuClipboard size={13} /> Copy
						</Button>
					</Flex>
				) : (
					<fetcher.Form method="post">
						<input type="hidden" name="intent" value="generate-invite" />
						<input type="hidden" name="poolId" value={poolId} />
						<Button
							type="submit"
							size="sm"
							variant="outline"
							className="gap-1.5"
							disabled={fetcher.state !== 'idle'}
						>
							<LuLink size={13} />
							Generate invite link
						</Button>
					</fetcher.Form>
				)}
			</Stack>
		</Card>
	)
}

// ─── Main component ───────────────────────────────────────────────────────────

const PoolIndex = () => {
	const {
		pool,
		viewer,
		isOrganizer,
		canManage,
		myVoteIdeaId,
		contributionBreakdown,
		inviteUrl,
	} = useRouteLoaderData<typeof routeLoader>(
		'routes/pools+/$poolId+/_layout',
	)!

	const status = pool.status as PoolStatus
	const isOpen = status === POOL_STATUS.OPEN
	const isVoting = status === POOL_STATUS.VOTING
	const isDecided = status === POOL_STATUS.DECIDED
	const isPurchased = status === POOL_STATUS.PURCHASED
	const isDelivered = status === POOL_STATUS.DELIVERED
	const isCancelled = status === POOL_STATUS.CANCELLED
	const isActive = isOpen || isVoting
	const isCompleted = isDelivered || isCancelled

	const chosenIdea = pool.ideas.find(i => i.id === pool.chosenIdeaId) ?? null
	const isPurchaser = viewer?.userId === pool.purchaserId
	const isDeliverer = viewer?.userId === pool.delivererId

	const navigation = useNavigation()

	return (
		<Stack gap={6}>
			{/* ── Organizer controls — only shown when there's a voting action to take ── */}
			{canManage &&
				isActive &&
				(isVoting || (isOpen && pool.decisionMode === DECISION_MODE.VOTE)) && (
					<Card className="border-dashed p-4">
						<Stack gap={3}>
							<SectionHeading>Organizer controls</SectionHeading>
							<Flex gap={2} wrap="wrap">
								{isOpen && pool.decisionMode === DECISION_MODE.VOTE && (
									<Form method="post">
										<input type="hidden" name="intent" value="call-vote" />
										<input type="hidden" name="poolId" value={pool.id} />
										<Button type="submit" size="sm" variant="outline">
											Call a vote
										</Button>
									</Form>
								)}
								{isVoting && (
									<Form method="post">
										<input type="hidden" name="intent" value="close-vote" />
										<input type="hidden" name="poolId" value={pool.id} />
										<Button type="submit" size="sm" variant="outline">
											Close vote
										</Button>
									</Form>
								)}
							</Flex>
						</Stack>
					</Card>
				)}

			{/* ── Chosen gift (DECIDED+) ── */}
			{chosenIdea && (
				<ChosenGiftBanner
					idea={chosenIdea}
					finalPriceCents={pool.finalPriceCents}
					poolId={pool.id}
					canManage={canManage}
				/>
			)}

			{/* ── Purchaser CTA — right after the chosen gift so it's the next action ── */}
			{isDecided && isPurchaser && (
				<Form method="post">
					<input type="hidden" name="intent" value="mark-purchased" />
					<input type="hidden" name="poolId" value={pool.id} />
					<Button type="submit" className="w-full gap-2">
						<LuPackage size={16} />
						I bought it
					</Button>
				</Form>
			)}

			{/* ── Contribution breakdown (DECIDED+) ── */}
			{contributionBreakdown && (
				<ContributionBreakdown
					breakdown={contributionBreakdown}
					poolId={pool.id}
					isPurchaser={isPurchaser}
				/>
			)}

			{/* ── Deliverer CTA — shown after purchase is confirmed ── */}
			{isPurchased && isDeliverer && (
				<Form method="post">
					<input type="hidden" name="intent" value="mark-delivered" />
					<input type="hidden" name="poolId" value={pool.id} />
					<Button type="submit" className="w-full gap-2">
						<LuTruck size={16} />
						Mark as delivered
					</Button>
				</Form>
			)}

			{/* ── Ideas section (OPEN + VOTING) ── */}
			{isActive && (
				<Stack gap={3}>
					<Flex justify="between" align="center">
						<SectionHeading>
							Ideas{pool.ideas.length > 0 && ` (${pool.ideas.length})`}
						</SectionHeading>
						{isVoting && (
							<Badge className="bg-violet-100 text-violet-800 text-xs">
								Voting open
							</Badge>
						)}
					</Flex>

					{/* Ideas list — browsing is primary, form comes after */}
					{pool.ideas.length > 0 ? (
						<Stack gap={2}>
							{pool.ideas.map(idea => (
								<IdeaCard
									key={idea.id}
									idea={idea}
									poolId={pool.id}
									isVoting={isVoting}
									myVoteIdeaId={myVoteIdeaId}
									canManage={canManage}
									canDelete={
										canManage || idea.proposedById === viewer?.userId
									}
									canChoose={
										canManage && (isOpen || isVoting) && !pool.chosenIdeaId
									}
								/>
							))}
						</Stack>
					) : (
						<Text size="sm" className="text-center text-muted-foreground py-2">
							No ideas yet — be the first to suggest something!
						</Text>
					)}

					{/* Propose form — anchored at the bottom */}
					<ProposeIdeaForm poolId={pool.id} />
				</Stack>
			)}

			{/* ── Ideas recap (DECIDED+, non-chosen ideas) ── */}
			{!isActive && pool.ideas.length > 1 && (
				<Card className="overflow-hidden p-0">
					<div className="px-4 pt-4 pb-2">
						<SectionHeading>Other ideas that were proposed</SectionHeading>
					</div>
					<div className="divide-y">
						{pool.ideas
							.filter(i => i.id !== pool.chosenIdeaId)
							.map(idea => (
								<div key={idea.id} className="flex items-center justify-between px-4 py-2.5 opacity-60">
									<Text size="sm">{idea.name}</Text>
									{idea.estimatedPriceCents !== null && (
										<Text size="xs" className="shrink-0 pl-3 text-muted-foreground">
											{formatCents(idea.estimatedPriceCents)}
										</Text>
									)}
								</div>
							))}
					</div>
				</Card>
			)}

			{/* ── Contributors ── */}
			<ContributorsList
				contributors={pool.contributors}
				poolId={pool.id}
				viewerUserId={viewer?.userId ?? ''}
				organizerId={pool.organizerId}
				purchaserId={pool.purchaserId}
				delivererId={pool.delivererId}
				canManage={canManage}
				isDecided={isDecided || isPurchased || isDelivered}
			/>

			{/* ── Assign roles (organizer, DECIDED+, while roles still need setting) ── */}
			{canManage && (isDecided || isPurchased) && (
				<AssignRolesSection
					contributors={pool.contributors}
					poolId={pool.id}
					purchaserId={pool.purchaserId}
					delivererId={pool.delivererId}
				/>
			)}

			{/* ── Invite link (active pools, managers only) ── */}
			{canManage && isActive && (
				<InviteSection poolId={pool.id} inviteUrl={inviteUrl} />
			)}

			{/* ── Danger zone (organizer only) ── */}
			{isOrganizer && !isCompleted && (
				<Card className="border-destructive/40 bg-destructive/5 p-4">
					<Stack gap={3}>
						<SectionHeading>Danger zone</SectionHeading>
						<Text size="sm" className="text-muted-foreground">
							These actions are destructive. Double-check before proceeding.
						</Text>
						<Flex gap={2} wrap="wrap">
							{/* Cancel pool lives here — less drastic than delete but still destructive */}
							{isActive && (
								<Form
									method="post"
									onSubmit={e => {
										if (!confirm('Cancel this pool?')) e.preventDefault()
									}}
								>
									<input type="hidden" name="intent" value="cancel-pool" />
									<input type="hidden" name="poolId" value={pool.id} />
									<Button type="submit" size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5">
										Cancel pool
									</Button>
								</Form>
							)}
							<Form
								method="post"
								onSubmit={e => {
									if (!confirm('Delete this pool? This cannot be undone.'))
										e.preventDefault()
								}}
							>
								<input type="hidden" name="intent" value="delete-pool" />
								<input type="hidden" name="poolId" value={pool.id} />
								<Button type="submit" variant="destructive" size="sm">
									Delete pool
								</Button>
							</Form>
						</Flex>
					</Stack>
				</Card>
			)}
		</Stack>
	)
}

export default PoolIndex
