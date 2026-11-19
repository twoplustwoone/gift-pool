# Card

A bounded white surface for a distinct object or important state: a pool, a wishlist item, a person.

**Props:** `variant` (`default`, `interactive` for whole-card links or buttons, `elevated`), `padding` (`none | sm | md` (default) `| lg`), `asChild`. `CardContent` sets card body copy in `body-sm`. The consumer supplies the content and, for `interactive`, the focus target (`tabIndex` or `asChild` with a link).

- Not every section needs a card. Ordinary groupings use spacing, headings and tonal fills.
- `interactive` lifts on desktop hover only, so phone lists don't flash while scrolling.
- Nest rows as `subcard` with `subcard-border`, not cards in cards.

Source: `app/components/ui/card.tsx` in twoplustwoone/gift-pool, bundled as is.
