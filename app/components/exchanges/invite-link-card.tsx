import { useState } from 'react';
import { Button } from '#app/components/ui/button.tsx';
import { Section } from '#app/components/ui/section.tsx';

// A standalone exchange has no group roster, so the link IS the roster
// (board §11). Everything below this card on the page is identical to the
// group version, including the draw footer.
export function InviteLinkCard({
  inviteUrl,
  pending,
  onGenerate,
  onReplace,
}: {
  inviteUrl: string | null;
  pending: boolean;
  onGenerate: () => void;
  onReplace: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A blocked clipboard is not an error worth a dialog — the link is on
      // screen and selectable either way.
      setCopied(false);
    }
  };

  const share = async () => {
    if (!inviteUrl || !navigator.share) return void copy();
    try {
      await navigator.share({ url: inviteUrl });
    } catch {
      // Cancelled or unsupported: nothing to say.
    }
  };

  return (
    <Section title="Invite people">
      <p className="text-sm text-muted-foreground">
        Anyone with this link can join until you draw. They&apos;ll sign in or
        make an account first.
      </p>

      {inviteUrl ? (
        <>
          <p
            className="mt-3 break-all rounded-xl border bg-muted/40 p-3 font-mono text-sm"
            data-testid="invite-link"
          >
            {inviteUrl}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={copy} disabled={pending}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={share}
              disabled={pending}
            >
              Share
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onReplace}
              disabled={pending}
            >
              New link
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A new link stops the old one working — that&apos;s how you undo
            sending it to the wrong person.
          </p>
        </>
      ) : (
        <Button
          type="button"
          className="mt-3"
          onClick={onGenerate}
          disabled={pending}
        >
          Create an invite link
        </Button>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        The link stops working after the draw.
      </p>
    </Section>
  );
}
