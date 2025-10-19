import { Button } from '#app/components/ui/button.tsx';

export type PwaInstallBannerProps = {
  onInstall: () => Promise<unknown> | unknown;
  onDismiss: () => void;
  isPrompting?: boolean;
};

export const PwaInstallBanner = ({
  onInstall,
  onDismiss,
  isPrompting = false,
}: PwaInstallBannerProps) => {
  return (
    <div className="border-b border-border bg-primary/10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="font-medium">
          Install GiftPool on this device for faster access and an app-like experience.
        </p>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              void onInstall();
            }}
            disabled={isPrompting}
            className="whitespace-nowrap"
          >
            {isPrompting ? 'Preparing…' : 'Install app'}
          </Button>
          <Button variant="ghost" onClick={onDismiss} className="whitespace-nowrap">
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
};
