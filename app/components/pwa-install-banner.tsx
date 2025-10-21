import { useEffect, useState } from 'react';

import type {
  InstallMode,
  InstallOutcome,
} from '#app/hooks/use-pwa-install-prompt.ts';
import { Button } from '#app/components/ui/button.tsx';

export type PwaInstallBannerProps = {
  onInstall: () => Promise<InstallOutcome> | InstallOutcome;
  onDismiss: () => void;
  isPrompting?: boolean;
  installMode?: InstallMode | null;
  instructions?: string[] | null;
};

export const PwaInstallBanner = ({
  onInstall,
  onDismiss,
  isPrompting = false,
  installMode = 'prompt',
  instructions,
}: PwaInstallBannerProps) => {
  const [showManualSteps, setShowManualSteps] = useState(false);

  useEffect(() => {
    setShowManualSteps(false);
  }, [installMode]);

  return (
    <div className="border-b border-border bg-primary/10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <p className="font-medium">
            {installMode === 'manual'
              ? 'Install GiftPool from Safari to keep it handy on your Home Screen.'
              : 'Install GiftPool on this device for faster access and an app-like experience.'}
          </p>
          {installMode === 'manual' ? (
            <div className="text-muted-foreground">
              {showManualSteps ? (
                <ol className="list-decimal space-y-1 pl-5 text-xs sm:text-sm">
                  {(instructions ?? []).map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs sm:text-sm">
                  We’ll show you the steps when you tap “Show steps”.
                </p>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={async () => {
              const outcome = await onInstall();
              if (installMode === 'manual' && outcome === 'manual') {
                setShowManualSteps((previous) =>
                  instructions && instructions.length > 0 ? !previous : previous,
                );
              }
            }}
            disabled={installMode !== 'manual' && isPrompting}
            className="whitespace-nowrap"
          >
            {installMode === 'manual'
              ? showManualSteps
                ? 'Hide steps'
                : 'Show steps'
              : isPrompting
                ? 'Preparing…'
                : 'Install app'}
          </Button>
          <Button variant="ghost" onClick={onDismiss} className="whitespace-nowrap">
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
};
