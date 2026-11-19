# Input

The single-line text field: a 40px filled field on `input-bg` with an `input` border and a `ring` focus ring.

**Props:** every native input attribute. Set `aria-invalid` to switch the border to `input-invalid`, and point `aria-describedby` at the error message.

- Always pair with a visible `Label`.
- Errors go below the field in `text-sm text-foreground-destructive` and say how to fix it. Keep what was typed.
- Text is 16px below 640px (no iOS zoom), 14px above.

Source: `app/components/ui/input.tsx` in twoplustwoone/gift-pool, bundled as is.
