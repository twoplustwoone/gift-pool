# ResponsiveDialog

The only modal: a centered dialog from 640px and a bottom sheet below it, with the same API either way.

**Parts:** `ResponsiveDialog` (`open`, `defaultOpen`, `onOpenChange`), `ResponsiveDialogTrigger`, `ResponsiveDialogContent`, `ResponsiveDialogHeader`, `ResponsiveDialogTitle`, `ResponsiveDialogDescription`, `ResponsiveDialogFooter`, `ResponsiveDialogClose`.

- Never use the raw Dialog or MobileBottomSheet primitives for a modal. A centered modal on a phone is a bug.
- Always give it a title. Confirmations name the consequence: "Leave Book club?" with what changes.
- Order the footer as safe action first, then the committing action.

Source: `app/components/ui/responsive-dialog.tsx` in twoplustwoone/gift-pool, bundled as is.
