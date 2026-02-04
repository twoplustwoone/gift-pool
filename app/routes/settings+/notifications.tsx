import { invariantResponse } from '@epic-web/invariant';
import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/node';
import { Link, useFetcher, useLoaderData } from '@remix-run/react';
import React from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { Checkbox } from '#app/components/ui/checkbox.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { getUserId, requireUserId } from '#app/utils/auth.server.ts';
import { cn } from '#app/utils/misc.tsx';
import { verifyPreferenceToken } from '#app/utils/notification-preference-token.server.ts';
import {
  disableEmailForAll,
  getNotificationPreferences,
  setNotificationPreference,
} from '#app/utils/notification-preferences.server.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationChannel,
  type NotificationType,
} from '#app/utils/notification-registry.ts';

const preferenceGroups: Array<{
  id: string;
  title: string;
  description?: string;
  items: Array<{
    type: NotificationType;
    label: string;
    description: string;
    emailDefault: boolean;
    disabled?: boolean;
  }>;
}> = [
  {
    id: 'friend-activity',
    title: 'Friend activity',
    items: [
      {
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_RECEIVED,
        label: 'Friend request received',
        description: 'When someone sends you a friend request.',
        emailDefault: true,
      },
      {
        type: NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED,
        label: 'Friend request accepted',
        description: 'When someone accepts your friend request.',
        emailDefault: true,
      },
    ],
  },
  {
    id: 'reminders',
    title: 'Reminders',
    description: 'Upcoming birthday reminders are coming soon.',
    items: [
      {
        type: NOTIFICATION_TYPES.UPCOMING_BIRTHDAY,
        label: 'Upcoming birthdays',
        description: 'Receive reminders before birthdays in your groups.',
        emailDefault: false,
        disabled: true,
      },
    ],
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  const tokenPayload = tokenParam ? verifyPreferenceToken(tokenParam) : null;

  const targetUserId = tokenPayload?.uid ?? userId ?? null;
  if (!targetUserId) {
    throw redirect('/login?redirectTo=/settings/notifications');
  }

  const canReadPreferences =
    (userId && userId === targetUserId) ||
    (tokenPayload && tokenPayload.uid === targetUserId);

  const preferencesMap = canReadPreferences
    ? await getNotificationPreferences(targetUserId)
    : null;

  const preferences = new Map<
    NotificationType,
    { inAppEnabled: boolean; emailEnabled: boolean }
  >();
  if (preferencesMap) {
    for (const [type, value] of preferencesMap.entries()) {
      preferences.set(type, value);
    }
  }

  return json({
    isAuthenticated: Boolean(userId),
    viewerUserId: userId,
    targetUserId,
    tokenValid: Boolean(tokenPayload && tokenPayload.uid === targetUserId),
    preferences: Array.from(preferences.entries()).map(([type, pref]) => ({
      type,
      inAppEnabled: pref.inAppEnabled,
      emailEnabled: pref.emailEnabled,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');
  const requestId =
    typeof formData.get('requestId') === 'string'
      ? String(formData.get('requestId'))
      : null;

  const userId = await requireUserId(request);

  if (intent === 'toggle') {
    const type = formData.get('type');
    const channel = formData.get('channel');
    const enabled = formData.get('enabled');
    invariantResponse(
      typeof type === 'string' && type in NOTIFICATION_TYPES,
      'Invalid notification type',
    );
    invariantResponse(
      typeof channel === 'string' && channel in NOTIFICATION_CHANNELS,
      'Invalid channel',
    );
    invariantResponse(typeof enabled === 'string', 'Invalid enabled value');

    const normalizedEnabled = enabled === 'true';
    await setNotificationPreference(
      userId,
      type as NotificationType,
      channel as NotificationChannel,
      normalizedEnabled,
      'settings:notifications',
    );
    return json({ ok: true, requestId });
  }

  if (intent === 'disable-email') {
    await disableEmailForAll(userId, 'settings:notifications');
    return json({ ok: true, requestId });
  }

  return json({ ok: false, requestId }, { status: 400 });
}

type NotificationPreferenceState = Record<
  NotificationType,
  { inAppEnabled: boolean; emailEnabled: boolean }
>;

type PreferenceKey = `${NotificationType}:${NotificationChannel}`;

type PreferencesActionResult = {
  ok: boolean;
  requestId?: string | null;
};

const NotificationsSettingsRoute = () => {
  const data = useLoaderData<typeof loader>();
  const toggleFetcher = useFetcher<PreferencesActionResult>();
  const disableEmailFetcher = useFetcher<PreferencesActionResult>();
  const [preferences, setPreferences] =
    React.useState<NotificationPreferenceState>(() =>
      buildPreferenceState(data.preferences),
    );
  const [pendingKeys, setPendingKeys] = React.useState<Set<PreferenceKey>>(
    () => new Set(),
  );
  const requestCounterRef = React.useRef(0);
  const togglePendingRef = React.useRef<{
    requestId: string;
    key: PreferenceKey;
    type: NotificationType;
    channel: NotificationChannel;
    previousValue: boolean;
  } | null>(null);
  const toggleFetcherWasPendingRef = React.useRef(false);
  const disableEmailPendingRef = React.useRef<{
    requestId: string;
    previousValues: Record<NotificationType, boolean>;
    keys: PreferenceKey[];
  } | null>(null);
  const disableEmailFetcherWasPendingRef = React.useRef(false);

  React.useEffect(() => {
    setPreferences(buildPreferenceState(data.preferences));
  }, [data.preferences]);

  const createRequestId = React.useCallback(() => {
    requestCounterRef.current += 1;
    return `notifications-${Date.now()}-${requestCounterRef.current}`;
  }, []);

  const handleToggle = (
    type: NotificationType,
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    if (toggleFetcher.state !== 'idle') return;
    const key = getPreferenceKey(type, channel);
    if (pendingKeys.has(key)) return;
    const nextEnabled = !enabled;
    const requestId = createRequestId();
    const channelField = getChannelField(channel);

    togglePendingRef.current = {
      requestId,
      key,
      type,
      channel,
      previousValue: enabled,
    };
    setPreferences((previous) => ({
      ...previous,
      [type]: {
        ...previous[type],
        [channelField]: nextEnabled,
      },
    }));
    setPendingKeys((previous) => {
      const next = new Set(previous);
      next.add(key);
      return next;
    });

    const formData = new FormData();
    formData.set('intent', 'toggle');
    formData.set('type', type);
    formData.set('channel', channel);
    formData.set('enabled', String(nextEnabled));
    formData.set('requestId', requestId);
    toggleFetcher.submit(formData, { method: 'POST' });
  };

  const handleDisableAllEmail = React.useCallback(() => {
    if (disableEmailFetcher.state !== 'idle') return;
    const requestId = createRequestId();
    const previousValues = {} as Record<NotificationType, boolean>;
    const keys: PreferenceKey[] = [];

    for (const type of PREFERENCE_TYPES) {
      previousValues[type] = preferences[type].emailEnabled;
      keys.push(getPreferenceKey(type, NOTIFICATION_CHANNELS.EMAIL));
    }

    disableEmailPendingRef.current = { requestId, previousValues, keys };

    setPreferences((previous) => {
      const next = { ...previous };
      for (const type of PREFERENCE_TYPES) {
        next[type] = { ...next[type], emailEnabled: false };
      }
      return next;
    });
    setPendingKeys((previous) => {
      const next = new Set(previous);
      for (const key of keys) next.add(key);
      return next;
    });

    const formData = new FormData();
    formData.set('intent', 'disable-email');
    formData.set('requestId', requestId);
    disableEmailFetcher.submit(formData, { method: 'POST' });
  }, [createRequestId, disableEmailFetcher, preferences]);

  React.useEffect(() => {
    if (toggleFetcher.state !== 'idle') {
      toggleFetcherWasPendingRef.current = true;
      return;
    }
    if (!toggleFetcherWasPendingRef.current) return;
    toggleFetcherWasPendingRef.current = false;

    const pending = togglePendingRef.current;
    if (!pending) return;

    const didSucceed =
      toggleFetcher.data?.ok === true &&
      toggleFetcher.data.requestId === pending.requestId;
    if (!didSucceed) {
      const channelField = getChannelField(pending.channel);
      setPreferences((previous) => ({
        ...previous,
        [pending.type]: {
          ...previous[pending.type],
          [channelField]: pending.previousValue,
        },
      }));
    }

    setPendingKeys((previous) => {
      const next = new Set(previous);
      next.delete(pending.key);
      return next;
    });
    togglePendingRef.current = null;
  }, [toggleFetcher.data, toggleFetcher.state]);

  React.useEffect(() => {
    if (disableEmailFetcher.state !== 'idle') {
      disableEmailFetcherWasPendingRef.current = true;
      return;
    }
    if (!disableEmailFetcherWasPendingRef.current) return;
    disableEmailFetcherWasPendingRef.current = false;

    const pending = disableEmailPendingRef.current;
    if (!pending) return;

    const didSucceed =
      disableEmailFetcher.data?.ok === true &&
      disableEmailFetcher.data.requestId === pending.requestId;
    if (!didSucceed) {
      setPreferences((previous) => {
        const next = { ...previous };
        for (const type of PREFERENCE_TYPES) {
          next[type] = {
            ...next[type],
            emailEnabled: pending.previousValues[type],
          };
        }
        return next;
      });
    }

    setPendingKeys((previous) => {
      const next = new Set(previous);
      for (const key of pending.keys) next.delete(key);
      return next;
    });
    disableEmailPendingRef.current = null;
  }, [disableEmailFetcher.data, disableEmailFetcher.state]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Heading>Notifications</Heading>
        <p className="text-sm text-muted-foreground">
          Choose how you want to hear from us. Transactional emails may still be
          sent for critical account activity.
        </p>
      </div>

      {!data.isAuthenticated ? (
        <div className="rounded-md border border-dashed border-muted-foreground/50 bg-muted px-4 py-3 text-sm text-muted-foreground">
          <p>You are viewing notification preferences with a one-time link.</p>
          <p>
            <Link
              className="underline"
              to={`/login?redirectTo=/settings/notifications`}
            >
              Sign in to update your preferences.
            </Link>
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Notification</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">In-app</th>
              <th className="px-4 py-3">Email</th>
            </tr>
          </thead>
          <tbody>
            {preferenceGroups.map((group) => (
              <React.Fragment key={group.id}>
                <tr className="bg-muted/60">
                  <td className="px-4 py-3 font-semibold" colSpan={4}>
                    {group.title}
                  </td>
                </tr>
                {group.description ? (
                  <tr className="bg-muted/40 text-xs text-muted-foreground">
                    <td className="px-4 pb-2" colSpan={4}>
                      {group.description}
                    </td>
                  </tr>
                ) : null}
                {group.items.map((item) => {
                  const pref = preferences[item.type];
                  const pendingInApp = pendingKeys.has(
                    getPreferenceKey(item.type, NOTIFICATION_CHANNELS.IN_APP),
                  );
                  const pendingEmail = pendingKeys.has(
                    getPreferenceKey(item.type, NOTIFICATION_CHANNELS.EMAIL),
                  );
                  const disableToggles = item.disabled || !data.isAuthenticated;
                  return (
                    <tr key={item.type} className="even:bg-muted/10">
                      <td className="px-4 py-3 font-medium">{item.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.description}
                      </td>
                      <td className="px-4 py-3">
                        <PreferenceCheckbox
                          checked={pref.inAppEnabled}
                          label="Enable in-app"
                          disabled={disableToggles || pendingInApp}
                          onChange={() =>
                            handleToggle(
                              item.type,
                              NOTIFICATION_CHANNELS.IN_APP,
                              pref.inAppEnabled,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <PreferenceCheckbox
                          checked={pref.emailEnabled}
                          label="Enable email"
                          disabled={
                            disableToggles ||
                            (!item.emailDefault && item.disabled) ||
                            pendingEmail
                          }
                          onChange={() =>
                            handleToggle(
                              item.type,
                              NOTIFICATION_CHANNELS.EMAIL,
                              pref.emailEnabled,
                            )
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {data.isAuthenticated ? (
        <Button
          type="button"
          variant="ghost"
          className="text-sm"
          disabled={disableEmailFetcher.state !== 'idle'}
          onClick={handleDisableAllEmail}
        >
          Turn off all email notifications
        </Button>
      ) : null}
    </div>
  );
};

export default NotificationsSettingsRoute;

const DEFAULT_CHANNEL_FALLBACK: Record<
  NotificationType,
  { inAppEnabled: boolean; emailEnabled: boolean }
> = Object.fromEntries(
  Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, value]) => [
    key,
    value,
  ]),
) as Record<NotificationType, { inAppEnabled: boolean; emailEnabled: boolean }>;

const PREFERENCE_TYPES = preferenceGroups.flatMap((group) =>
  group.items.map((item) => item.type),
);

function buildPreferenceState(
  preferences: Array<{
    type: NotificationType;
    inAppEnabled: boolean;
    emailEnabled: boolean;
  }>,
): NotificationPreferenceState {
  const next = { ...DEFAULT_CHANNEL_FALLBACK } as NotificationPreferenceState;
  for (const pref of preferences) {
    next[pref.type] = {
      inAppEnabled: pref.inAppEnabled,
      emailEnabled: pref.emailEnabled,
    };
  }
  return next;
}

function getChannelField(channel: NotificationChannel) {
  return channel === NOTIFICATION_CHANNELS.IN_APP
    ? 'inAppEnabled'
    : 'emailEnabled';
}

function getPreferenceKey(
  type: NotificationType,
  channel: NotificationChannel,
) {
  return `${type}:${channel}` as PreferenceKey;
}

function PreferenceCheckbox({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-sm',
        disabled && 'opacity-50',
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(_value) => {
          if (!disabled) onChange();
        }}
      />
      <span>{label}</span>
    </label>
  );
}
