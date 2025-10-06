import { invariantResponse } from '@epic-web/invariant';
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/node';
import { Form, Link, useLoaderData, useSubmit } from '@remix-run/react';
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
  invariantResponse(targetUserId, 'Unable to resolve user preferences', {
    status: 400,
  });

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
    return json({ ok: true });
  }

  if (intent === 'disable-email') {
    await disableEmailForAll(userId, 'settings:notifications');
    return json({ ok: true });
  }

  return json({ ok: false }, { status: 400 });
}

const channelLabels: Record<NotificationChannel, string> = {
  [NOTIFICATION_CHANNELS.IN_APP]: 'In-app',
  [NOTIFICATION_CHANNELS.EMAIL]: 'Email',
};

const NotificationsSettingsRoute = () => {
  const data = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const preferenceMap = new Map<
    NotificationType,
    { inAppEnabled: boolean; emailEnabled: boolean }
  >();
  for (const pref of data.preferences) {
    preferenceMap.set(pref.type, {
      inAppEnabled: pref.inAppEnabled,
      emailEnabled: pref.emailEnabled,
    });
  }

  const handleToggle = (
    type: NotificationType,
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    const formData = new FormData();
    formData.set('intent', 'toggle');
    formData.set('type', type);
    formData.set('channel', channel);
    formData.set('enabled', String(!enabled));
    submit(formData, { method: 'POST', replace: true });
  };

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
                  const pref =
                    preferenceMap.get(item.type) ??
                    DEFAULT_CHANNEL_FALLBACK[item.type];
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
                          disabled={disableToggles}
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
                            (!item.emailDefault && item.disabled)
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
        <Form method="post">
          <input type="hidden" name="intent" value="disable-email" />
          <Button type="submit" variant="ghost" className="text-sm">
            Turn off all email notifications
          </Button>
        </Form>
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
        onCheckedChange={(value) => {
          if (!disabled) onChange();
        }}
      />
      <span>{label}</span>
    </label>
  );
}
