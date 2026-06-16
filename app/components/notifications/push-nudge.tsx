import { useEffect, useState } from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { useWebPush } from '#app/hooks/use-web-push.ts';
import { track } from '#app/utils/analytics.client.ts';

const DISMISS_STORAGE_KEY = 'push-nudge-dismissed';

/**
 * One-time soft-ask shown in the notification panel inviting the user to turn
 * on push. Only appears when push is available but not yet enabled
 * (status 'default') and hasn't been dismissed before. Renders nothing in
 * unsupported environments (incl. SSR / jsdom), so it's inert by default.
 */
export const PushNudge = () => {
  const push = useWebPush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(window.localStorage.getItem(DISMISS_STORAGE_KEY) === 'true');
  }, []);

  if (dismissed || push.status !== 'default') return null;

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, 'true');
    }
    setDismissed(true);
    track('push_prompt_dismissed');
  };

  return (
    <div className="space-y-2 border-b bg-muted/40 px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        Get notified about friend activity even when GiftPool isn&apos;t open.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={push.isBusy}
          onClick={() => {
            void push.subscribe();
          }}
        >
          Enable notifications
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
};
