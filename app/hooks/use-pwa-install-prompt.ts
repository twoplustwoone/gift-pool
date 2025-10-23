import { useCallback, useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
};

export type InstallOutcome =
  | 'accepted'
  | 'dismissed'
  | 'unavailable'
  | 'error'
  | 'manual';
export type InstallCapability = 'prompt' | 'manual' | 'unsupported';

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  const mediaQueryList = window.matchMedia?.('(display-mode: standalone)');
  const navigatorStandalone = (window.navigator as Navigator & {
    standalone?: boolean;
  }).standalone;
  return Boolean(mediaQueryList?.matches || navigatorStandalone);
};

const detectManualInstallPlatform = (): 'ios' | null => {
  if (typeof window === 'undefined') return null;
  if (isStandalone()) return null;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isStandaloneCapableSafari =
    isIos &&
    userAgent.includes('safari') &&
    !userAgent.includes('crios') &&
    !userAgent.includes('fxios') &&
    !userAgent.includes('chrome') &&
    !userAgent.includes('edgios') &&
    !userAgent.includes('opios');

  if (!isStandaloneCapableSafari) return null;

  return 'ios';
};

export const usePwaInstallPrompt = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const [manualPlatform, setManualPlatform] = useState<'ios' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateInstallationState = () => {
      const nextInstalled = isStandalone();
      setIsInstalled(nextInstalled);
      if (nextInstalled) {
        setInstallEvent(null);
        setManualPlatform(null);
      }
    };

    updateInstallationState();

    const platform = detectManualInstallPlatform();
    setManualPlatform(platform);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setIsDismissed(false);
      setManualPlatform(null);
    };

    const handleAppInstalled = () => {
      updateInstallationState();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const mediaQueryList = window.matchMedia?.('(display-mode: standalone)');
    const handleMediaQueryChange = () => {
      updateInstallationState();
    };

    if (mediaQueryList) {
      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', handleMediaQueryChange);
      } else if (typeof mediaQueryList.addListener === 'function') {
        mediaQueryList.addListener(handleMediaQueryChange);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQueryList) {
        if (typeof mediaQueryList.removeEventListener === 'function') {
          mediaQueryList.removeEventListener('change', handleMediaQueryChange);
        } else if (typeof mediaQueryList.removeListener === 'function') {
          mediaQueryList.removeListener(handleMediaQueryChange);
        }
      }
    };
  }, []);

  const capability = useMemo<InstallCapability>(() => {
    if (installEvent) return 'prompt';
    if (manualPlatform) return 'manual';
    return 'unsupported';
  }, [installEvent, manualPlatform]);

  const shouldShowBanner = useMemo(() => {
    if (isInstalled || isDismissed) return false;
    return true;
  }, [isDismissed, isInstalled]);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!installEvent) return 'unavailable';

    setIsPrompting(true);
    try {
      await installEvent.prompt();
      const choiceResult = await installEvent.userChoice;
      setInstallEvent(null);
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        return 'accepted';
      }
      setIsDismissed(true);
      return 'dismissed';
    } catch (error) {
      console.error('Failed to prompt for PWA installation', error);
      setInstallEvent(null);
      return 'error';
    } finally {
      setIsPrompting(false);
    }
  }, [installEvent]);

  const dismissBanner = useCallback(() => {
    setIsDismissed(true);
  }, []);

  return {
    capability,
    dismissBanner,
    isInstalled,
    isPrompting: capability === 'prompt' ? isPrompting : false,
    manualPlatform,
    promptInstall,
    shouldShowBanner,
  };
};

export type UsePwaInstallPromptReturn = ReturnType<typeof usePwaInstallPrompt>;
