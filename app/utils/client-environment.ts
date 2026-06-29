import {
  CLIENT_ENVIRONMENT_EVENT_NAME,
  type AnalyticEventName,
} from './analytics.ts';
import { track } from './analytics.client.ts';
import { getDisplayMode, isStandalone } from './pwa.ts';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';
export type ViewportBucket = 'desktop' | 'mobile' | 'tablet' | 'unknown';
export type NotificationPermissionState =
  | 'default'
  | 'denied'
  | 'granted'
  | 'unsupported';

export type ClientEnvironmentProperties = {
  browserFamily: string;
  browserMajor: number | null;
  osFamily: string;
  deviceType: DeviceType;
  viewportBucket: ViewportBucket;
  displayMode: ReturnType<typeof getDisplayMode>;
  isStandalone: boolean;
  serviceWorkerSupported: boolean;
  notificationPermission: NotificationPermissionState;
  observedAt: string;
};

const ENVIRONMENT_STORAGE_PREFIX = 'giftpool:client-environment-observed';
const PWA_EVENT_STORAGE_PREFIX = 'giftpool:pwa-event';

function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function parseMajor(value: string | undefined) {
  if (!value) return null;
  const major = Number.parseInt(value, 10);
  return Number.isFinite(major) ? major : null;
}

function isIpadLike(userAgent: string, maxTouchPoints: number) {
  return (
    /ipad/i.test(userAgent) ||
    (/macintosh/i.test(userAgent) && maxTouchPoints > 1)
  );
}

export function classifyBrowser(userAgent: string) {
  const checks: Array<[string, RegExp]> = [
    ['Edge', /(?:Edg|EdgiOS|EdgA)\/(\d+)/i],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/i],
    ['Opera', /(?:OPR|OPT)\/(\d+)/i],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/i],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/i],
    ['Safari', /Version\/(\d+).+Safari/i],
  ];
  for (const [browserFamily, regex] of checks) {
    const match = regex.exec(userAgent);
    if (match) {
      return { browserFamily, browserMajor: parseMajor(match[1]) };
    }
  }
  return { browserFamily: 'Unknown', browserMajor: null };
}

export function classifyOperatingSystem(userAgent: string, maxTouchPoints = 0) {
  if (
    /iphone|ipad|ipod/i.test(userAgent) ||
    isIpadLike(userAgent, maxTouchPoints)
  ) {
    return 'iOS';
  }
  if (/android/i.test(userAgent)) return 'Android';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/cros/i.test(userAgent)) return 'ChromeOS';
  if (/mac os x|macintosh/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
}

export function classifyDeviceType(
  userAgent: string,
  maxTouchPoints = 0,
): DeviceType {
  if (isIpadLike(userAgent, maxTouchPoints)) return 'tablet';
  if (/ipad|tablet/i.test(userAgent)) return 'tablet';
  if (/iphone|ipod|android.+mobile|mobile/i.test(userAgent)) return 'mobile';
  if (/android/i.test(userAgent)) return 'tablet';
  if (!userAgent) return 'unknown';
  return 'desktop';
}

export function getViewportBucket(width: number | undefined): ViewportBucket {
  if (typeof width !== 'number' || !Number.isFinite(width)) return 'unknown';
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function getNotificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export function collectClientEnvironment(
  now = new Date(),
): ClientEnvironmentProperties | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return null;
  }

  const userAgent = navigator.userAgent;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const browser = classifyBrowser(userAgent);

  return {
    ...browser,
    osFamily: classifyOperatingSystem(userAgent, maxTouchPoints),
    deviceType: classifyDeviceType(userAgent, maxTouchPoints),
    viewportBucket: getViewportBucket(window.innerWidth),
    displayMode: getDisplayMode(),
    isStandalone: isStandalone(),
    serviceWorkerSupported: 'serviceWorker' in navigator,
    notificationPermission: getNotificationPermission(),
    observedAt: now.toISOString(),
  };
}

async function postEnvironment(properties: ClientEnvironmentProperties) {
  if (typeof fetch === 'undefined') return false;
  const response = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CLIENT_ENVIRONMENT_EVENT_NAME,
      properties,
    }),
    keepalive: true,
  });
  return response.ok;
}

export function trackPwaLifecycleEvent(
  name: Extract<
    AnalyticEventName,
    | 'pwa_prompt_available'
    | 'pwa_install_clicked'
    | 'pwa_install_accepted'
    | 'pwa_install_dismissed'
    | 'pwa_appinstalled'
    | 'pwa_launched_standalone'
  >,
  properties?: Record<string, unknown>,
  now = new Date(),
) {
  if (typeof window === 'undefined') return null;
  const key = `${PWA_EVENT_STORAGE_PREFIX}:${name}:${todayKey(now)}`;
  if (window.localStorage.getItem(key)) return null;
  const eventId = track(name, properties);
  if (eventId) {
    window.localStorage.setItem(key, '1');
  }
  return eventId;
}

export async function trackClientEnvironmentOncePerDay(now = new Date()) {
  if (typeof window === 'undefined') return;
  const key = `${ENVIRONMENT_STORAGE_PREFIX}:${todayKey(now)}`;
  if (window.localStorage.getItem(key)) return;

  const properties = collectClientEnvironment(now);
  if (!properties) return;

  if (properties.isStandalone) {
    trackPwaLifecycleEvent(
      'pwa_launched_standalone',
      { displayMode: properties.displayMode },
      now,
    );
  }

  try {
    if (await postEnvironment(properties)) {
      window.localStorage.setItem(key, '1');
    }
  } catch {
    // Best-effort analytics: failed observations are retried on a later page load.
  }
}
