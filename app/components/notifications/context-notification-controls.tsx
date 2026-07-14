import React from 'react';
import {
  LuBell,
  LuBellOff,
  LuCheck,
  LuChevronRight,
  LuX,
} from 'react-icons/lu';
import { Link, useFetcher } from 'react-router';
import { Button } from '#app/components/ui/button.tsx';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '#app/components/ui/responsive-dialog.tsx';
import { cn } from '#app/utils/misc.tsx';
import {
  type NotificationContext,
  type NotificationTopic,
} from '#app/utils/notification-catalog.ts';
import {
  isNotificationActivityLevel,
  NOTIFICATION_ACTIVITY_LEVELS,
  type ContextNotificationAwarenessReason,
  type NotificationActivityLevel,
} from '#app/utils/notification-context.ts';

type SerializableContextPreference = {
  activityLevel: NotificationActivityLevel;
  source: 'application_default' | 'group_override' | 'pool_override';
  customTopics: Array<NotificationTopic>;
};

export type SerializableContextAwareness = {
  notificationOff: boolean;
  reason: ContextNotificationAwarenessReason | null;
  noticeVisible: boolean;
  preference: SerializableContextPreference;
};

export type ContextTopicOption = {
  topic: NotificationTopic;
  label: string;
  description: string;
};

const activityOptions = [
  {
    value: NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY,
    label: 'All activity',
    description: 'Every update from this space, within your channel choices.',
  },
  {
    value: NOTIFICATION_ACTIVITY_LEVELS.IMPORTANT_ONLY,
    label: 'Important only',
    description: 'Only key moments — decisions, assignments, and milestones.',
  },
  {
    value: NOTIFICATION_ACTIVITY_LEVELS.MUTED,
    label: 'Muted',
    description:
      'Silence optional updates and organizer nudges. Account and security messages are separate.',
  },
] as const;

export function ContextNotificationControl({
  context,
  contextLabel,
  awareness,
  availableTopics,
  inheritedFromLabel,
}: Readonly<{
  context: NotificationContext;
  contextLabel: string;
  awareness: SerializableContextAwareness;
  availableTopics: Array<ContextTopicOption>;
  inheritedFromLabel?: string | null;
}>) {
  const [open, setOpen] = React.useState(false);
  const fetcher = useFetcher<{ ok: boolean }>();
  const pendingLevel = fetcher.formData?.get('activityLevel');
  const level = isNotificationActivityLevel(pendingLevel)
    ? pendingLevel
    : awareness.preference.activityLevel;
  const inherited =
    context.kind === 'POOL' && awareness.preference.source === 'group_override';
  const hasPoolOverride =
    context.kind === 'POOL' && awareness.preference.source === 'pool_override';
  const displayLabel =
    awareness.reason === 'no_channels' ? 'Off' : activityLabel(level);
  const Icon = awareness.notificationOff ? LuBellOff : LuBell;

  const setActivity = (
    activityLevel: NotificationActivityLevel,
    topics: Array<NotificationTopic> = [],
  ) => {
    const formData = contextFormData(context, 'set-activity');
    formData.set('activityLevel', activityLevel);
    for (const topic of topics) formData.append('customTopic', topic);
    void fetcher.submit(formData, {
      action: '/api/notification-preferences/context',
      method: 'post',
    });
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none ring-ring focus-visible:ring-2',
            awareness.notificationOff
              ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
              : 'border-border bg-background text-foreground hover:bg-muted',
          )}
          aria-label={`Notifications for ${contextLabel}: ${displayLabel}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{displayLabel}</span>
        </button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Notifications</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Choose how much activity you want from {contextLabel}. Your delivery
            channels still apply.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4 py-2">
          {inherited ? (
            <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              Using the notification setting from{' '}
              <span className="font-medium text-foreground">
                {inheritedFromLabel ?? 'this group'}
              </span>
              . Choosing an option below changes only this pool.
            </div>
          ) : null}

          <div
            className="space-y-2"
            role="radiogroup"
            aria-label="Activity level"
          >
            {activityOptions.map((option) => (
              <ActivityOption
                key={option.value}
                selected={level === option.value}
                disabled={fetcher.state !== 'idle'}
                label={option.label}
                description={option.description}
                onSelect={() => setActivity(option.value)}
              />
            ))}
          </div>

          {availableTopics.length > 0 ? (
            <CustomTopicOptions
              topics={availableTopics}
              selected={awareness.preference.customTopics}
              active={level === NOTIFICATION_ACTIVITY_LEVELS.CUSTOM}
              disabled={fetcher.state !== 'idle'}
              onChange={(topics) =>
                setActivity(NOTIFICATION_ACTIVITY_LEVELS.CUSTOM, topics)
              }
            />
          ) : null}

          {hasPoolOverride ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={fetcher.state !== 'idle'}
              onClick={() => {
                void fetcher.submit(
                  contextFormData(context, 'clear-activity'),
                  {
                    action: '/api/notification-preferences/context',
                    method: 'post',
                  },
                );
              }}
            >
              Use group setting
            </Button>
          ) : null}

          <Button asChild variant="link" className="w-full">
            <Link to="/settings/profile/notifications">
              Manage delivery channels and all topics
              <LuChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ActivityOption({
  selected,
  disabled,
  label,
  description,
  onSelect,
}: Readonly<{
  selected: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onSelect: () => void;
}>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left outline-none ring-ring focus-visible:ring-2 disabled:opacity-60',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:bg-muted',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
      {selected ? (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <LuCheck className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
}

function CustomTopicOptions({
  topics,
  selected,
  active,
  disabled,
  onChange,
}: Readonly<{
  topics: Array<ContextTopicOption>;
  selected: Array<NotificationTopic>;
  active: boolean;
  disabled: boolean;
  onChange: (topics: Array<NotificationTopic>) => void;
}>) {
  return (
    <fieldset className="rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">Custom topics</legend>
      <p className="mb-2 text-sm text-muted-foreground">
        Pick exactly which topics reach you.
      </p>
      <div className="space-y-2">
        {topics.map((topic) => {
          const checked = active && selected.includes(topic.topic);
          return (
            <label
              key={topic.topic}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  const next = checked
                    ? selected.filter((value) => value !== topic.topic)
                    : [...selected, topic.topic];
                  onChange(next);
                }}
              />
              <span>
                <span className="block text-sm font-medium">{topic.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {topic.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ContextNotificationAwarenessNotice({
  context,
  contextLabel,
  awareness,
  inheritedFromLabel,
}: Readonly<{
  context: NotificationContext;
  contextLabel: string;
  awareness: SerializableContextAwareness;
  inheritedFromLabel?: string | null;
}>) {
  const fetcher = useFetcher<{ ok: boolean }>();
  if (!awareness.noticeVisible || !awareness.reason) return null;

  const copy = awarenessCopy(
    awareness.reason,
    contextLabel,
    inheritedFromLabel,
  );
  return (
    <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <LuBellOff className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{copy.title}</p>
        <p className="mt-0.5 text-sm opacity-80">{copy.description}</p>
        {awareness.reason === 'no_channels' ? (
          <Button
            asChild
            variant="link"
            className="mt-1 h-auto p-0 text-current"
          >
            <Link to="/settings/profile/notifications">Turn on a channel</Link>
          </Button>
        ) : (
          <button
            type="button"
            className="mt-2 min-h-11 text-sm font-medium underline underline-offset-4"
            disabled={fetcher.state !== 'idle'}
            onClick={() => {
              const formData = contextFormData(context, 'set-activity');
              formData.set(
                'activityLevel',
                NOTIFICATION_ACTIVITY_LEVELS.IMPORTANT_ONLY,
              );
              void fetcher.submit(formData, {
                action: '/api/notification-preferences/context',
                method: 'post',
              });
            }}
          >
            Turn on important updates
            {awareness.reason === 'inherited_mute' ? ' here' : ''}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification settings notice"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={fetcher.state !== 'idle'}
        onClick={() => {
          void fetcher.submit(contextFormData(context, 'dismiss-notice'), {
            action: '/api/notification-preferences/context',
            method: 'post',
          });
        }}
      >
        <LuX className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function contextFormData(
  context: NotificationContext,
  intent: 'set-activity' | 'clear-activity' | 'dismiss-notice',
) {
  const formData = new FormData();
  formData.set('intent', intent);
  formData.set('contextKind', context.kind);
  formData.set(
    'contextId',
    context.kind === 'GROUP' ? context.groupId : context.poolId,
  );
  return formData;
}

function activityLabel(level: NotificationActivityLevel) {
  switch (level) {
    case NOTIFICATION_ACTIVITY_LEVELS.ALL_ACTIVITY:
      return 'All activity';
    case NOTIFICATION_ACTIVITY_LEVELS.IMPORTANT_ONLY:
      return 'Important';
    case NOTIFICATION_ACTIVITY_LEVELS.MUTED:
      return 'Muted';
    case NOTIFICATION_ACTIVITY_LEVELS.CUSTOM:
      return 'Custom';
  }
}

function awarenessCopy(
  reason: ContextNotificationAwarenessReason,
  contextLabel: string,
  inheritedFromLabel?: string | null,
) {
  if (reason === 'inherited_mute') {
    return {
      title: 'Notifications are muted by the group setting',
      description: `${inheritedFromLabel ?? 'The parent group'} is muted, so ${contextLabel} inherits that choice.`,
    };
  }
  if (reason === 'no_channels') {
    return {
      title: 'No delivery channel is on',
      description: `Updates from ${contextLabel} cannot reach you until you turn on in-app, email, or push.`,
    };
  }
  return {
    title: `You muted ${contextLabel}`,
    description:
      'Optional updates are off. You can still change this from the notification control above.',
  };
}
