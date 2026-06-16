// Shared PWA environment detection used by both the install prompt
// (`use-pwa-install-prompt.ts`) and the Web Push opt-in (`use-web-push.ts`).

export type ManualInstallPlatform = 'ios-safari' | 'ios-chrome';

/** True when the app is running as an installed PWA (home-screen / standalone). */
export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const mediaQueryList = window.matchMedia?.('(display-mode: standalone)');
  const navigatorStandalone = (
    window.navigator as Navigator & {
      standalone?: boolean;
    }
  ).standalone;
  return Boolean(mediaQueryList?.matches || navigatorStandalone);
};

/** Detect iOS browsers that require a manual "Add to Home Screen" flow. */
export const detectManualInstallPlatform = (): ManualInstallPlatform | null => {
  if (typeof window === 'undefined') return null;
  if (isStandalone()) return null;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  if (!isIos) return null;

  if (userAgent.includes('crios')) {
    return 'ios-chrome';
  }

  const isSafari =
    userAgent.includes('safari') &&
    !userAgent.includes('fxios') &&
    !userAgent.includes('edgios') &&
    !userAgent.includes('opios');

  if (isSafari) {
    return 'ios-safari';
  }

  return null;
};

/** True for any iOS browser, regardless of install/standalone state. */
export const isIos = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
};
