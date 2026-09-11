import { getFormProps, getInputProps, useForm } from '@conform-to/react';
import { parseWithZod } from '@conform-to/zod';
import { useState } from 'react';
import { LuGift } from 'react-icons/lu';
import {
  data,
  Form,
  Link,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from 'react-router';
import { z } from 'zod';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { Flex, Stack, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getUserImgSrc } from '#app/utils/misc.tsx';
import {
  OCCASION_TYPE,
  OCCASION_TYPE_LABELS,
  DECISION_MODE,
  DECISION_MODE_LABELS,
  type OccasionType,
} from '#app/utils/pool-constants.ts';
import { createPool } from '#app/utils/pool.server.ts';

// ─── Schema ──────────────────────────────────────────────────────────────────

const CreatePoolSchema = z.object({
  title: z.string().min(1, 'Give your pool a title').max(100),
  occasionType: z.enum(
    Object.values(OCCASION_TYPE) as [OccasionType, ...OccasionType[]],
  ),
  eventDate: z.string().optional(),
  decisionMode: z.enum(['ORGANIZER_PICKS', 'VOTE']),
  recipientName: z.string().optional(),
  giftGroupId: z.string().optional(),
  recipientUserId: z.string().optional(),
  contributorIds: z.string().optional(),
});

// ─── Loader ──────────────────────────────────────────────────────────────────

type GroupContext = {
  groupId: string;
  groupName: string;
  recipient: { id: string; name: string; username: string };
  members: Array<{
    userId: string;
    name: string;
    username: string;
    imageId: string | null;
  }>;
  // Recipient-excluded aggregate of member default caps (individual caps are
  // private per ADR 0001; the action re-derives them server-side).
  circleBudgetCents: number;
};

type RecipientCandidate = {
  id: string;
  name: string;
  username: string;
  imageId: string | null;
};

async function fetchRecipientCandidates(
  viewerId: string,
): Promise<RecipientCandidate[]> {
  const [friendships, groupMemberships] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [{ userAId: viewerId }, { userBId: viewerId }],
      },
      select: {
        userA: {
          select: {
            id: true,
            name: true,
            username: true,
            image: { select: { id: true } },
          },
        },
        userB: {
          select: {
            id: true,
            name: true,
            username: true,
            image: { select: { id: true } },
          },
        },
      },
    }),
    prisma.usersInGiftGroups.findMany({
      where: {
        giftGroup: { groupMembers: { some: { userId: viewerId } } },
        userId: { not: viewerId },
        removedAt: null,
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            image: { select: { id: true } },
          },
        },
      },
    }),
  ]);

  const map = new Map<string, RecipientCandidate>();
  for (const f of friendships) {
    const other = f.userA.id === viewerId ? f.userB : f.userA;
    map.set(other.id, {
      id: other.id,
      name: other.name ?? other.username,
      username: other.username,
      imageId: other.image?.id ?? null,
    });
  }
  for (const m of groupMemberships) {
    if (map.has(m.user.id)) continue;
    map.set(m.user.id, {
      id: m.user.id,
      name: m.user.name ?? m.user.username,
      username: m.user.username,
      imageId: m.user.image?.id ?? null,
    });
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const groupId = url.searchParams.get('groupId');
  const recipientId = url.searchParams.get('recipientId');

  // Optional idea title prefill — the person surface's "Propose to pool" with
  // no open pool routes here carrying the idea so it seeds the new pool.
  const titlePrefill = url.searchParams.get('title') ?? '';

  if (!groupId || !recipientId) {
    const candidates = await fetchRecipientCandidates(userId);
    // Standalone prefill: the person surface can pass ?recipientId=<id> alone
    // (friend-only Organize). Preselect that candidate so the organizer lands
    // with the recipient already chosen.
    const preselectedRecipient = recipientId
      ? (candidates.find((c) => c.id === recipientId) ?? null)
      : null;
    return {
      groupContext: null as GroupContext | null,
      candidates,
      preselectedRecipient,
      titlePrefill,
    };
  }

  const group = await prisma.giftGroup.findUnique({
    where: { id: groupId },
    select: {
      name: true,
      groupMembers: {
        where: { removedAt: null },
        select: {
          userId: true,
          contributionCents: true,
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              image: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!group) {
    return {
      groupContext: null as GroupContext | null,
      candidates: [] as RecipientCandidate[],
      preselectedRecipient: null as RecipientCandidate | null,
      titlePrefill,
    };
  }

  const viewerMember = group.groupMembers.find((m) => m.userId === userId);
  if (!viewerMember) {
    return {
      groupContext: null as GroupContext | null,
      candidates: [] as RecipientCandidate[],
      preselectedRecipient: null as RecipientCandidate | null,
      titlePrefill,
    };
  }

  const recipientMember = group.groupMembers.find(
    (m) => m.userId === recipientId,
  );
  if (!recipientMember) {
    return {
      groupContext: null as GroupContext | null,
      candidates: [] as RecipientCandidate[],
      preselectedRecipient: null as RecipientCandidate | null,
      titlePrefill,
    };
  }

  // Individual default caps are private (ADR 0001) — the client gets member
  // identities plus the recipient-excluded aggregate only. The action
  // re-derives authoritative per-member defaults server-side on create.
  const members = group.groupMembers
    .filter((m) => m.userId !== recipientId)
    .map((m) => ({
      userId: m.userId,
      name: m.user.name ?? m.user.username,
      username: m.user.username,
      imageId: m.user.image?.id ?? null,
    }));
  const circleBudgetCents = group.groupMembers
    .filter((m) => m.userId !== recipientId)
    .reduce((sum, m) => sum + (m.contributionCents ?? 0), 0);

  const groupContext: GroupContext = {
    groupId,
    groupName: group.name,
    recipient: {
      id: recipientMember.userId,
      name: recipientMember.user.name ?? recipientMember.user.username,
      username: recipientMember.user.username,
    },
    members,
    circleBudgetCents,
  };

  return {
    groupContext,
    candidates: [] as RecipientCandidate[],
    preselectedRecipient: null as RecipientCandidate | null,
    titlePrefill,
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────

type RecipientResolution = {
  recipientUserId: string | null;
  groupMemberDefaults: Array<{ userId: string; contributionCents: number }>;
};

type ResolutionResult =
  | { ok: true; value: RecipientResolution }
  | { ok: false; response: ReturnType<typeof data> };

async function resolveGroupBackedRecipient(
  userId: string,
  giftGroupId: string,
  formRecipientUserId: string,
  contributorIdsRaw: string | undefined,
  submission: Awaited<ReturnType<typeof parseWithZod<typeof CreatePoolSchema>>>,
): Promise<ResolutionResult> {
  // Validate: organizer must be in the group
  const membership = await prisma.usersInGiftGroups.findUnique({
    where: { userId_giftGroupId: { userId, giftGroupId } },
    select: { userId: true },
  });
  if (!membership) {
    return {
      ok: false,
      response: data(
        submission.reply({
          formErrors: ['You are not a member of this group.'],
        }),
        { status: 403 },
      ),
    };
  }

  // Validate: recipient must be in the group
  const recipientMembership = await prisma.usersInGiftGroups.findUnique({
    where: {
      userId_giftGroupId: { userId: formRecipientUserId, giftGroupId },
    },
    select: { userId: true },
  });
  if (!recipientMembership) {
    return {
      ok: false,
      response: data(
        submission.reply({
          formErrors: ['The recipient is not a member of this group.'],
        }),
        { status: 400 },
      ),
    };
  }

  const selectedIds = contributorIdsRaw
    ? contributorIdsRaw.split(',').filter(Boolean)
    : [];
  if (selectedIds.length === 0) {
    return {
      ok: false,
      response: data(
        submission.reply({
          formErrors: ['Select at least one contributor.'],
        }),
        { status: 400 },
      ),
    };
  }

  // createPool always adds the organizer, so include them when resolving
  // contribution defaults even if the submitted picker selection omits them.
  const contributorIds = [...new Set([...selectedIds, userId])];

  // Re-derive authoritative contribution defaults from the DB; filter out
  // the recipient — they must never be a contributor.
  const members = await prisma.usersInGiftGroups.findMany({
    where: {
      giftGroupId,
      userId: { in: contributorIds },
      removedAt: null,
    },
    select: { userId: true, contributionCents: true },
  });
  const groupMemberDefaults = members
    .filter((m) => m.userId !== formRecipientUserId)
    .map((m) => ({
      userId: m.userId,
      contributionCents: m.contributionCents,
    }));

  return {
    ok: true,
    value: {
      recipientUserId: formRecipientUserId,
      groupMemberDefaults,
    },
  };
}

async function resolveStandaloneRecipient(
  userId: string,
  formRecipientUserId: string,
  submission: Awaited<ReturnType<typeof parseWithZod<typeof CreatePoolSchema>>>,
): Promise<ResolutionResult> {
  // Validate the picker selection against the viewer's candidate pool
  // (friends + group members). Prevents arbitrary user ids being
  // submitted via a tampered form.
  const candidates = await fetchRecipientCandidates(userId);
  const match = candidates.find((c) => c.id === formRecipientUserId);
  if (!match) {
    return {
      ok: false,
      response: data(
        submission.reply({
          formErrors: ['That person is not in your friends or group members.'],
        }),
        { status: 400 },
      ),
    };
  }
  return {
    ok: true,
    value: {
      recipientUserId: match.id,
      groupMemberDefaults: [],
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema: CreatePoolSchema });

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 });
  }

  const {
    title,
    occasionType,
    eventDate,
    decisionMode,
    recipientName,
    giftGroupId,
    recipientUserId: formRecipientUserId,
    contributorIds: contributorIdsRaw,
  } = submission.value;

  let recipientUserId: string | null = null;
  let groupMemberDefaults: Array<{
    userId: string;
    contributionCents: number;
  }> = [];

  if (giftGroupId && formRecipientUserId) {
    const result = await resolveGroupBackedRecipient(
      userId,
      giftGroupId,
      formRecipientUserId,
      contributorIdsRaw,
      submission,
    );
    if (!result.ok) return result.response;
    recipientUserId = result.value.recipientUserId;
    groupMemberDefaults = result.value.groupMemberDefaults;
  } else if (formRecipientUserId) {
    const result = await resolveStandaloneRecipient(
      userId,
      formRecipientUserId,
      submission,
    );
    if (!result.ok) return result.response;
    recipientUserId = result.value.recipientUserId;
  }

  const pool = await createPool({
    title,
    occasionType,
    eventDate: eventDate ? new Date(eventDate) : null,
    decisionMode,
    recipientUserId,
    recipientName: recipientName || null,
    giftGroupId: giftGroupId || null,
    organizerId: userId,
    groupMemberDefaults,
  });

  return redirect(`/pools/${pool.id}`);
}

// ─── Component ───────────────────────────────────────────────────────────────

const NewPool = () => {
  const { groupContext, candidates, preselectedRecipient, titlePrefill } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const [form, fields] = useForm<z.input<typeof CreatePoolSchema>>({
    // `action` returns a union of data() responses with differently-shaped
    // formErrors (string[] in some branches, unknown in others). Cast so
    // useForm's stricter SubmissionResult<string[]> binding is satisfied.
    lastResult: actionData as
      | Parameters<
          typeof useForm<z.input<typeof CreatePoolSchema>>
        >[0]['lastResult']
      | undefined,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: CreatePoolSchema });
    },
    defaultValue: {
      title: titlePrefill || undefined,
      occasionType: OCCASION_TYPE.BIRTHDAY,
      decisionMode: DECISION_MODE.ORGANIZER_PICKS,
    },
  });

  const cancelHref = groupContext
    ? `/groups/${groupContext.groupId}`
    : '/pools';
  const backLabel = groupContext ? groupContext.groupName : 'Pools';
  const backHref = cancelHref;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b bg-surface px-4 py-4 shadow">
        <div className="container flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link to={backHref}>
              <Icon name="arrow-left" className="mr-1" /> {backLabel}
            </Link>
          </Button>
          <Flex gap={2} align="center">
            <LuGift className="text-primary" />
            <Text weight="bold">Start a Pool</Text>
          </Flex>
        </div>
      </div>

      <div className="container max-w-lg py-8">
        <Form method="post" {...getFormProps(form)}>
          {groupContext && (
            <>
              <input
                type="hidden"
                name="giftGroupId"
                value={groupContext.groupId}
              />
              <input
                type="hidden"
                name="recipientUserId"
                value={groupContext.recipient.id}
              />
            </>
          )}

          {form.errors && form.errors.length > 0 && (
            <Card padding="md" className="mb-6 border-destructive">
              {form.errors.map((error) => (
                <Text key={error} size="sm" className="text-destructive">
                  {error}
                </Text>
              ))}
            </Card>
          )}

          <Stack gap={6}>
            {groupContext && (
              <Card padding="md" className="border-primary/20 bg-primary/5">
                <Flex gap={2} align="center">
                  <LuGift className="shrink-0 text-primary" size={16} />
                  <Text size="sm">
                    Creating a pool in{' '}
                    <span className="font-semibold">
                      {groupContext.groupName}
                    </span>{' '}
                    for{' '}
                    <span className="font-semibold">
                      {groupContext.recipient.name}
                    </span>
                  </Text>
                </Flex>
              </Card>
            )}

            <Stack gap={2}>
              <Label htmlFor={fields.title.id}>Pool title</Label>
              <Input
                {...getInputProps(fields.title, { type: 'text' })}
                placeholder={
                  groupContext
                    ? `e.g. ${groupContext.recipient.name}'s Birthday`
                    : "e.g. Marco's 30th Birthday"
                }
                autoFocus
              />
              {fields.title.errors && (
                <Text size="sm" className="text-destructive">
                  {fields.title.errors[0]}
                </Text>
              )}
            </Stack>

            <Stack gap={2}>
              <Label htmlFor={fields.occasionType.id}>Occasion</Label>
              <select
                {...getInputProps(fields.occasionType, { type: 'text' })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-transparent focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Object.entries(OCCASION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Stack>

            <Stack gap={2}>
              <Label htmlFor={fields.eventDate.id}>
                Event date{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input {...getInputProps(fields.eventDate, { type: 'date' })} />
            </Stack>

            {groupContext ? (
              <ContributorPicker members={groupContext.members} />
            ) : (
              <RecipientPicker
                candidates={candidates}
                nameFieldName={fields.recipientName.name}
                initialSelected={preselectedRecipient}
              />
            )}

            <Stack gap={2}>
              <Label>How will you pick the gift?</Label>
              <Stack gap={2}>
                {Object.entries(DECISION_MODE_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-3"
                  >
                    <input
                      type="radio"
                      name={fields.decisionMode.name}
                      value={value}
                      defaultChecked={value === DECISION_MODE.ORGANIZER_PICKS}
                      className="text-primary"
                    />
                    <Stack gap={0}>
                      <Text weight="medium" size="sm">
                        {label}
                      </Text>
                      <Text size="xs" className="text-muted-foreground">
                        {value === DECISION_MODE.ORGANIZER_PICKS
                          ? 'You pick the winner from the ideas list.'
                          : 'Everyone votes and the most popular idea wins.'}
                      </Text>
                    </Stack>
                  </label>
                ))}
              </Stack>
            </Stack>

            <Flex gap={3} justify="end">
              <Button asChild variant="outline">
                <Link to={cancelHref}>Cancel</Link>
              </Button>
              <Button type="submit">Start Pool</Button>
            </Flex>
          </Stack>
        </Form>
      </div>
    </div>
  );
};

export default NewPool;

// ─── Recipient Picker (standalone flow) ──────────────────────────────────────

const RecipientPicker = ({
  candidates,
  nameFieldName,
  initialSelected = null,
}: {
  candidates: RecipientCandidate[];
  nameFieldName: string;
  initialSelected?: RecipientCandidate | null;
}) => {
  const [selected, setSelected] = useState<RecipientCandidate | null>(
    initialSelected,
  );
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? candidates
        .filter(
          (c) =>
            c.name.toLowerCase().includes(normalizedQuery) ||
            c.username.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, 8)
    : candidates.slice(0, 8);

  if (selected) {
    return (
      <Stack gap={2}>
        <Text weight="medium">Who is this for?</Text>
        <input type="hidden" name="recipientUserId" value={selected.id} />
        <Card padding="sm" className="border-primary/30 bg-primary/5">
          <Flex gap={3} align="center">
            <img
              src={getUserImgSrc(selected.imageId, { size: 64 })}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
            <Stack gap={0} className="min-w-0 flex-1">
              <Text size="sm" weight="medium" className="truncate">
                {selected.name}
              </Text>
              <Text size="xs" className="text-muted-foreground">
                @{selected.username}
              </Text>
            </Stack>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(null);
                setQuery('');
              }}
              aria-label="Clear selection"
            >
              <Icon name="cross-1" />
            </Button>
          </Flex>
        </Card>
        <Text size="xs" className="text-muted-foreground">
          They'll never see this pool. We'll link their wishlist if they have
          one.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Text weight="medium">Who is this for?</Text>
      <Stack gap={2}>
        <Label htmlFor="recipient-search">Find a friend or group member</Label>
        <div className="relative">
          <Input
            id="recipient-search"
            type="text"
            value={query}
            placeholder="Search by name or @username"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Delay so a click on a dropdown row fires before we close.
              setTimeout(() => setOpen(false), 150);
            }}
          />
          {open && matches.length > 0 && (
            <Card
              padding="none"
              className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-y-auto"
            >
              <ul>
                {matches.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        // Prevent input blur from firing before onClick.
                        e.preventDefault();
                      }}
                      onClick={() => {
                        setSelected(c);
                        setQuery('');
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50 ${i > 0 ? 'border-t border-border' : ''}`}
                    >
                      <img
                        src={getUserImgSrc(c.imageId, { size: 64 })}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {c.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          @{c.username}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {open && query && matches.length === 0 && (
            <Card padding="sm" className="absolute top-full z-10 mt-1 w-full">
              <Text size="xs" className="text-muted-foreground">
                No matches in your friends or groups. Use the name field below
                instead.
              </Text>
            </Card>
          )}
        </div>
        {candidates.length === 0 && (
          <Text size="xs" className="text-muted-foreground">
            Once you add friends or join groups, they'll show up here.
          </Text>
        )}
      </Stack>
      <Stack gap={2}>
        <Label htmlFor="recipient-name-fallback">
          Or just their name{' '}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="recipient-name-fallback"
          name={nameFieldName}
          type="text"
          placeholder="e.g. Marco"
        />
        <Text size="xs" className="text-muted-foreground">
          For someone who isn't on GiftPool yet.
        </Text>
      </Stack>
    </Stack>
  );
};

// ─── Contributor Picker (group-backed flow) ──────────────────────────────────

type PickerMember = {
  userId: string;
  name: string;
  username: string;
  imageId: string | null;
};

const ContributorPicker = ({ members }: { members: PickerMember[] }) => {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(members.map((m) => m.userId)),
  );

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const allSelected = selected.size === members.length;
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(members.map((m) => m.userId)));
    }
  };

  return (
    <Stack gap={2}>
      <input
        type="hidden"
        name="contributorIds"
        value={Array.from(selected).join(',')}
      />
      <Flex justify="between" align="center">
        <Text weight="medium">Contributors</Text>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-primary hover:underline"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </Flex>
      <Text size="xs" className="text-muted-foreground">
        Everyone selected will be added to this pool automatically.
      </Text>
      <Card padding="none">
        <Stack gap={0}>
          {members.map((member, i) => (
            <label
              key={member.userId}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.has(member.userId)}
                onChange={() => toggle(member.userId)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <img
                src={getUserImgSrc(member.imageId, { size: 64 })}
                alt=""
                className="h-7 w-7 shrink-0 rounded-full object-cover"
              />
              <Stack gap={0} className="min-w-0 flex-1">
                <Text size="sm" weight="medium" className="truncate">
                  {member.name}
                </Text>
                <Text size="xs" className="text-muted-foreground">
                  @{member.username}
                </Text>
              </Stack>
            </label>
          ))}
        </Stack>
      </Card>
      {selected.size === 0 && (
        <Text size="xs" className="text-destructive">
          Select at least one contributor.
        </Text>
      )}
    </Stack>
  );
};
