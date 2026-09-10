import { LuChevronRight, LuShuffle, LuUsers } from 'react-icons/lu';
import {
  type ActionFunctionArgs,
  Form,
  Link,
  type LoaderFunctionArgs,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
} from 'react-router';
import { z } from 'zod';
import { ExchangeSettingsFields } from '#app/components/exchanges/exchange-settings-fields.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { PageShell } from '#app/components/page-shell.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { SecrecyNote } from '#app/components/ui/secrecy-note.tsx';
import { Stack, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { getHints } from '#app/utils/client-hints.tsx';
import { prisma } from '#app/utils/db.server.ts';
import { REVEAL_MODE } from '#app/utils/exchange-constants.ts';
import {
  autoRevealInstant,
  dateInputToUtcMidnight,
  defaultAutoRevealInstant,
} from '#app/utils/exchange-dates.ts';
import { createExchange } from '#app/utils/exchanges.server.ts';
import { OCCASION_TYPE } from '#app/utils/pool-constants.ts';
import { redirectWithToast } from '#app/utils/toast.server.ts';

// Two doors (board §8): from a group overview the group is pre-filled and its
// members are asked to join; from here the first question is group or
// standalone. A standalone exchange has no roster to opt in, so it gathers
// people through an invite link instead — and has no "someone new" lookback,
// because it has no prior draws to look back at.
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const groupId = url.searchParams.get('groupId');

  const memberships = await prisma.usersInGiftGroups.findMany({
    where: { userId },
    select: {
      giftGroup: {
        select: {
          id: true,
          name: true,
          _count: { select: { groupMembers: true } },
        },
      },
    },
    orderBy: { giftGroup: { name: 'asc' } },
  });
  const groups = memberships.map((m) => ({
    id: m.giftGroup.id,
    name: m.giftGroup.name,
    memberCount: m.giftGroup._count.groupMembers,
  }));

  const standalone = url.searchParams.get('standalone') === '1';
  const selected = groupId ? groups.find((g) => g.id === groupId) : undefined;
  if (!selected) {
    return { groups, group: null, standalone };
  }
  const members = await prisma.usersInGiftGroups.findMany({
    where: { giftGroupId: selected.id },
    select: {
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          image: { select: { id: true, altText: true } },
        },
      },
    },
  });
  return {
    groups,
    standalone: false,
    group: {
      ...selected,
      members: members.map((m) => m.user),
    },
  };
}

const OnOff = z
  .enum(['on', 'off'])
  .optional()
  .transform((v) => v === 'on');

export const CreateExchangeSchema = z.object({
  // Empty for a standalone exchange: there is no group to belong to.
  giftGroupId: z.string().optional(),
  title: z.string().trim().min(1, 'Give the exchange a name.').max(100),
  occasionType: z
    .string()
    .transform((v) => (v in OCCASION_TYPE ? v : OCCASION_TYPE.OTHER)),
  eventDate: z.string().min(1, 'Pick an exchange date.'),
  spendingGuideline: z.string().trim().max(80).optional(),
  revealMode: z
    .enum([REVEAL_MODE.ORGANIZER, REVEAL_MODE.SECRET_FOREVER])
    .default(REVEAL_MODE.ORGANIZER),
  autoReveal: OnOff,
  autoRevealDate: z.string().optional(),
  avoidRepeats: OnOff,
  exclusions: z
    .string()
    .optional()
    .transform((raw): Array<[string, string]> => {
      if (!raw) return [];
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter(
            (pair): pair is [string, string] =>
              Array.isArray(pair) &&
              pair.length === 2 &&
              typeof pair[0] === 'string' &&
              typeof pair[1] === 'string',
          )
          .slice(0, 50);
      } catch {
        return [];
      }
    }),
});

type FieldErrors = Partial<
  Record<'title' | 'eventDate' | 'autoRevealDate' | 'form', string>
>;

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { timeZone } = getHints(request);
  const formData = await request.formData();
  const parsed = CreateExchangeSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'title' || key === 'eventDate') errors[key] = issue.message;
      else errors.form = errors.form ?? issue.message;
    }
    return data({ errors }, { status: 400 });
  }
  const v = parsed.data;

  const eventDate = dateInputToUtcMidnight(v.eventDate);
  if (!eventDate) {
    return data(
      { errors: { eventDate: 'Pick a real date.' } satisfies FieldErrors },
      { status: 400 },
    );
  }

  let autoRevealAt: Date | null = null;
  if (v.revealMode === REVEAL_MODE.ORGANIZER && v.autoReveal) {
    if (v.autoRevealDate) {
      autoRevealAt = autoRevealInstant(v.autoRevealDate, timeZone);
      if (!autoRevealAt) {
        return data(
          {
            errors: {
              autoRevealDate: 'Pick a real date.',
            } satisfies FieldErrors,
          },
          { status: 400 },
        );
      }
      // Both are calendar days the organizer picked; comparing the stored
      // instants would reject the exchange date itself east of UTC+9, where
      // 09:00 local is the previous day in UTC.
      if (v.autoRevealDate < v.eventDate) {
        return data(
          {
            errors: {
              autoRevealDate: `Any date from ${v.eventDate} onwards works.`,
            } satisfies FieldErrors,
          },
          { status: 400 },
        );
      }
    } else {
      autoRevealAt = defaultAutoRevealInstant(eventDate, timeZone);
    }
  }

  try {
    const exchange = await createExchange({
      organizerId: userId,
      title: v.title,
      occasionType: v.occasionType as keyof typeof OCCASION_TYPE,
      eventDate,
      spendingGuideline: v.spendingGuideline || null,
      giftGroupId: v.giftGroupId || null,
      revealMode: v.revealMode,
      autoRevealAt,
      avoidRepeatsLookback: v.avoidRepeats ? 2 : null,
      exclusions: v.exclusions,
    });
    return redirectWithToast(`/exchanges/${exchange.id}`, {
      type: 'success',
      title: 'Exchange saved',
      description: "You'll draw names once everyone's in.",
    });
  } catch (error) {
    // The module throws `data({ error }, { status })` for validation and
    // membership problems; surface those inline instead of as a crash.
    if (
      error &&
      typeof error === 'object' &&
      'data' in error &&
      'init' in error
    ) {
      const thrown = error as { data: { error?: string }; init?: ResponseInit };
      return data(
        { errors: { form: thrown.data.error ?? 'Something went wrong.' } },
        { status: thrown.init?.status ?? 400 },
      );
    }
    throw error;
  }
}

const NewExchange = () => {
  const { groups, group, standalone } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';
  const errors = (actionData?.errors ?? {}) as FieldErrors;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        variant="detail"
        back={{ label: 'Exchanges', href: '/exchanges' }}
        icon={<LuShuffle size={22} className="shrink-0 text-primary" />}
        title="New exchange"
        subtitle="Everyone draws one person and gives to them in secret. A Secret Santa for any occasion."
        contentWidth="narrow"
      />
      <PageShell width="narrow" className="min-h-0 flex-1 py-6">
        {!group && !standalone ? (
          <Stack gap={4}>
            <Text size="sm" color="muted">
              Which group is this for? The people in it will be asked to join.
            </Text>
            {groups.length === 0 ? (
              <Card className="text-center">
                <Text weight="semibold">You're not in a group yet</Text>
                <Text size="sm" color="muted" className="mt-1 block">
                  An exchange runs on a group's roster. Start or join one first.
                </Text>
                <Button asChild className="mt-4">
                  <Link to="/groups">See your groups</Link>
                </Button>
              </Card>
            ) : (
              <ul className="space-y-2">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link
                      to={`/exchanges/new?groupId=${g.id}`}
                      className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <LuUsers
                        aria-hidden
                        className="h-5 w-5 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{g.name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {g.memberCount}{' '}
                          {g.memberCount === 1 ? 'member' : 'members'}
                        </span>
                      </span>
                      <LuChevronRight
                        aria-hidden
                        className="h-4 w-4 text-muted-foreground"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {/* The second door: no group, gathered by link instead. */}
            <Card>
              <Text weight="semibold">Or start one on its own</Text>
              <Text size="sm" color="muted" className="mt-1 block">
                No group needed — you&apos;ll get a link to send to whoever you
                like. They can join until you draw.
              </Text>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/exchanges/new?standalone=1">
                  Start a standalone exchange
                </Link>
              </Button>
            </Card>
          </Stack>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Form method="post" className="space-y-6">
              <input type="hidden" name="giftGroupId" value={group?.id ?? ''} />
              <Text size="sm" color="muted">
                {group ? (
                  <>
                    In group{' '}
                    <Link
                      to={`/groups/${group.id}`}
                      className="font-medium text-foreground"
                    >
                      {group.name}
                    </Link>
                  </>
                ) : (
                  <>On its own — you&apos;ll invite people by link</>
                )}
                {' · '}
                <Link to="/exchanges/new" className="underline">
                  change
                </Link>
              </Text>
              <ExchangeSettingsFields
                mode="create"
                isGroup={group !== null}
                groupName={group?.name ?? ''}
                members={group?.members ?? []}
                errors={errors}
                defaults={{
                  title: group
                    ? `${group.name} ${new Date().getFullYear()}`
                    : `Gift exchange ${new Date().getFullYear()}`,
                }}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {submitting
                    ? 'Saving…'
                    : group
                      ? 'Save and gather people'
                      : 'Save and get a link'}
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/exchanges">Cancel</Link>
                </Button>
              </div>
              <Text size="xs" color="muted">
                {group
                  ? "You'll draw names once everyone's in."
                  : "You'll get a link to send. Draw names once everyone's in."}
              </Text>
            </Form>
            <aside className="space-y-4">
              <SecrecyNote title="You won't see the pairings">
                You draw a name like everyone else. Running the exchange doesn't
                show you who has who — not before the reveal, and not in any
                count on this page.
              </SecrecyNote>
              <Card>
                <Text weight="semibold" size="sm">
                  What happens next
                </Text>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>
                    {group
                      ? `${group.name} members opt in.`
                      : 'You send the link. Whoever follows it is in.'}
                  </li>
                  <li>You draw names. That's the point of no return.</li>
                  <li>Everyone gives their gift.</li>
                  <li>You reveal — or Gift Pool does it for you.</li>
                </ol>
              </Card>
            </aside>
          </div>
        )}
      </PageShell>
    </div>
  );
};

export default NewExchange;
