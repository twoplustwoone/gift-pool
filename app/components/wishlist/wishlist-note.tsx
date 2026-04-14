import { useState, useRef, useEffect } from 'react';
import { useFetcher } from 'react-router';
import { Icon } from '#app/components/ui/icon.tsx';
import { WISHLIST_NOTE_MAX_LENGTH } from '#app/utils/user-validation.ts';

type WishlistNoteProps = {
  note: string | null;
  isOwner: boolean;
};

export const WishlistNote = ({ note, isOwner }: WishlistNoteProps) => {
  const fetcher = useFetcher();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Optimistic value: while the fetcher is submitting, show the draft
  const isSubmitting = fetcher.state !== 'idle';
  const optimisticNote =
    isSubmitting && fetcher.formData
      ? (fetcher.formData.get('note') as string | null) ?? ''
      : note;

  const displayNote = isEditing ? draft : (optimisticNote ?? note ?? '');

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at end
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  function startEditing() {
    setDraft(note ?? '');
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(note ?? '');
    setIsEditing(false);
  }

  function save() {
    const formData = new FormData();
    formData.set('intent', 'update-note');
    formData.set('note', draft.trim());
    fetcher.submit(formData, { method: 'POST', action: '/wishlist' });
    setIsEditing(false);
  }

  const charsLeft = WISHLIST_NOTE_MAX_LENGTH - draft.length;
  const isOverLimit = charsLeft < 0;

  // ── Edit mode ────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="border-b bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a message for people viewing your wishlist…"
              rows={3}
              className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <span
                className={`text-xs tabular-nums ${
                  isOverLimit
                    ? 'font-medium text-destructive'
                    : 'text-muted-foreground'
                }`}
              >
                {charsLeft < 50 ? `${charsLeft} left` : ''}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={isOverLimit}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Owner with a note ────────────────────────────────────────────────────
  if (isOwner && displayNote) {
    return (
      <div className="border-b bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
          <div className="group relative rounded-xl border border-border bg-muted/40 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {displayNote}
            </p>
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit wishlist message"
              className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100"
            >
              <Icon name="pencil-1" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Owner with no note — prompt to add ───────────────────────────────────
  if (isOwner && !displayNote) {
    return (
      <div className="border-b bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={startEditing}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground transition hover:border-border hover:text-foreground"
          >
            <Icon name="pencil-1" className="h-4 w-4 shrink-0" />
            Add a message to your wishlist…
          </button>
        </div>
      </div>
    );
  }

  // ── Viewer — show note only if it exists ─────────────────────────────────
  if (!isOwner && displayNote) {
    return (
      <div className="border-b bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {displayNote}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
