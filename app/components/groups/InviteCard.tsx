import React from 'react';
import { toast } from 'sonner';
import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Icon } from '#app/components/ui/icon.tsx';
import { Input } from '#app/components/ui/input.tsx';

export const InviteCard = ({
  url,
  onCopy,
  footer,
}: {
  url: string | null;
  onCopy?: () => void;
  footer?: React.ReactNode;
}) => {
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
    onCopy?.();
  };
  return (
    <Card padding="lg">
      <div className="mb-2 font-semibold">Invite</div>
      {url ? (
        <div className="flex items-center gap-2">
          <Input
            readOnly
            aria-label="Invite link"
            value={url}
            onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
          />
          <Button size="sm" variant="secondary" aria-label="Copy invite link" onClick={copy}>
            <Icon name="copy" />
          </Button>
        </div>
      ) : (
        <div className="text-sm">Use the Invite button in the header to create a link.</div>
      )}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </Card>
  );
};
