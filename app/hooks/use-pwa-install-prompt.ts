import { useCallback, useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
};

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'error';

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  const mediaQueryList = window.matchMedia?.('(display-mode: standalone)');
  const navigatorStandalone = (window.navigator as Navigator & {
    standalone?: boolean;
  }).standalone;
  return Boolean(mediaQueryList?.matches || navigatorStandalone);
};

export const usePwaInstallPrompt = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateInstallationState = () => {
      const nextInstalled = isStandalone();
      setIsInstalled(nextInstalled);
      if (nextInstalled) {
        setInstallEvent(null);
      }
    };

    updateInstallationState();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setIsDismissed(false);
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
    dismissBanner,
    isInstallable: Boolean(installEvent) && !isInstalled && !isDismissed,
    isInstalled,
    isPrompting,
    promptInstall,
  };
};

export type UsePwaInstallPromptReturn = ReturnType<typeof usePwaInstallPrompt>;
