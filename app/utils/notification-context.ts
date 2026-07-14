export const NOTIFICATION_ACTIVITY_LEVELS = {
  ALL_ACTIVITY: 'ALL_ACTIVITY',
  IMPORTANT_ONLY: 'IMPORTANT_ONLY',
  MUTED: 'MUTED',
  CUSTOM: 'CUSTOM',
} as const;

export type NotificationActivityLevel =
  (typeof NOTIFICATION_ACTIVITY_LEVELS)[keyof typeof NOTIFICATION_ACTIVITY_LEVELS];

export type ContextNotificationAwarenessReason =
  | 'explicit_mute'
  | 'inherited_mute'
  | 'no_channels';

export function isNotificationActivityLevel(
  value: unknown,
): value is NotificationActivityLevel {
  return (
    typeof value === 'string' &&
    Object.values(NOTIFICATION_ACTIVITY_LEVELS).includes(
      value as NotificationActivityLevel,
    )
  );
}
