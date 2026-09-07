import {
	getFormProps,
	getInputProps,
	useForm,
	type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuClipboard, LuLink, LuSearch, LuUserPlus } from 'react-icons/lu';
import {
	useFetcher,
	useLoaderData,
	type LoaderFunctionArgs,
} from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import {
	EditableSection,
	ReadField,
	useExitOnSubmitSuccess,
} from '#app/components/editable-section.tsx';
import { ErrorList, Field } from '#app/components/forms.tsx';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Checkbox } from '#app/components/ui/checkbox.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import {
	ResponsiveDialog,
	ResponsiveDialogContent,
	ResponsiveDialogDescription,
	ResponsiveDialogFooter,
	ResponsiveDialogHeader,
	ResponsiveDialogTitle,
	ResponsiveDialogTrigger,
} from '#app/components/ui/responsive-dialog.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { formatCalendarDate } from '#app/utils/dates.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
	DECISION_MODE_LABELS,
	OCCASION_TYPE,
	OCCASION_TYPE_LABELS,
	POOL_STATUS,
	type DecisionMode,
	type OccasionType,
} from '#app/utils/pool-constants.ts';
import { getPoolInvitationManagerState } from '#app/utils/pool-invitations.server.ts';
import {
	canManagePool,
	isPoolOrganizer,
	type PoolForPermissions,
} from '#app/utils/pool-permissions.server.ts';
import { isPoolEmptyForDeletion } from '#app/utils/pool.server.ts';

// Reuse the shared pool action so cancel/delete/generate-invite/update-details
// all flow through one place.
export { action } from './__route.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
	const userId = await requireUserId(request);
	const poolId = params.poolId!;

	const pool = await prisma.pool.findUnique({
		where: { id: poolId },
		select: {
			id: true,
			title: true,
			occasionType: true,
			eventDate: true,
			decisionMode: true,
			status: true,
			organizerId: true,
			giftGroupId: true,
			recipientUserId: true,
			recipientName: true,
			inviteCode: true,
			recipientUser: { select: { name: true, username: true } },
		},
	});

	// Privacy: the recipient must never confirm a pool exists (mirror the main
	// pool loader). Anyone who can't manage the pool gets the same 404, so the
	// settings surface never reveals itself to non-managers.
	if (!pool || pool.recipientUserId === userId) {
		throw new Response('Not Found', { status: 404 });
	}

	const poolForPerms: PoolForPermissions = {
		id: pool.id,
		organizerId: pool.organizerId,
		giftGroupId: pool.giftGroupId,
		status: pool.status,
	};
	// Contributor access is already enforced by the parent `_layout` loader
	// (non-contributors get 404 there), so anyone reaching this loader is a
	// contributor — the same guard the shared action relies on. This narrows
	// it further to managers (organizer / group admin).
	if (!(await canManagePool(userId, poolForPerms))) {
		throw new Response('Not Found', { status: 404 });
	}

	const inviteUrl = pool.inviteCode
		? `${new URL(request.url).origin}/pools/join/${pool.inviteCode}`
		: null;

	const isOrganizer = isPoolOrganizer(userId, poolForPerms);
	const invitationState = await getPoolInvitationManagerState(pool.id, userId);

	return {
		pool,
		inviteUrl,
		isOrganizer,
		invitationState,
		// Hard delete is only offered for an empty "mistake" pool (no ideas, no
		// contributors beyond the organizer). Anything with memory shows Cancel.
		canHardDelete: isOrganizer && (await isPoolEmptyForDeletion(pool.id)),
	};
}

const PoolDetailsSchema = z.object({
	title: z.string().min(1, 'Give the pool a title').max(200),
	occasionType: z.enum(
		Object.values(OCCASION_TYPE) as [OccasionType, ...OccasionType[]],
	),
	eventDate: z.string().optional(),
	// Optional because the select is disabled (and omitted) once the pool is
	// past OPEN — see the matching note on the server UpdateDetailsSchema.
	decisionMode: z.enum(['ORGANIZER_PICKS', 'VOTE']).optional(),
});

function toDateInputValue(value: Date | string | null | undefined) {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toISOString().slice(0, 10);
}

const PoolSettings = () => {
	const { pool, inviteUrl, invitationState, canHardDelete } =
		useLoaderData<typeof loader>();
	const isClosed =
		pool.status === POOL_STATUS.DELIVERED ||
		pool.status === POOL_STATUS.CANCELLED;

	return (
		<Stack gap={6}>
			<div className="flex flex-col gap-1">
				<Text as="h1" size="xl" weight="bold">
					Pool settings
				</Text>
				<Text size="sm" className="text-muted-foreground">
					Everything about this pool as an entity — what it is, who it's for,
					and how the gift gets chosen.
				</Text>
			</div>

			<PoolDetailsCard pool={pool} isClosed={isClosed} />
			<InviteSection
				poolId={pool.id}
				inviteUrl={inviteUrl}
				invitationState={invitationState}
			/>
			{!isClosed && (
				<DangerZone
					poolId={pool.id}
					canHardDelete={canHardDelete}
					canCancel={pool.status !== POOL_STATUS.DELIVERED}
				/>
			)}
		</Stack>
	);
};
export default PoolSettings;

// ─── Pool details (read → edit) ────────────────────────────────────────────

function PoolDetailsCard({
	pool,
	isClosed,
}: {
	pool: {
		id: string;
		title: string;
		occasionType: string;
		eventDate: string | Date | null;
		decisionMode: string;
		status: string;
		recipientName: string | null;
		recipientUser: { name: string | null; username: string } | null;
	};
	isClosed: boolean;
}) {
	const fetcher = useFetcher<{ status?: string }>();
	const [editing, setEditing] = useState(false);
	const stopEditing = useCallback(() => setEditing(false), []);
	// The gift-selection method is only safe to switch before a vote is called.
	const methodLocked = pool.status !== POOL_STATUS.OPEN;

	const [form, fields] = useForm<z.input<typeof PoolDetailsSchema>>({
		id: 'pool-details',
		constraint: getZodConstraint(PoolDetailsSchema),
		lastResult: fetcher.data as unknown as SubmissionResult<string[]>,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PoolDetailsSchema }) as any;
		},
		defaultValue: {
			title: pool.title,
			occasionType: pool.occasionType as OccasionType,
			eventDate: toDateInputValue(pool.eventDate),
			decisionMode: pool.decisionMode as DecisionMode,
		},
	});

	useExitOnSubmitSuccess({
		state: fetcher.state,
		success: form.status === 'success',
		onExit: stopEditing,
	});

	const recipientLabel =
		pool.recipientName ??
		pool.recipientUser?.name ??
		pool.recipientUser?.username ??
		'Someone special';
	const eventDateDisplay = pool.eventDate
		? formatCalendarDate(pool.eventDate)
		: 'Not set';

	return (
		<EditableSection
			title="Pool details"
			description="The basics of this pool."
			editLabel="Edit details"
			editing={editing && !isClosed}
			onEdit={() => setEditing(true)}
			read={
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<ReadField label="Title" value={pool.title} />
					<ReadField label="For" value={recipientLabel} />
					<ReadField
						label="Occasion"
						value={OCCASION_TYPE_LABELS[pool.occasionType as OccasionType]}
					/>
					<ReadField label="Date" value={eventDateDisplay} />
					<ReadField
						label="Gift-selection method"
						value={DECISION_MODE_LABELS[pool.decisionMode as DecisionMode]}
					/>
				</div>
			}
		>
			<fetcher.Form
				method="post"
				{...getFormProps(form)}
				className="flex flex-col gap-4"
			>
				<input type="hidden" name="intent" value="update-pool-details" />
				<input type="hidden" name="poolId" value={pool.id} />

				<Field
					labelProps={{ htmlFor: fields.title.id, children: 'Title' }}
					inputProps={getInputProps(fields.title, { type: 'text' })}
					errors={fields.title.errors}
				/>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={fields.occasionType.id}>Occasion</Label>
						<select
							id={fields.occasionType.id}
							name={fields.occasionType.name}
							defaultValue={pool.occasionType}
							className="flex h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-base ring-offset-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
						>
							{Object.entries(OCCASION_TYPE_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>

					<Field
						labelProps={{ htmlFor: fields.eventDate.id, children: 'Date' }}
						inputProps={{
							...getInputProps(fields.eventDate, { type: 'date' }),
							required: false,
						}}
						errors={fields.eventDate.errors}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor={fields.decisionMode.id}>Gift-selection method</Label>
					<select
						id={fields.decisionMode.id}
						name={fields.decisionMode.name}
						defaultValue={pool.decisionMode}
						disabled={methodLocked}
						className="flex h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-base ring-offset-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
					>
						{Object.entries(DECISION_MODE_LABELS).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
					<Text size="xs" className="text-muted-foreground">
						{methodLocked
							? 'Locked once the pool moves past the open stage.'
							: 'Organizer chooses, or the group votes on the gift.'}
					</Text>
				</div>

				<ErrorList errors={form.errors} id={form.errorId} />
				<div className="flex justify-end gap-2">
					<Button type="button" variant="ghost" onClick={stopEditing}>
						Cancel
					</Button>
					<StatusButton
						type="submit"
						status={
							fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
						}
					>
						Save details
					</StatusButton>
				</div>
			</fetcher.Form>
		</EditableSection>
	);
}

// ─── Invite contributors ───────────────────────────────────────────────────

const InviteSection = ({
	poolId,
	inviteUrl,
	invitationState,
}: {
	poolId: string;
	inviteUrl: string | null;
	invitationState: Awaited<ReturnType<typeof getPoolInvitationManagerState>>;
}) => {
	const fetcher = useFetcher<{ inviteUrl?: string }>();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [sending, setSending] = useState(false);
	const [cancellingId, setCancellingId] = useState<string | null>(null);
	const [candidates, setCandidates] = useState(invitationState.candidates);
	const [pendingInvitations, setPendingInvitations] = useState(
		invitationState.pendingInvitations,
	);
	const freshUrl =
		fetcher.data && 'inviteUrl' in (fetcher.data as object)
			? (fetcher.data as { inviteUrl: string }).inviteUrl
			: inviteUrl;

	useEffect(() => {
		if (
			fetcher.state === 'idle' &&
			fetcher.data &&
			'inviteUrl' in (fetcher.data as object)
		) {
			const url = (fetcher.data as { inviteUrl: string }).inviteUrl;
			if (url) void navigator.clipboard.writeText(url);
		}
	}, [fetcher.state, fetcher.data]);

	const filteredCandidates = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return candidates;
		return candidates.filter(
			(candidate) =>
				(candidate.name ?? '').toLowerCase().includes(normalized) ||
				candidate.username.toLowerCase().includes(normalized),
		);
	}, [candidates, query]);
	const sendButtonLabel = sending
		? 'Sending…'
		: `Send ${selectedIds.size || ''} invitation${
				selectedIds.size === 1 ? '' : 's'
			}`;

	const sendInvitations = async () => {
		if (selectedIds.size === 0 || sending) return;
		setSending(true);
		try {
			const response = await fetch(`/api/pools/${poolId}/invitations`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ inviteeIds: [...selectedIds] }),
			});
			const payload = (await response.json()) as {
				error?: string;
				invitations?: Array<{ id: string; inviteeId: string }>;
			};
			if (!response.ok) {
				throw new Error(payload.error ?? 'Unable to invite people.');
			}
			const sentCount = selectedIds.size;
			const candidateById = new Map(
				candidates.map((candidate) => [candidate.id, candidate]),
			);
			const sentRows = (payload.invitations ?? []).flatMap((invitation) => {
				const invitee = candidateById.get(invitation.inviteeId);
				return invitee
					? [{ ...invitation, createdAt: new Date(), invitee }]
					: [];
			});
			setCandidates((previous) =>
				previous.filter((candidate) => !selectedIds.has(candidate.id)),
			);
			setPendingInvitations((previous) => [...sentRows, ...previous]);
			toast.success(
				sentCount === 1 ? 'Invitation sent.' : `${sentCount} invitations sent.`,
			);
			setDialogOpen(false);
			setSelectedIds(new Set());
			setQuery('');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to invite people.',
			);
		} finally {
			setSending(false);
		}
	};

	const cancelInvitation = async (invitationId: string) => {
		if (cancellingId) return;
		const cancelledInvitation = pendingInvitations.find(
			(invitation) => invitation.id === invitationId,
		);
		setCancellingId(invitationId);
		try {
			const response = await fetch(
				`/api/pool-invitations/${invitationId}/cancel`,
				{
					method: 'POST',
					credentials: 'same-origin',
					headers: { Accept: 'application/json' },
				},
			);
			if (!response.ok) throw new Error('Unable to cancel the invitation.');
			setPendingInvitations((previous) =>
				previous.filter((invitation) => invitation.id !== invitationId),
			);
			if (cancelledInvitation) {
				setCandidates((previous) => [
					...previous,
					{ ...cancelledInvitation.invitee, contributionCents: null },
				]);
			}
			toast.success('Invitation cancelled.');
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Unable to cancel the invitation.',
			);
		} finally {
			setCancellingId(null);
		}
	};

	return (
		<Card className="p-4">
			<Stack gap={4}>
				<Text size="lg" weight="semibold">
					Invite contributors
				</Text>
				<p className="text-sm text-muted-foreground">
					Send a private invitation to eligible people, or share a link.
				</p>

				<ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
					<ResponsiveDialogTrigger asChild>
						<Button
							type="button"
							className="w-full gap-2 sm:w-fit"
							disabled={!invitationState.isActive || candidates.length === 0}
						>
							<LuUserPlus className="size-4" aria-hidden />
							Invite people
						</Button>
					</ResponsiveDialogTrigger>
					<ResponsiveDialogContent className="sm:max-w-lg">
						<ResponsiveDialogHeader>
							<ResponsiveDialogTitle>Invite people</ResponsiveDialogTitle>
							<ResponsiveDialogDescription>
								Choose eligible people to invite to {invitationState.poolTitle}.
								They decide whether to join.
							</ResponsiveDialogDescription>
						</ResponsiveDialogHeader>

						<div className="relative">
							<LuSearch
								className="absolute left-3 top-3 size-4 text-muted-foreground"
								aria-hidden
							/>
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search by name or username"
								className="pl-9"
							/>
						</div>

						<div className="max-h-72 overflow-y-auto rounded-md border">
							{filteredCandidates.length > 0 ? (
								filteredCandidates.map((candidate) => {
									const checked = selectedIds.has(candidate.id);
									const displayName = candidate.name ?? candidate.username;
									return (
										<label
											key={candidate.id}
											className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
										>
											<Checkbox
												checked={checked}
												onCheckedChange={(next) => {
													setSelectedIds((previous) => {
														const updated = new Set(previous);
														if (next) updated.add(candidate.id);
														else updated.delete(candidate.id);
														return updated;
													});
												}}
												aria-label={`Invite ${displayName}`}
											/>
											<Avatar
												user={candidate}
												image={candidate.image}
												size="s"
											/>
											<span className="min-w-0">
												<span className="block truncate text-sm font-medium">
													{displayName}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													@{candidate.username}
												</span>
											</span>
										</label>
									);
								})
							) : (
								<p className="p-6 text-center text-sm text-muted-foreground">
									No eligible people match your search.
								</p>
							)}
						</div>

						<ResponsiveDialogFooter>
							<Button
								type="button"
								onClick={() => void sendInvitations()}
								disabled={selectedIds.size === 0 || sending}
								className="min-h-11"
							>
								{sendButtonLabel}
							</Button>
						</ResponsiveDialogFooter>
					</ResponsiveDialogContent>
				</ResponsiveDialog>

				{candidates.length === 0 && invitationState.isActive ? (
					<p className="text-xs text-muted-foreground">
						Everyone eligible is already a contributor or has been invited.
					</p>
				) : null}

				{pendingInvitations.length > 0 ? (
					<div className="space-y-2 border-t pt-4">
						<p className="text-sm font-medium">Pending invitations</p>
						{pendingInvitations.map((invitation) => {
							const displayName =
								invitation.invitee.name ?? invitation.invitee.username;
							return (
								<div
									key={invitation.id}
									className="flex items-center justify-between gap-3 rounded-lg border p-3"
								>
									<div className="flex min-w-0 items-center gap-3">
										<Avatar
											user={invitation.invitee}
											image={invitation.invitee.image}
											size="s"
										/>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">
												{displayName}
											</p>
											<p className="text-xs text-muted-foreground">
												Awaiting response
											</p>
										</div>
									</div>
									<ConfirmDialog
										title="Cancel this invitation?"
										description={`${displayName} will no longer be able to accept it.`}
										confirmText="Cancel invitation"
										onConfirm={() => void cancelInvitation(invitation.id)}
									>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={cancellingId === invitation.id}
										>
											Cancel
										</Button>
									</ConfirmDialog>
								</div>
							);
						})}
					</div>
				) : null}

				<div className="space-y-2 border-t pt-4">
					<p className="text-sm font-medium">Share a link instead</p>
					<p className="text-xs text-muted-foreground">
						Anyone with the link can join as a contributor.
					</p>
					{freshUrl ? (
						<Flex gap={2}>
							<Input value={freshUrl} readOnly className="flex-1 text-xs" />
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => navigator.clipboard.writeText(freshUrl)}
								className="shrink-0 gap-1.5"
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
				</div>
			</Stack>
		</Card>
	);
};

// ─── Danger zone ───────────────────────────────────────────────────────────

const DangerZone = ({
	poolId,
	canHardDelete,
	canCancel,
}: {
	poolId: string;
	canHardDelete: boolean;
	canCancel: boolean;
}) => {
	const cancelFetcher = useFetcher();
	const deleteFetcher = useFetcher();

	const submitIntent = (
		fetcher: ReturnType<typeof useFetcher>,
		intent: string,
	) => {
		const fd = new FormData();
		fd.set('intent', intent);
		fd.set('poolId', poolId);
		void fetcher.submit(fd, { method: 'post' });
	};

	return (
		<Card className="border-destructive/40 bg-destructive/5 p-4">
			<Stack gap={3}>
				<Text size="lg" weight="semibold">
					Danger zone
				</Text>
				<Text size="sm" className="text-muted-foreground">
					These actions are destructive. Double-check before proceeding.
				</Text>
				<Flex gap={2} wrap="wrap">
					{canCancel && (
						<ConfirmDialog
							title="Cancel this pool?"
							description="Contributors will no longer be able to act on it."
							consequences={[
								'Any claim this pool holds on the wishlist item is released, and may transfer immediately to another pool waiting on the same item.',
								"This can't be undone.",
							]}
							confirmText="Cancel pool"
							onConfirm={() => submitIntent(cancelFetcher, 'cancel-pool')}
						>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="border-destructive/40 text-destructive hover:bg-destructive/5"
							>
								Cancel pool
							</Button>
						</ConfirmDialog>
					)}
					{canHardDelete && (
						<ConfirmDialog
							title="Delete this pool?"
							description="This permanently deletes the pool and everything in it."
							confirmText="Delete pool"
							requireText="DELETE"
							onConfirm={() => submitIntent(deleteFetcher, 'delete-pool')}
						>
							<Button type="button" variant="destructive" size="sm">
								Delete pool
							</Button>
						</ConfirmDialog>
					)}
				</Flex>
			</Stack>
		</Card>
	);
};
