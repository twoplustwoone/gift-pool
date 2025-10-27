import { Link } from '@remix-run/react';
import { useMemo } from 'react';

import { Button } from '#app/components/ui/button.tsx';
import {
  type InstallCapability,
  type InstallOutcome,
  type ManualInstallPlatform,
} from '#app/hooks/use-pwa-install-prompt.ts';

export type PwaInstallBannerProps = {
  capability: InstallCapability;
  manualHref?: string;
  manualPlatform?: ManualInstallPlatform | null;
  onDismiss: () => void;
  onPromptInstall?: () => Promise<InstallOutcome> | InstallOutcome;
  isPrompting?: boolean;
};

export const PwaInstallBanner = ({
  capability,
  manualHref,
  manualPlatform,
  onDismiss,
  onPromptInstall,
  isPrompting = false,
}: PwaInstallBannerProps) => {
  const message = useMemo(() => {
    if (capability === 'manual') {
      if (manualPlatform === 'ios-chrome') {
        return 'Add GiftPool to your Home Screen from Chrome so it behaves like an app.';
      }
      return 'Add GiftPool to your Home Screen from Safari so it behaves like an app.';
    }
    if (capability === 'unsupported') {
      return 'GiftPool works best when installed, but this browser does not expose an install option.';
    }
    return 'Install GiftPool on this device for faster access and an app-like experience.';
  }, [capability, manualPlatform]);

  const detail = useMemo(() => {
    if (capability === 'manual') {
      if (manualPlatform === 'ios-chrome') {
        return 'Follow the Chrome on iOS steps to add GiftPool from the share menu at the top.';
      }
      return 'Follow the guided steps to add GiftPool from the iOS share sheet.';
    }
    if (capability === 'unsupported') {
      return 'Try visiting on a supported browser or device if you want an app-like shortcut.';
    }
    return null;
  }, [capability, manualPlatform]);

  return (
    <div className="border-b border-border bg-primary/10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <p className="font-medium">{message}</p>
          {detail ? (
            <p className="text-xs text-muted-foreground sm:text-sm">{detail}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {capability === 'manual' && manualHref ? (
            <Button asChild className="whitespace-nowrap">
              <Link to={manualHref}>View instructions</Link>
            </Button>
          ) : null}
          {capability === 'prompt' ? (
            <Button
              onClick={() => {
                void onPromptInstall?.();
              }}
              disabled={isPrompting}
              className="whitespace-nowrap"
            >
              {isPrompting ? 'Preparing…' : 'Install app'}
            </Button>
          ) : null}
          {capability === 'unsupported' ? (
            <Button disabled variant="outline" className="whitespace-nowrap">
              Not supported
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onDismiss} className="whitespace-nowrap">
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
};
