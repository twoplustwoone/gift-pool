import { useEffect, useRef, useState } from 'react';
import { LuBell, LuCheck, LuLoader } from 'react-icons/lu';
import { useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '#app/components/ui/responsive-dialog.tsx';
import { createClientMutationId } from '#app/utils/client-mutation-id.ts';
import { formatRelativeTime, useTranslation } from '#app/utils/i18n.tsx';
import { cn } from '#app/utils/misc.tsx';

export type OrganizerReminderKind =
  | 'CONTRIBUTION'
  | 'VOTE'
  | 'PURCHASE'
  | 'DELIVERY';

type LatestReminder = {
  createdAt: Date | string;
  targetCount: number;
  status: string;
};

type OrganizerReminderBase = {
  kind: OrganizerReminderKind;
  latestNudge: LatestReminder | null;
};

type OrganizerReminderUnavailable = OrganizerReminderBase &
  (
    | { status: 'NO_ELIGIBLE' }
    | { status: 'COOLDOWN'; availableAt: Date | string }
    | { status: 'WEEKLY_LIMIT'; availableAt: Date | string }
  );

export type OrganizerReminderAvailability = OrganizerReminderBase &
  (
    | { status: 'AVAILABLE' }
    | { status: 'NO_ELIGIBLE' }
    | { status: 'COOLDOWN'; availableAt: Date | string }
    | { status: 'WEEKLY_LIMIT'; availableAt: Date | string }
  );

type OrganizerReminderPreviewResponse =
  | OrganizerReminderUnavailable
  | (OrganizerReminderBase & {
      status: 'AVAILABLE';
      eligibleCount: number;
    })
  | OrganizerReminderErrorResponse;

type OrganizerReminderQueuedResponse = OrganizerReminderBase & {
  status: 'QUEUED';
  nudgeId: string;
  queuedCount: number;
  createdAt: Date | string;
  availableAt: Date | string;
};

type OrganizerReminderSendResponse =
  | OrganizerReminderUnavailable
  | OrganizerReminderQueuedResponse
  | OrganizerReminderErrorResponse;

type OrganizerReminderErrorResponse = { error: string; code?: string };

type ReminderConfig = {
  actionLabel: string;
  title: string;
  qualification: string;
  preview: (sender: string, pool: string) => string;
};

const REMINDER_CONFIG: Record<OrganizerReminderKind, ReminderConfig> = {
  CONTRIBUTION: {
    actionLabel: 'Remind contributors',
    title: 'Remind contributors',
    qualification:
      'People in this pool who have not set a contribution preference yet.',
    preview: (sender, pool) =>
      `${sender} reminded you to set your contribution in ${pool}`,
  },
  VOTE: {
    actionLabel: 'Remind voters',
    title: 'Remind voters',
    qualification: 'People in this pool who have not voted yet.',
    preview: (sender, pool) => `${sender} reminded you to vote in ${pool}`,
  },
  PURCHASE: {
    actionLabel: 'Remind buyer',
    title: 'Remind the buyer',
    qualification: 'The assigned buyer while the purchase is still incomplete.',
    preview: (sender, pool) =>
      `${sender} reminded you to buy the gift for ${pool}`,
  },
  DELIVERY: {
    actionLabel: 'Remind deliverer',
    title: 'Remind the deliverer',
    qualification: 'The assigned deliverer while delivery is still incomplete.',
    preview: (sender, pool) =>
      `${sender} reminded you to deliver the gift for ${pool}`,
  },
};

const SEND_TIMEOUT_MS = 15_000;

export function OrganizerReminderAction({
  availability,
  className,
  kind,
  poolId,
  poolTitle,
  senderDisplayName,
}: Readonly<{
  availability: OrganizerReminderAvailability;
  className?: string;
  kind: OrganizerReminderKind;
  poolId: string;
  poolTitle: string;
  senderDisplayName: string;
}>) {
  const { locale } = useTranslation();
  const previewFetcher = useFetcher<OrganizerReminderPreviewResponse>({
    key: `organizer-reminder-preview-${poolId}-${kind}`,
  });
  const sendFetcher = useFetcher<OrganizerReminderSendResponse>({
    key: `organizer-reminder-send-${poolId}-${kind}`,
  });
  const idempotencyKeyRef = useRef('');
  const [open, setOpen] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [sendAttempt, setSendAttempt] = useState(0);
  const [sendStarted, setSendStarted] = useState(false);
  const [sendTimedOut, setSendTimedOut] = useState(false);
  const [queuedResult, setQueuedResult] = useState<
    OrganizerReminderQueuedResponse | undefined
  >();
  const config = REMINDER_CONFIG[kind];
  const sendPending = sendStarted && sendFetcher.state === 'submitting';

  useEffect(() => {
    if (sendAttempt === 0 || !sendPending) return;
    const timeout = window.setTimeout(
      () => setSendTimedOut(true),
      SEND_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [sendAttempt, sendPending]);

  useEffect(() => {
    if (!sendStarted || !isQueuedResponse(sendFetcher.data)) return;
    setQueuedResult(sendFetcher.data);
  }, [sendFetcher.data, sendStarted]);

  const effectiveAvailability: OrganizerReminderAvailability = queuedResult
    ? {
        status: 'COOLDOWN',
        kind,
        latestNudge: {
          createdAt: queuedResult.createdAt,
          targetCount: queuedResult.queuedCount,
          status: queuedResult.status,
        },
        availableAt: queuedResult.availableAt,
      }
    : availability;
  const disabled = effectiveAvailability.status !== 'AVAILABLE';
  const statusText = getTriggerStatus(effectiveAvailability, locale);
  const statusId = `organizer-reminder-${poolId}-${kind}-status`;
  const endpoint = `/api/pools/${encodeURIComponent(poolId)}/reminders`;

  const loadPreview = async () => {
    setPreviewError(false);
    try {
      await previewFetcher.load(`${endpoint}?kind=${encodeURIComponent(kind)}`);
    } catch {
      setPreviewError(true);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;

    idempotencyKeyRef.current = createClientMutationId();
    setPreviewError(false);
    setSendError(false);
    setSendAttempt(0);
    setSendStarted(false);
    setSendTimedOut(false);
    void loadPreview();
  };

  const sendReminder = async () => {
    setSendStarted(true);
    setSendAttempt((attempt) => attempt + 1);
    setSendError(false);
    setSendTimedOut(false);
    try {
      await sendFetcher.submit(
        { kind, idempotencyKey: idempotencyKeyRef.current },
        { action: endpoint, method: 'post' },
      );
    } catch {
      setSendError(true);
    }
  };

  return (
    <div className={cn('flex min-w-0 flex-col items-start gap-1.5', className)}>
      <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
        <ResponsiveDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 gap-1.5 sm:min-h-9"
            disabled={disabled}
            aria-describedby={statusText ? statusId : undefined}
            data-testid={`organizer-reminder-trigger-${kind.toLowerCase()}`}
          >
            <LuBell className="h-3.5 w-3.5" aria-hidden />
            {config.actionLabel}
          </Button>
        </ResponsiveDialogTrigger>
        <ResponsiveDialogContent className="sm:max-w-md">
          <OrganizerReminderDialogBody
            config={config}
            locale={locale}
            poolTitle={poolTitle}
            previewData={previewFetcher.data}
            previewError={previewError}
            previewPending={previewFetcher.state !== 'idle'}
            retryPreview={loadPreview}
            senderDisplayName={senderDisplayName}
            sendData={sendStarted ? sendFetcher.data : undefined}
            sendError={sendError}
            sendPending={sendPending}
            sendReminder={sendReminder}
            sendTimedOut={sendTimedOut}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      {statusText ? (
        <p
          id={statusId}
          className="max-w-xs text-xs leading-snug text-muted-foreground"
          data-testid={`organizer-reminder-status-${kind.toLowerCase()}`}
        >
          {statusText}
        </p>
      ) : null}
    </div>
  );
}

function OrganizerReminderDialogBody({
  config,
  locale,
  poolTitle,
  previewData,
  previewError,
  previewPending,
  retryPreview,
  senderDisplayName,
  sendData,
  sendError,
  sendPending,
  sendReminder,
  sendTimedOut,
}: Readonly<{
  config: ReminderConfig;
  locale: Parameters<typeof formatRelativeTime>[1];
  poolTitle: string;
  previewData: OrganizerReminderPreviewResponse | undefined;
  previewError: boolean;
  previewPending: boolean;
  retryPreview: () => void;
  senderDisplayName: string;
  sendData: OrganizerReminderSendResponse | undefined;
  sendError: boolean;
  sendPending: boolean;
  sendReminder: () => Promise<void>;
  sendTimedOut: boolean;
}>) {
  const liveProps = { 'aria-live': 'polite' as const, role: 'status' as const };

  if (sendTimedOut && sendPending) {
    return (
      <TerminalState
        title="We couldn't confirm the outcome"
        description="Close and refresh the pool before trying again. This request cannot queue the same reminder twice."
      />
    );
  }

  if (sendPending) {
    return (
      <>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Queueing reminder…</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            You can close this window; the request will continue safely.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div
          className="flex items-center gap-3 rounded-xl bg-muted/50 p-4"
          {...liveProps}
        >
          <LuLoader className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <p className="text-sm">
            Checking the task and queueing the reminder.
          </p>
        </div>
        <CloseFooter label="Close" />
      </>
    );
  }

  if (sendError) {
    return <RecoverableError onRetry={sendReminder} />;
  }

  if (sendData) {
    return (
      <OrganizerReminderSendOutcome
        locale={locale}
        sendData={sendData}
        sendReminder={sendReminder}
      />
    );
  }

  if (previewError) {
    return <RecoverableError onRetry={retryPreview} />;
  }

  if (previewPending || !previewData) {
    return (
      <>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{config.title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Checking who can be notified right now.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div
          className="flex items-center gap-3 rounded-xl bg-muted/50 p-4"
          {...liveProps}
        >
          <LuLoader className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <p className="text-sm">Resolving the eligible count…</p>
        </div>
        <CloseFooter label="Cancel" />
      </>
    );
  }

  if (isErrorResponse(previewData)) {
    return isStaleResponse(previewData) ? (
      <TerminalState
        title="This reminder is no longer available"
        description="The pool task or your access changed. Close this window to refresh the pool."
      />
    ) : (
      <RecoverableError onRetry={retryPreview} message={previewData.error} />
    );
  }

  if (previewData.status !== 'AVAILABLE') {
    return <UnavailableState availability={previewData} locale={locale} />;
  }

  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{config.title}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Review this preset reminder before queueing it.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Notification preview
          </p>
          <p className="mt-2 text-sm font-medium">
            {config.preview(senderDisplayName, poolTitle)}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-2xl font-semibold tabular-nums">
            {previewData.eligibleCount}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatPeople(previewData.eligibleCount)} can currently be notified.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {config.qualification}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Individual notification preferences and delivery channels stay
          private.
        </p>
      </div>
      <ResponsiveDialogFooter className="gap-2">
        <ResponsiveDialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </ResponsiveDialogClose>
        <Button type="button" onClick={sendReminder}>
          Send reminder
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}

function OrganizerReminderSendOutcome({
  locale,
  sendData,
  sendReminder,
}: Readonly<{
  locale: Parameters<typeof formatRelativeTime>[1];
  sendData: OrganizerReminderSendResponse;
  sendReminder: () => Promise<void>;
}>) {
  if (isErrorResponse(sendData)) {
    return isStaleResponse(sendData) ? (
      <TerminalState
        title="This reminder is no longer available"
        description="The pool task or your access changed. Close this window to refresh the pool."
      />
    ) : (
      <RecoverableError onRetry={sendReminder} message={sendData.error} />
    );
  }
  if (sendData.status !== 'QUEUED') {
    return <UnavailableState availability={sendData} locale={locale} />;
  }
  return (
    <>
      <ResponsiveDialogHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-success-muted text-success">
          <LuCheck className="h-5 w-5" aria-hidden />
        </div>
        <ResponsiveDialogTitle>Reminder queued</ResponsiveDialogTitle>
        <ResponsiveDialogDescription aria-live="polite" role="status">
          Reminder queued for {formatPeople(sendData.queuedCount)}.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <div className="space-y-1 rounded-xl border bg-muted/30 p-4 text-sm">
        <p>Queued {formatRelativeTime(sendData.createdAt, locale)}</p>
        <p className="text-muted-foreground">
          Available again at {formatExactTime(sendData.availableAt, locale)}.
        </p>
      </div>
      <CloseFooter label="Done" />
    </>
  );
}

function UnavailableState({
  availability,
  locale,
}: Readonly<{
  availability: OrganizerReminderUnavailable;
  locale: Parameters<typeof formatRelativeTime>[1];
}>) {
  if (availability.status === 'NO_ELIGIBLE') {
    return (
      <TerminalState
        title="No one can be notified right now"
        description="No reminder was sent, so this didn't count toward your limits."
      />
    );
  }
  if (availability.status === 'COOLDOWN') {
    return (
      <TerminalState
        title="A reminder was queued recently"
        description={`This reminder becomes available again at ${formatExactTime(availability.availableAt, locale)}.`}
      />
    );
  }
  return (
    <TerminalState
      title="Rolling seven-day limit reached"
      description={`Pool reminders become available again at ${formatExactTime(availability.availableAt, locale)}.`}
    />
  );
}

function RecoverableError({
  message = 'We could not confirm the reminder. You can safely retry with the same request.',
  onRetry,
}: Readonly<{
  message?: string;
  onRetry: () => void | Promise<void>;
}>) {
  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>Reminder not queued</ResponsiveDialogTitle>
        <ResponsiveDialogDescription role="alert">
          {message}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogFooter className="gap-2">
        <ResponsiveDialogClose asChild>
          <Button type="button" variant="outline">
            Close
          </Button>
        </ResponsiveDialogClose>
        <Button type="button" onClick={onRetry}>
          Retry
        </Button>
      </ResponsiveDialogFooter>
    </>
  );
}

function TerminalState({
  description,
  title,
}: Readonly<{
  description: string;
  title: string;
}>) {
  return (
    <>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription aria-live="polite" role="status">
          {description}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <CloseFooter label="Done" />
    </>
  );
}

function CloseFooter({ label }: Readonly<{ label: string }>) {
  return (
    <ResponsiveDialogFooter>
      <ResponsiveDialogClose asChild>
        <Button type="button">{label}</Button>
      </ResponsiveDialogClose>
    </ResponsiveDialogFooter>
  );
}

function getTriggerStatus(
  availability: OrganizerReminderAvailability,
  locale: Parameters<typeof formatRelativeTime>[1],
) {
  switch (availability.status) {
    case 'AVAILABLE':
      return null;
    case 'NO_ELIGIBLE':
      return 'No one can be notified right now.';
    case 'COOLDOWN': {
      const latest = availability.latestNudge
        ? `Queued ${formatRelativeTime(availability.latestNudge.createdAt, locale)}. `
        : '';
      return `${latest}Available again at ${formatExactTime(availability.availableAt, locale)}.`;
    }
    case 'WEEKLY_LIMIT':
      return `Rolling seven-day reminder limit reached. Available again at ${formatExactTime(availability.availableAt, locale)}.`;
  }
}

function formatExactTime(
  value: Date | string,
  locale: Parameters<typeof formatRelativeTime>[1],
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'the time shown after refresh';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatPeople(count: number) {
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}

function isErrorResponse(
  value: OrganizerReminderPreviewResponse | OrganizerReminderSendResponse,
): value is OrganizerReminderErrorResponse {
  return 'error' in value;
}

function isQueuedResponse(
  value: OrganizerReminderSendResponse | undefined,
): value is OrganizerReminderQueuedResponse {
  return Boolean(value && !isErrorResponse(value) && value.status === 'QUEUED');
}

function isStaleResponse(value: OrganizerReminderErrorResponse) {
  return (
    value.code === 'POOL_NOT_FOUND' ||
    value.code === 'FORBIDDEN' ||
    value.code === 'TASK_UNAVAILABLE' ||
    value.code === 'IDEMPOTENCY_CONFLICT'
  );
}
