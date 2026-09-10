import { useState } from 'react';
import { Link, useFetcher, useRouteLoaderData } from 'react-router';
import { DrawControls } from '#app/components/exchanges/draw-controls.tsx';
import {
  countWord,
  firstName,
  formatExchangeDate,
  repeatsSentence,
} from '#app/components/exchanges/exchange-copy.ts';
import {
  ExchangeRoster,
  ExchangeRosterAvatars,
  ExchangeRosterStrip,
} from '#app/components/exchanges/exchange-roster.tsx';
import { GiftProgressStepper } from '#app/components/exchanges/gift-progress-stepper.tsx';
import { OrganizerProgressPanel } from '#app/components/exchanges/organizer-progress-panel.tsx';
import { ReceivedCard } from '#app/components/exchanges/received-card.tsx';
import { RevealControls } from '#app/components/exchanges/reveal-controls.tsx';
import { RevealedLoop } from '#app/components/exchanges/revealed-loop.tsx';
import { YouDrewCard } from '#app/components/exchanges/you-drew-card.tsx';
import { YourGifterCard } from '#app/components/exchanges/your-gifter-card.tsx';
import { YourPersonCard } from '#app/components/exchanges/your-person-card.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '#app/components/ui/responsive-dialog.tsx';
import { SecrecyNote } from '#app/components/ui/secrecy-note.tsx';
import { Section } from '#app/components/ui/section.tsx';
import { useVisibilityRevalidation } from '#app/hooks/use-visibility-revalidation.ts';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import { type ExchangeView } from '#app/utils/exchanges.server.ts';
import { type loader as routeLoader } from './__route.server';

// Fetchers on this page post to the current route, which is this index — so
// the shared action must be exported here, not only on the layout.
export { action } from './__route.server';

type LoaderData = Awaited<ReturnType<typeof routeLoader>>;

const ExchangePage = () => {
  const data = useRouteLoaderData<LoaderData>(
    'routes/exchanges+/$exchangeId+/_layout',
  );
  const status = data?.view.exchange.status;
  // Everyone's page moves at the same moment: poll while there is anything
  // left to happen.
  useVisibilityRevalidation({
    enabled: status === 'GATHERING' || status === 'DRAWN',
  });
  if (!data) return null;
  const { view, viewerWishlistItemCount } = data;
  const now = new Date(data.now);

  switch (view.exchange.status) {
    case 'GATHERING':
      return (
        <Gathering
          view={view}
          viewerWishlistItemCount={viewerWishlistItemCount}
        />
      );
    case 'DRAWN':
      return <Drawn view={view} now={now} />;
    case 'REVEALED':
      return <Revealed view={view} />;
    case 'FINISHED':
      return <Finished view={view} />;
    default:
      return <Cancelled view={view} />;
  }
};

export default ExchangePage;

// ─── Gathering ────────────────────────────────────────────────────────────────

function Gathering({
  view,
  viewerWishlistItemCount,
}: {
  view: ExchangeView;
  viewerWishlistItemCount: number | null;
}) {
  const { exchange, viewer, roster, counts } = view;
  const organizerFirst = firstName(exchange.organizer);
  const participationFetcher = useFetcher();
  const removeExclusionFetcher = useFetcher();

  const submit = (
    fetcher: ReturnType<typeof useFetcher>,
    fields: Record<string, string>,
  ) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    void fetcher.submit(body, { method: 'post' });
  };

  if (viewer.role === 'ORGANIZER') {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Section
            title="Who's in"
            description={
              exchange.giftGroup
                ? `${exchange.giftGroup.name} · ${counts.in} in${counts.pending > 0 ? `, ${counts.pending} still deciding` : ''}`
                : `${counts.in} in`
            }
          >
            <ExchangeRoster roster={roster} viewerId={viewer.id} />
          </Section>
          {view.draw ? (
            <DrawControls
              exchangeId={exchange.id}
              preview={view.draw}
              onRemoveExclusion={(exclusionId) =>
                submit(removeExclusionFetcher, {
                  intent: EXCHANGE_INTENT.RemoveExclusion,
                  exchangeId: exchange.id,
                  exclusionId,
                })
              }
            />
          ) : null}
        </div>
        <div className="space-y-4">
          <Section title="The draw">
            <p className="text-sm">
              {view.draw?.kind === 'ok'
                ? `With ${countWord(view.draw.participantCount)} people${view.exclusionCount > 0 ? ` and ${view.exclusionCount === 1 ? 'one exclusion' : `${countWord(view.exclusionCount)} exclusions`}` : ''}, ${(repeatsSentence(view.draw.repeats, view.draw.participantCount) ?? 'the loop closes.').replace(/^./, (c) => c.toLowerCase())}`
                : view.draw?.kind === 'TOO_FEW'
                  ? `An exchange needs three people. ${view.draw.need - view.draw.have === 1 ? 'One more to go.' : `${countWord(view.draw.need - view.draw.have)} more to go.`}`
                  : 'The exclusions need a change before names can be drawn.'}
            </p>
            {counts.pending > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {counts.pending === 1
                  ? 'One person'
                  : `${countWord(counts.pending)} people`}{' '}
                can still join until you draw.
              </p>
            ) : null}
          </Section>
          <SecrecyNote title="Secrecy boundary">
            There are no pairings yet, so this page is fully public to the
            group. Everything secret starts one tap away.
          </SecrecyNote>
          <Section
            title="Settings"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link to="settings">Edit</Link>
              </Button>
            }
          >
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Spending guideline</dt>
              <dd>{exchange.spendingGuideline ?? '—'}</dd>
              {exchange.giftGroup ? (
                <>
                  <dt className="text-muted-foreground">Someone new</dt>
                  <dd>{exchange.avoidRepeatsLookback ? 'On' : 'Off'}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Exclusions</dt>
              <dd>
                {view.exclusionCount === 0
                  ? 'None'
                  : `${view.exclusionCount} ${view.exclusionCount === 1 ? 'pair' : 'pairs'}`}
              </dd>
              <dt className="text-muted-foreground">Reveal</dt>
              <dd>
                {exchange.revealMode === 'SECRET_FOREVER'
                  ? 'Kept secret forever'
                  : exchange.autoRevealAt
                    ? `You · auto ${formatExchangeDate(exchange.autoRevealAt)}`
                    : 'You'}
              </dd>
            </dl>
          </Section>
        </div>
      </div>
    );
  }

  if (viewer.participation === 'IN') {
    return (
      <div className="space-y-4">
        <Card className="border-pool/40 bg-pool/5">
          <p className="text-lg font-bold">You're in</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {organizerFirst} will draw names once everyone's answered. You'll
            get a notification the moment you have someone.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            disabled={participationFetcher.state !== 'idle'}
            onClick={() =>
              submit(participationFetcher, {
                intent: EXCHANGE_INTENT.OptOut,
                exchangeId: exchange.id,
              })
            }
          >
            Sit this one out
          </Button>
        </Card>
        <Section title="While you wait">
          <p className="text-sm text-muted-foreground">
            {viewerWishlistItemCount === 0
              ? 'Your wishlist is empty. Whoever draws you will look at it — worth a few minutes.'
              : `Your wishlist has ${viewerWishlistItemCount} ${viewerWishlistItemCount === 1 ? 'item' : 'items'}. Whoever draws you can see it — worth a look.`}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/wishlist">Update your wishlist</Link>
          </Button>
        </Section>
        <Section title={`Who's in · ${counts.in}`}>
          <ExchangeRosterStrip roster={roster} viewerId={viewer.id} />
        </Section>
        <p className="text-xs text-muted-foreground">
          {[
            exchange.spendingGuideline,
            `${organizerFirst} reveals the pairings after ${formatExchangeDate(exchange.eventDate)}.`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    );
  }

  if (viewer.participation === 'OUT') {
    return (
      <div className="space-y-4">
        <Card>
          <p className="text-lg font-bold">You're sitting this one out</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nobody will draw you and you won't draw anyone. You can change your
            mind until {organizerFirst} draws names.
          </p>
          <Button
            type="button"
            className="mt-3"
            disabled={participationFetcher.state !== 'idle'}
            onClick={() =>
              submit(participationFetcher, {
                intent: EXCHANGE_INTENT.OptIn,
                exchangeId: exchange.id,
              })
            }
          >
            Join back in
          </Button>
        </Card>
        <Section title={`Who's in · ${counts.in}`}>
          <ExchangeRosterStrip roster={roster} viewerId={viewer.id} />
        </Section>
      </div>
    );
  }

  // Group member who hasn't answered.
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <Card className="border-pool/40 bg-pool/5">
          <p className="text-lg font-bold">Join the exchange</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone draws one person and gives to them. Join before{' '}
            {organizerFirst} draws names on{' '}
            {formatExchangeDate(exchange.eventDate)}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={participationFetcher.state !== 'idle'}
              onClick={() =>
                submit(participationFetcher, {
                  intent: EXCHANGE_INTENT.OptIn,
                  exchangeId: exchange.id,
                })
              }
            >
              Join the exchange
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={participationFetcher.state !== 'idle'}
              onClick={() =>
                submit(participationFetcher, {
                  intent: EXCHANGE_INTENT.OptOut,
                  exchangeId: exchange.id,
                })
              }
            >
              Not this time
            </Button>
          </div>
        </Card>
        <Section
          title={`${counts.in} ${counts.in === 1 ? 'person is' : 'people are'} in`}
        >
          <ExchangeRoster
            roster={roster.filter((r) => r.status === 'IN')}
            viewerId={viewer.id}
            renderTrailing={() => <span />}
          />
        </Section>
      </div>
      <div className="space-y-4">
        <Card>
          <p className="font-semibold">You're not in this one</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can join until the draw. After that the page stays visible, but
            you'll only see the record once pairings are revealed.
          </p>
        </Card>
        <SecrecyNote title="Never shown here">
          Gift progress, notes, and any count that could be inverted into a
          pairing.
        </SecrecyNote>
      </div>
    </div>
  );
}

// ─── Drawn ────────────────────────────────────────────────────────────────────

function Drawn({ view, now }: { view: ExchangeView; now: Date }) {
  const { exchange, viewer, you, progress, roster } = view;
  const afterEvent = now >= new Date(exchange.eventDate);
  const [coverOpen, setCoverOpen] = useState(you?.covered ?? false);

  if (!you) {
    // Non-participating member: state and roster, nothing else.
    return (
      <div className="space-y-4">
        <Card>
          <p className="text-lg font-bold">Names are drawn</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You're not in this one, so there's nothing here for you until{' '}
            {firstName(exchange.organizer)} reveals the pairings after{' '}
            {formatExchangeDate(exchange.eventDate)}.
          </p>
        </Card>
        <Section title={`${roster.length} people are in`}>
          <ExchangeRosterAvatars roster={roster} />
          <ExchangeRosterStrip
            roster={roster}
            viewerId={viewer.id}
            className="mt-3"
          />
        </Section>
        <p className="text-sm text-muted-foreground">
          Next time, join before the draw and you'll be in it.
        </p>
      </div>
    );
  }

  const assignment = you.assignment;
  const gifteeFirst = assignment ? firstName(assignment.giftee) : 'them';
  // Until the cover card is opened the page must not name the giftee anywhere
  // — otherwise "Later" would hand the user the very screen the cover exists
  // to protect. The name (and everything derived from it) appears only once
  // they have chosen their moment.
  const stillCovered = you.covered;

  const yourGift =
    assignment && !stillCovered ? (
      <GiftProgressStepper
        exchangeId={exchange.id}
        stage={assignment.giftStage}
        gifteeFirstName={gifteeFirst}
        lead={afterEvent}
      />
    ) : null;

  const yourPerson =
    assignment && !stillCovered ? (
      <YourPersonCard
        assignment={assignment}
        spendingGuideline={exchange.spendingGuideline}
        eventDate={exchange.eventDate}
      />
    ) : null;

  return (
    <>
      {/* Kept mounted while the user has it open: marking it viewed
          revalidates the loader, and unmounting on that would yank the card
          away mid-interaction. */}
      {assignment && (stillCovered || coverOpen) ? (
        <YouDrewCard
          exchangeId={exchange.id}
          exchangeTitle={exchange.title}
          assignment={assignment}
          organizer={exchange.organizer}
          spendingGuideline={exchange.spendingGuideline}
          eventDate={exchange.eventDate}
          exchangeHref={`/exchanges/${exchange.id}`}
          viewerIsOrganizer={viewer.role === 'ORGANIZER'}
          open={coverOpen}
          onOpenChange={setCoverOpen}
        />
      ) : null}
      {assignment && stillCovered && !coverOpen ? (
        <Card className="mb-4 flex items-center justify-between gap-3 border-pool/40 bg-pool/5">
          <p className="text-sm font-medium">
            Your person is waiting behind a card.
          </p>
          <Button type="button" size="sm" onClick={() => setCoverOpen(true)}>
            See who you drew
          </Button>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {afterEvent ? (
            <>
              {yourGift}
              <ReceivedCard exchangeId={exchange.id} received={you.received} />
              {yourPerson}
            </>
          ) : (
            <>
              {yourPerson}
              {yourGift}
            </>
          )}
        </div>
        <div className="space-y-4">
          {viewer.role === 'ORGANIZER' && progress ? (
            <OrganizerProgressPanel
              progress={progress}
              afterEvent={afterEvent}
              actions={
                afterEvent ? (
                  <RevealControls
                    exchangeId={exchange.id}
                    progress={progress}
                    autoRevealAt={exchange.autoRevealAt}
                    eventDate={exchange.eventDate}
                    now={now}
                    canToggleAutoReveal={exchange.revealMode === 'ORGANIZER'}
                  />
                ) : null
              }
            />
          ) : null}
          <Section title="From your secret gifter">
            <p className="text-sm text-muted-foreground">
              Nothing yet. Notes and clues arrive with the next update — for now
              your gifter is quietly getting on with it.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}

// ─── Revealed ─────────────────────────────────────────────────────────────────

function Revealed({ view }: { view: ExchangeView }) {
  const { exchange, viewer, loop, yourGifter } = view;
  const [labelOpen, setLabelOpen] = useState(false);
  const fetcher = useFetcher();
  const own = loop?.find((p) => p.gifter.id === viewer.id) ?? null;
  const canAddGiftLabel = own !== null;

  return (
    <div className="space-y-4">
      {yourGifter ? (
        <YourGifterCard gifter={yourGifter} guessedRight={null} />
      ) : null}
      {loop ? (
        <RevealedLoop
          loop={loop}
          viewerId={viewer.id}
          canAddGiftLabel={canAddGiftLabel}
          onAddGiftLabel={() => setLabelOpen(true)}
        />
      ) : null}
      <ResponsiveDialog open={labelOpen} onOpenChange={setLabelOpen}>
        <ResponsiveDialogContent>
          <fetcher.Form
            method="post"
            onSubmit={() => setLabelOpen(false)}
            className="space-y-4"
          >
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>What did you give?</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                A short line for the record — it's what makes next year's page
                worth opening.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <input
              type="hidden"
              name="intent"
              value={EXCHANGE_INTENT.SetGiftLabel}
            />
            <input type="hidden" name="exchangeId" value={exchange.id} />
            <div className="space-y-1.5">
              <Label htmlFor="gift-label">You gave</Label>
              <Input
                id="gift-label"
                name="label"
                maxLength={120}
                defaultValue={own?.giftLabel ?? ''}
                placeholder="a record player stand"
                autoFocus
              />
            </div>
            <ResponsiveDialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLabelOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </ResponsiveDialogFooter>
          </fetcher.Form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

// ─── Finished (secret forever) ────────────────────────────────────────────────

function Finished({ view }: { view: ExchangeView }) {
  const { exchange, roster, viewer } = view;
  return (
    <div className="space-y-4">
      <Card className="border-pool/40 bg-pool/5">
        <p className="text-lg font-bold">Nobody will ever know</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This exchange was set to stay secret. The pairings are never shown —
          not now, not next year, not to {firstName(exchange.organizer)}.
        </p>
      </Card>
      <Section title={`${roster.length} people were in`}>
        <ExchangeRosterStrip roster={roster} viewerId={viewer.id} />
      </Section>
      <SecrecyNote>
        Who had who is not shown — that's what "keep it secret forever" means.
      </SecrecyNote>
    </div>
  );
}

// ─── Cancelled ────────────────────────────────────────────────────────────────

function Cancelled({ view }: { view: ExchangeView }) {
  const { exchange } = view;
  return (
    <Card>
      <p className="text-lg font-bold">This exchange was cancelled</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {firstName(exchange.organizer)} cancelled it
        {exchange.cancelledAt
          ? ` on ${formatExchangeDate(exchange.cancelledAt)}`
          : ''}
        . Nothing more is expected of anyone.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to="/exchanges">Back to exchanges</Link>
      </Button>
    </Card>
  );
}
