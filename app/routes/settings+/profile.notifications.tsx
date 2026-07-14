import { invariantResponse } from '@epic-web/invariant';
import React from 'react';
import {
  LuBell,
  LuChevronDown,
  LuMail,
  LuMonitorSmartphone,
} from 'react-icons/lu';
import {
  data,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from 'react-router';
import { PreferenceSwitch } from '#app/components/notifications/preference-switch.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { useWebPush } from '#app/hooks/use-web-push.ts';
import { getUserId, requireUserId } from '#app/utils/auth.server.ts';
import { cn } from '#app/utils/misc.tsx';
import {
  getNotificationCategoryDefinition,
  getNotificationTopicDefinition,
  isNotificationCategory,
  isNotificationChannel,
  isNotificationTopic,
  isNotificationType,
  NOTIFICATION_CATEGORY_VALUES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_VALUES,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationTopic,
} from '#app/utils/notification-catalog.ts';
import { verifyPreferenceToken } from '#app/utils/notification-preference-token.server.ts';
import {
  disableEmailForAll,
  getCentralNotificationSettings,
  setCategoryChannelPreference,
  setGlobalChannelPreference,
  setNotificationPreference,
  setTopicChannelPreference,
} from '#app/utils/notification-preferences.server.ts';

const SOURCE = 'settings:notifications';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  const token = new URL(request.url).searchParams.get('token');
  const tokenPayload = token ? verifyPreferenceToken(token) : null;
  const targetUserId = tokenPayload?.uid ?? userId ?? null;
  if (!targetUserId) {
    throw redirect('/login?redirectTo=/settings/profile/notifications');
  }

  const tokenValid = tokenPayload?.uid === targetUserId;
  const canRead = userId === targetUserId || tokenValid;
  invariantResponse(canRead, 'Invalid notification preference link', {
    status: 403,
  });

  return {
    canEdit: userId === targetUserId,
    isAuthenticated: Boolean(userId),
    targetUserId,
    tokenValid,
    settings: await getCentralNotificationSettings(targetUserId),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');
  const requestId = stringValue(formData.get('requestId'));
  const userId = await requireUserId(request);
  const enabledValue = formData.get('enabled');
  const enabled = enabledValue === 'true';

  if (intent === 'global-channel') {
    const channel = formData.get('channel');
    invariantResponse(isNotificationChannel(channel), 'Invalid channel');
    invariantResponse(isBooleanString(enabledValue), 'Invalid enabled value');
    await setGlobalChannelPreference({
      userId,
      channel,
      enabled,
      source: SOURCE,
    });
    return { ok: true, requestId };
  }

  if (intent === 'category-channel') {
    const category = formData.get('category');
    const channel = formData.get('channel');
    invariantResponse(isNotificationCategory(category), 'Invalid category');
    invariantResponse(isNotificationChannel(channel), 'Invalid channel');
    invariantResponse(isBooleanString(enabledValue), 'Invalid enabled value');
    await setCategoryChannelPreference({
      userId,
      category,
      channel,
      enabled,
      source: SOURCE,
    });
    return { ok: true, requestId };
  }

  if (intent === 'topic-channel') {
    const topic = formData.get('topic');
    const channel = formData.get('channel');
    invariantResponse(isNotificationTopic(topic), 'Invalid topic');
    invariantResponse(isNotificationChannel(channel), 'Invalid channel');
    invariantResponse(isBooleanString(enabledValue), 'Invalid enabled value');
    await setTopicChannelPreference({
      userId,
      topic,
      channel,
      enabled,
      source: SOURCE,
    });
    return { ok: true, requestId };
  }

  // Keep accepting the old payloads while links or an open tab can still be
  // running the previous UI during a deploy.
  if (intent === 'toggle') {
    const type = formData.get('type');
    const channel = formData.get('channel');
    invariantResponse(isNotificationType(type), 'Invalid notification type');
    invariantResponse(isNotificationChannel(channel), 'Invalid channel');
    invariantResponse(isBooleanString(enabledValue), 'Invalid enabled value');
    await setNotificationPreference(userId, type, channel, enabled, SOURCE);
    return { ok: true, requestId };
  }

  if (intent === 'disable-email') {
    await disableEmailForAll(userId, SOURCE);
    return { ok: true, requestId };
  }

  return data({ ok: false, requestId }, { status: 400 });
}

const channelDetails = {
  [NOTIFICATION_CHANNELS.IN_APP]: {
    label: 'In-app',
    description: 'Show updates in your Gift Pool notification center.',
    icon: LuBell,
  },
  [NOTIFICATION_CHANNELS.EMAIL]: {
    label: 'Email',
    description: 'Send selected updates to your account email.',
    icon: LuMail,
  },
  [NOTIFICATION_CHANNELS.WEB_PUSH]: {
    label: 'Push',
    description: 'Send selected updates to subscribed devices.',
    icon: LuMonitorSmartphone,
  },
} as const;

type ActionResult = { ok: boolean; requestId?: string | null };

const NotificationsSettingsRoute = () => {
  const loaderData = useLoaderData<typeof loader>();
  const push = useWebPush();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Heading>Notifications</Heading>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Choose which updates matter and where they can reach you. Critical
          account and security messages are managed separately.
        </p>
      </div>

      {!loaderData.canEdit ? <ReadOnlyNotice /> : null}

      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <h2 className="font-semibold">Delivery channels</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A channel must be on here and for a topic below before it can send.
          </p>
        </div>
        <div className="divide-y divide-border">
          {NOTIFICATION_CHANNEL_VALUES.map((channel) => {
            const details = channelDetails[channel];
            const Icon = details.icon;
            return (
              <div
                key={channel}
                className="flex min-h-20 items-center gap-3 px-3 py-3 sm:px-5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{details.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {details.description}
                  </p>
                </div>
                <MutationSwitch
                  intent="global-channel"
                  channel={channel}
                  checked={loaderData.settings.channels[channel].enabled}
                  disabled={!loaderData.canEdit}
                  label={`${details.label} notifications`}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <PushCapabilityStatus push={push} canEdit={loaderData.canEdit} />

      <section className="space-y-3" aria-labelledby="notification-topics">
        <div>
          <h2 id="notification-topics" className="font-semibold">
            Notification topics
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fine-tune each kind of update. Category actions change every topic
            in that category at once.
          </p>
        </div>
        {NOTIFICATION_CATEGORY_VALUES.map((category) => (
          <CategoryCard
            key={category}
            category={category}
            topics={loaderData.settings.topics.filter(
              (topic) => topic.category === category,
            )}
            canEdit={loaderData.canEdit}
          />
        ))}
      </section>
    </div>
  );
};

export default NotificationsSettingsRoute;

function ReadOnlyNotice() {
  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/50 bg-muted px-4 py-3 text-sm text-muted-foreground">
      <p>You are viewing notification preferences with a one-time link.</p>
      <Button asChild variant="link" className="h-auto justify-start p-0">
        <Link to="/login?redirectTo=/settings/profile/notifications">
          Sign in to edit notification preferences
        </Link>
      </Button>
    </div>
  );
}

function CategoryCard({
  category,
  topics,
  canEdit,
}: Readonly<{
  category: NotificationCategory;
  topics: Array<{
    topic: NotificationTopic;
    category: NotificationCategory;
    channels: Record<NotificationChannel, { enabled: boolean }>;
  }>;
  canEdit: boolean;
}>) {
  const [expanded, setExpanded] = React.useState(true);
  const definition = getNotificationCategoryDefinition(category);

  return (
    <Card padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none ring-inset ring-ring focus-visible:ring-2 sm:px-6"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{definition.label}</span>
          <span className="block text-sm text-muted-foreground">
            {definition.description}
          </span>
        </span>
        <LuChevronDown
          aria-hidden="true"
          className={cn(
            'h-5 w-5 shrink-0 transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded ? (
        <div className="border-t border-border">
          <div className="grid gap-2 bg-muted/40 px-4 py-3 sm:grid-cols-3 sm:px-6">
            {NOTIFICATION_CHANNEL_VALUES.map((channel) => {
              const allOn = topics.every(
                (topic) => topic.channels[channel].enabled,
              );
              const someOn = topics.some(
                (topic) => topic.channels[channel].enabled,
              );
              return (
                <CategoryBulkAction
                  key={channel}
                  category={category}
                  channel={channel}
                  enabled={allOn}
                  mixed={someOn && !allOn}
                  disabled={!canEdit}
                />
              );
            })}
          </div>
          <div className="divide-y divide-border">
            {topics.map((topic) => (
              <TopicRow key={topic.topic} topic={topic} canEdit={canEdit} />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function CategoryBulkAction({
  category,
  channel,
  enabled,
  mixed,
  disabled,
}: Readonly<{
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  mixed: boolean;
  disabled: boolean;
}>) {
  const fetcher = useFetcher<ActionResult>();
  const pending = fetcher.state !== 'idle';
  const nextEnabled = !enabled;
  const details = channelDetails[channel];
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="category-channel" />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="enabled" value={String(nextEnabled)} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        className="w-full justify-between rounded-lg"
        disabled={disabled || pending}
        aria-label={`${enabled ? 'Turn off' : 'Turn on'} all ${getNotificationCategoryDefinition(category).label} ${details.label} notifications`}
      >
        <span>{details.label}</span>
        <span className="text-xs text-muted-foreground">
          {enabled ? 'All on' : mixed ? 'Mixed · turn on' : 'All off'}
        </span>
      </Button>
    </fetcher.Form>
  );
}

function TopicRow({
  topic,
  canEdit,
}: Readonly<{
  topic: {
    topic: NotificationTopic;
    channels: Record<NotificationChannel, { enabled: boolean }>;
  };
  canEdit: boolean;
}>) {
  const definition = getNotificationTopicDefinition(topic.topic);
  return (
    <div className="px-4 py-4 sm:px-6">
      <p className="font-medium">{definition.label}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {definition.description}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {NOTIFICATION_CHANNEL_VALUES.map((channel) => (
          <div
            key={channel}
            className="flex min-w-0 flex-col items-center rounded-lg border border-border px-1 py-1 sm:flex-row sm:justify-between sm:px-2"
          >
            <span className="truncate text-xs text-muted-foreground">
              {channelDetails[channel].label}
            </span>
            <MutationSwitch
              intent="topic-channel"
              topic={topic.topic}
              channel={channel}
              checked={topic.channels[channel].enabled}
              disabled={!canEdit}
              label={`${definition.label}: ${channelDetails[channel].label}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function MutationSwitch({
  intent,
  channel,
  topic,
  checked,
  disabled,
  label,
}: Readonly<{
  intent: 'global-channel' | 'topic-channel';
  channel: NotificationChannel;
  topic?: NotificationTopic;
  checked: boolean;
  disabled: boolean;
  label: string;
}>) {
  const fetcher = useFetcher<ActionResult>();
  const pendingEnabled = fetcher.formData?.get('enabled');
  const optimisticChecked =
    typeof pendingEnabled === 'string' ? pendingEnabled === 'true' : checked;
  return (
    <>
      <PreferenceSwitch
        checked={optimisticChecked}
        disabled={disabled || fetcher.state !== 'idle'}
        label={label}
        onCheckedChange={(enabled) => {
          const formData = new FormData();
          formData.set('intent', intent);
          formData.set('channel', channel);
          formData.set('enabled', String(enabled));
          if (topic) formData.set('topic', topic);
          void fetcher.submit(formData, { method: 'post' });
        }}
      />
      {fetcher.data?.ok === false ? (
        <span className="sr-only" role="status">
          Could not save {label}. Try again.
        </span>
      ) : null}
    </>
  );
}

function PushCapabilityStatus({
  push,
  canEdit,
}: Readonly<{
  push: ReturnType<typeof useWebPush>;
  canEdit: boolean;
}>) {
  const revalidator = useRevalidator();
  if (push.status === 'unsupported' || push.status === 'loading') return null;

  const className =
    'flex flex-col gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between';
  let message = 'Push notifications are available for this device.';
  if (push.status === 'ios-needs-install') {
    message =
      'Add Gift Pool to your home screen to enable push on this device.';
  } else if (push.status === 'denied') {
    message = 'Push is blocked for this site in your browser settings.';
  } else if (push.status === 'subscribed') {
    message = 'Push notifications are enabled on this device.';
  }

  return (
    <div className={className}>
      <span className="text-muted-foreground">{message}</span>
      {!canEdit ? null : push.status === 'ios-needs-install' ? (
        <Button asChild variant="link" className="h-auto p-0">
          <Link to="/pwa-install">How to install</Link>
        </Button>
      ) : push.status === 'subscribed' ? (
        <Button
          type="button"
          variant="ghost"
          disabled={push.isBusy}
          onClick={() => {
            void push.unsubscribe().then(() => revalidator.revalidate());
          }}
        >
          Turn off on this device
        </Button>
      ) : push.status === 'default' ? (
        <Button
          type="button"
          disabled={push.isBusy}
          onClick={() => {
            void push.subscribe().then(() => revalidator.revalidate());
          }}
        >
          Enable on this device
        </Button>
      ) : null}
    </div>
  );
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value : null;
}

function isBooleanString(value: FormDataEntryValue | null) {
  return value === 'true' || value === 'false';
}
