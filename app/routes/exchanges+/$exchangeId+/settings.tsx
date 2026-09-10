import { LuChevronLeft } from 'react-icons/lu';
import {
  Link,
  useFetcher,
  useNavigation,
  useRouteLoaderData,
} from 'react-router';
import {
  ExchangeSettingsFields,
  type ExchangeSettingsErrors,
} from '#app/components/exchanges/exchange-settings-fields.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { ConfirmDialog } from '#app/components/ui/confirm-dialog.tsx';
import { Section } from '#app/components/ui/section.tsx';
import { toDateInput, toDateInputInZone } from '#app/utils/exchange-dates.ts';
import { EXCHANGE_INTENT } from '#app/utils/exchange-intents.ts';
import { type loader as routeLoader } from './__route.server';

export { action } from './__route.server';

type LoaderData = Awaited<ReturnType<typeof routeLoader>>;

const ExchangeSettings = () => {
  const data = useRouteLoaderData<LoaderData>(
    'routes/exchanges+/$exchangeId+/_layout',
  );
  const saveFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const cancelFetcher = useFetcher();
  const navigation = useNavigation();
  if (!data) return null;
  const { view, timeZone } = data;
  const { exchange, viewer } = view;

  if (viewer.role !== 'ORGANIZER') {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          Only {exchange.organizer.name ?? exchange.organizer.username} can
          change these settings.
        </p>
      </Card>
    );
  }

  const locked = exchange.status !== 'GATHERING';
  const canCancel =
    exchange.status === 'GATHERING' || exchange.status === 'DRAWN';
  const errors: ExchangeSettingsErrors = saveFetcher.data?.error
    ? { form: saveFetcher.data.error }
    : {};
  const members = view.roster.map((r) => r.user);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to={`/exchanges/${exchange.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <LuChevronLeft aria-hidden className="h-4 w-4" />
        Back to the exchange
      </Link>
      <Section
        title="Exchange settings"
        description={
          locked
            ? 'Names are drawn, so only the auto-reveal date can change.'
            : 'Editable until you draw names.'
        }
      >
        <saveFetcher.Form method="post" className="space-y-6">
          <input
            type="hidden"
            name="intent"
            value={EXCHANGE_INTENT.UpdateSettings}
          />
          <input type="hidden" name="exchangeId" value={exchange.id} />
          <ExchangeSettingsFields
            mode="edit"
            isGroup={exchange.giftGroup !== null}
            groupName={exchange.giftGroup?.name}
            members={members}
            locked={locked}
            errors={errors}
            defaults={{
              title: exchange.title,
              occasionType: exchange.occasionType,
              eventDate: toDateInput(new Date(exchange.eventDate)),
              spendingGuideline: exchange.spendingGuideline ?? undefined,
              revealMode: exchange.revealMode,
              autoReveal: exchange.autoRevealAt !== null,
              // An instant, not a calendar day: read it back in the
              // organizer's zone or saving would walk it a day earlier.
              autoRevealDate: exchange.autoRevealAt
                ? toDateInputInZone(new Date(exchange.autoRevealAt), timeZone)
                : undefined,
              avoidRepeats: exchange.avoidRepeatsLookback !== null,
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={
                saveFetcher.state !== 'idle' || navigation.state !== 'idle'
              }
            >
              {saveFetcher.state !== 'idle' ? 'Saving…' : 'Save settings'}
            </Button>
            {saveFetcher.data?.ok ? (
              <span role="status" className="text-sm text-muted-foreground">
                Saved.
              </span>
            ) : null}
          </div>
        </saveFetcher.Form>
      </Section>

      {canCancel ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <p className="font-semibold">Cancel this exchange</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {exchange.status === 'DRAWN'
              ? 'Names are drawn. Cancelling tells everyone who is in and ends the exchange — it is the only way to start over.'
              : 'Nobody has drawn a name yet. Everyone who joined is told.'}
          </p>
          <ConfirmDialog
            title="Cancel this exchange?"
            description="Everyone who is in is told."
            consequences={[
              exchange.status === 'DRAWN'
                ? 'Every pairing is discarded. Anything already bought is yours to keep or re-gift.'
                : 'The roster is discarded.',
              "This can't be undone. To run it again, start a new exchange.",
            ]}
            confirmText="Cancel exchange"
            confirmVariant="destructive"
            onConfirm={() => {
              const body = new FormData();
              body.set('intent', EXCHANGE_INTENT.Cancel);
              body.set('exchangeId', exchange.id);
              void cancelFetcher.submit(body, { method: 'post' });
            }}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/5"
            >
              Cancel exchange
            </Button>
          </ConfirmDialog>
        </Card>
      ) : null}
    </div>
  );
};

export default ExchangeSettings;
