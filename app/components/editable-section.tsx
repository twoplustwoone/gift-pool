import { type ReactNode, useEffect, useRef } from 'react';

import { Button } from '#app/components/ui/button.tsx';
import { Card } from '#app/components/ui/card.tsx';
import { Text } from '#app/components/ui-kit/text.tsx';
import { cn } from '#app/utils/misc.tsx';

/**
 * A card that opens in *read* mode and offers an explicit way into *edit* mode
 * (R5.1). Showing current state first makes a screen feel intentional and stops
 * accidental edits. The caller owns the `editing` state and supplies both the
 * read view and the edit form (which keeps its own Save/Cancel controls).
 */
export function EditableSection({
  title,
  description,
  editing,
  onEdit,
  editLabel = 'Edit',
  read,
  children,
  className,
}: {
  title: string;
  description?: string;
  editing: boolean;
  onEdit: () => void;
  editLabel?: string;
  /** Read-mode content (current values). */
  read: ReactNode;
  /** Edit-mode content (the form). */
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card padding="lg" className={cn('flex flex-col gap-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Text as="h2" size="lg" weight="semibold" className="text-foreground">
            {title}
          </Text>
          {description ? (
            <Text size="xs" className="text-muted-foreground">
              {description}
            </Text>
          ) : null}
        </div>
        {editing ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onEdit}
          >
            {editLabel}
          </Button>
        )}
      </div>
      {editing ? children : read}
    </Card>
  );
}

/** A labelled current value for read mode. */
export function ReadField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <Text size="xs" weight="medium" className="text-muted-foreground">
        {label}
      </Text>
      <Text size="sm" className="text-foreground">
        {value}
      </Text>
    </div>
  );
}

/**
 * Leaves edit mode once a submit completes successfully. Tracks the in-flight
 * transition so a stale `success` from an earlier save can't immediately kick
 * the user back out of a freshly reopened editor.
 */
export function useExitOnSubmitSuccess({
  state,
  success,
  onExit,
}: {
  state: 'idle' | 'loading' | 'submitting';
  success: boolean;
  onExit: () => void;
}) {
  const wasSubmitting = useRef(false);
  useEffect(() => {
    if (state !== 'idle') {
      wasSubmitting.current = true;
      return;
    }
    if (wasSubmitting.current) {
      wasSubmitting.current = false;
      if (success) onExit();
    }
  }, [state, success, onExit]);
}
