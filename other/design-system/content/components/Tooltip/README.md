# Tooltip

A small Radix tooltip for a supplementary hint on hover or focus.

**Parts:** `TooltipProvider` › `Tooltip` › `TooltipTrigger` (`asChild` on a focusable element) + `TooltipContent`.

- Never hide essential information in a tooltip: touch users can't hover.
- `VisibilityHint` in the app wraps this for "Hidden due to privacy settings".

Source: `app/components/ui/tooltip.tsx` in twoplustwoone/gift-pool, bundled as is.
