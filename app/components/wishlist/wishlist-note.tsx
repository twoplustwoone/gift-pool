import { useState, useRef, useEffect } from 'react';
import { useFetcher } from 'react-router';
import { Icon } from '#app/components/ui/icon.tsx';
import { WISHLIST_NOTE_MAX_LENGTH } from '#app/utils/user-validation.ts';

type WishlistNoteProps = {
  note: string | null;
  isOwner: boolean;
};

// Renders as inline content within the consolidated WishlistHeader block —
// no border/background/PageShell wrapper of its own. Prior to the header
// consolidation this rendered as a fourth full-width bar; it's now a quiet
// subline under the title, styled as the owner's words rather than another
// toolbar (a small vertical accent rule, no box).
export const WishlistNote = ({ note, isOwner }: WishlistNoteProps) => {
  const fetcher = useFetcher();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Optimistic value: while the fetcher is submitting, show the draft
  const isSubmitting = fetcher.state !== 'idle';
  const optimisticNote =
    isSubmitting && fetcher.formData
      ? ((fetcher.formData.get('note') as string | null) ?? '')
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
    void fetcher.submit(formData, {
      method: 'POST',
      action: '/wishlist?index',
    });
    setIsEditing(false);
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  }

  const charsLeft = WISHLIST_NOTE_MAX_LENGTH - draft.length;
  const isOverLimit = charsLeft < 0;

  // ── Edit mode ────────────────────────────────────────────────────────────
  // A bordered subcard box — grows the header block in place, no new bar.
  if (isEditing) {
    return (
      <div className="flex max-w-[36rem] flex-col gap-2 rounded-xl border border-subcard-border bg-subcard p-3 shadow-sm">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Add a message for people viewing your wishlist…"
          rows={2}
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
    );
  }

  // ── Owner with a note ────────────────────────────────────────────────────
  // Content, not chrome: a quiet coral rule + text, pencil low-opacity but
  // always visible (not hover-only — there's no hover on touch).
  if (isOwner && displayNote) {
    return (
      <div className="flex max-w-[40rem] items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 w-[3px] shrink-0 self-stretch rounded-full bg-primary/50"
        />
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {displayNote}
        </p>
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit wishlist message"
          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-60 transition hover:bg-muted hover:opacity-100 focus:opacity-100"
        >
          <Icon name="pencil-1" className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Owner with no note — prompt to add ───────────────────────────────────
  // An inline text-button, not a full-width dashed field — no toolbar
  // silhouette when there's nothing to show yet.
  if (isOwner && !displayNote) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        <Icon name="pencil-1" className="h-3.5 w-3.5 shrink-0" />
        Add a message to your wishlist…
      </button>
    );
  }

  // ── Viewer — show note only if it exists ─────────────────────────────────
  if (!isOwner && displayNote) {
    return (
      <div className="flex max-w-[40rem] items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 w-[3px] shrink-0 self-stretch rounded-full bg-primary/50"
        />
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {displayNote}
        </p>
      </div>
    );
  }

  return null;
};
