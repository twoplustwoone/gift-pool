import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  detectManualInstallPlatform,
  isStandalone,
  type ManualInstallPlatform,
} from '#app/utils/pwa.ts';
import { trackPwaLifecycleEvent } from '#app/utils/client-environment.ts';

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
export type { ManualInstallPlatform };
export type InstallCapability = 'prompt' | 'manual' | 'unsupported';

export const usePwaInstallPrompt = () => {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const [manualPlatform, setManualPlatform] =
    useState<ManualInstallPlatform | null>(null);

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
      setManualPlatform(null);
      trackPwaLifecycleEvent('pwa_prompt_available');
    };

    const handleAppInstalled = () => {
      updateInstallationState();
      trackPwaLifecycleEvent('pwa_appinstalled');
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
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
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

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!installEvent) return 'unavailable';

    setIsPrompting(true);
    try {
      trackPwaLifecycleEvent('pwa_install_clicked');
      await installEvent.prompt();
      const choiceResult = await installEvent.userChoice;
      setInstallEvent(null);
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        trackPwaLifecycleEvent('pwa_install_accepted');
        return 'accepted';
      }
      trackPwaLifecycleEvent('pwa_install_dismissed');
      return 'dismissed';
    } catch (error) {
      console.error('Failed to prompt for PWA installation', error);
      setInstallEvent(null);
      return 'error';
    } finally {
      setIsPrompting(false);
    }
  }, [installEvent]);

  return {
    capability,
    isInstalled,
    isPrompting: capability === 'prompt' ? isPrompting : false,
    manualPlatform,
    promptInstall,
  };
};

export type UsePwaInstallPromptReturn = ReturnType<typeof usePwaInstallPrompt>;
