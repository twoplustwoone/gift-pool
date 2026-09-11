// The group's gift memory across years. One exchange is an event; four of them
// are the thing you cannot get from any other Secret Santa product.
import { LuShuffle } from 'react-icons/lu';
import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { PageHeader } from '#app/components/page-header.tsx';
import { PageShell } from '#app/components/page-shell.tsx';
import { Section } from '#app/components/ui/section.tsx';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { getGroupExchangeArchive } from '#app/utils/exchanges.server.ts';
import { OCCASION_TYPE_LABELS } from '#app/utils/pool-constants.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const giftGroupId = params.giftGroupId!;

  // Membership, not just existence: an archive is a list of exchanges this
  // person was in, and a non-member has none by definition.
  const membership = await prisma.usersInGiftGroups.findUnique({
    where: { userId_giftGroupId: { userId, giftGroupId } },
    select: { giftGroup: { select: { id: true, name: true } } },
  });
  if (!membership) throw new Response('Not Found', { status: 404 });

  const archive = await getGroupExchangeArchive({
    giftGroupId,
    viewerId: userId,
  });
  return { group: membership.giftGroup, archive };
}

const GroupExchangesPage = () => {
  const { group, archive } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        variant="detail"
        back={{ label: group.name, href: `/groups/${group.id}` }}
        icon={<LuShuffle size={22} className="shrink-0 text-primary" />}
        title={`${group.name} · exchanges`}
        subtitle={archive.summary ?? 'No exchanges to look back on yet.'}
        contentWidth="narrow"
      />
      <PageShell width="narrow" className="min-h-0 flex-1 space-y-6 py-6">
        {archive.years.length === 0 ? (
          <Card className="text-center">
            <p className="font-semibold">Nothing to look back on yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once this group has run an exchange and the pairings are out, this
              is where the years pile up.
            </p>
            <Button asChild className="mt-4">
              <Link to={`/exchanges/new?groupId=${group.id}`}>
                Start an exchange
              </Link>
            </Button>
          </Card>
        ) : (
          <>
            {/* Memory leads: it is the compounding part. */}
            {archive.memory.length > 0 ? (
              <Section title={`${archive.years.length} years in`}>
                <ul className="space-y-3" data-testid="archive-memory">
                  {archive.memory.map((line) => (
                    <li key={line.key} className="flex items-center gap-3">
                      <Avatar
                        size="s"
                        className="!h-9 !w-9"
                        image={line.person.image}
                        user={line.person}
                      />
                      <p className="text-sm">{line.line}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="By year">
              <ul className="space-y-2" data-testid="archive-years">
                {archive.years.map((year) => (
                  <li key={year.exchangeId}>
                    <Link
                      to={`/exchanges/${year.exchangeId}`}
                      className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{year.year}</span>
                        <span className="text-xs text-muted-foreground">
                          {year.secretForever ? 'Kept secret' : 'Revealed'}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {OCCASION_TYPE_LABELS[year.occasionType]} ·{' '}
                        {year.participantCount} people
                        {year.secretForever
                          ? ' · pairings never shown'
                          : year.yourGifter
                            ? ` · ${year.yourGifter.name ?? year.yourGifter.username} had you`
                            : ''}
                      </span>
                      {!year.secretForever && year.yourGiftee ? (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          You drew{' '}
                          {year.yourGiftee.name ?? year.yourGiftee.username}
                          {year.youGuessedRight === true
                            ? ' · you guessed right'
                            : ''}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>

            <p className="text-xs text-muted-foreground">
              Built only from exchanges you were in. A year kept secret
              contributes its guesses but never its pairings.
            </p>
            <Button asChild variant="outline">
              <Link to={`/exchanges/new?groupId=${group.id}`}>
                Start this year&apos;s exchange
              </Link>
            </Button>
          </>
        )}
      </PageShell>
    </div>
  );
};

export default GroupExchangesPage;
