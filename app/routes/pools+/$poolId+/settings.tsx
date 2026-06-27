import {
	getFormProps,
	getInputProps,
	useForm,
	type SubmissionResult,
} from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { useCallback, useEffect, useState } from 'react';
import { LuClipboard, LuLink } from 'react-icons/lu';
import {
	useFetcher,
	useLoaderData,
	type LoaderFunctionArgs,
} from 'react-router';
import { z } from 'zod';
import {
	EditableSection,
	ReadField,
	useExitOnSubmitSuccess,
} from '#app/components/editable-section.tsx';
import { ErrorList, Field } from '#app/components/forms.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { StatusButton } from '#app/components/ui/status-button.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import {
	DECISION_MODE_LABELS,
	OCCASION_TYPE,
	OCCASION_TYPE_LABELS,
	POOL_STATUS,
	type DecisionMode,
	type OccasionType,
} from '#app/utils/pool-constants.ts';
import {
	canManagePool,
	isPoolOrganizer,
	type PoolForPermissions,
} from '#app/utils/pool-permissions.server.ts';

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
	if (!(await canManagePool(userId, poolForPerms))) {
		throw new Response('Not Found', { status: 404 });
	}

	const inviteUrl = pool.inviteCode
		? `${new URL(request.url).origin}/pools/join/${pool.inviteCode}`
		: null;

	return {
		pool,
		inviteUrl,
		isOrganizer: isPoolOrganizer(userId, poolForPerms),
	};
}

const PoolDetailsSchema = z.object({
	title: z.string().min(1, 'Give the pool a title').max(200),
	occasionType: z.enum(
		Object.values(OCCASION_TYPE) as [OccasionType, ...OccasionType[]],
	),
	eventDate: z.string().optional(),
	decisionMode: z.enum(['ORGANIZER_PICKS', 'VOTE']),
});

function toDateInputValue(value: Date | string | null | undefined) {
	if (!value) return '';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toISOString().slice(0, 10);
}

const PoolSettings = () => {
	const { pool, inviteUrl, isOrganizer } = useLoaderData<typeof loader>();
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
			<InviteSection poolId={pool.id} inviteUrl={inviteUrl} />
			{!isClosed && (
				<DangerZone
					poolId={pool.id}
					isOrganizer={isOrganizer}
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
		? new Date(pool.eventDate).toLocaleDateString()
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
							className="flex h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:text-sm"
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
						className="flex h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
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
}: {
	poolId: string;
	inviteUrl: string | null;
}) => {
	const fetcher = useFetcher<{ inviteUrl?: string }>();
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

	return (
		<Card className="p-4">
			<Stack gap={3}>
				<Text size="lg" weight="semibold">
					Invite contributors
				</Text>
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
			</Stack>
		</Card>
	);
};

// ─── Danger zone ───────────────────────────────────────────────────────────

const DangerZone = ({
	poolId,
	isOrganizer,
	canCancel,
}: {
	poolId: string;
	isOrganizer: boolean;
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
							description="Contributors will no longer be able to act on it. This can't be undone."
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
					{isOrganizer && (
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
