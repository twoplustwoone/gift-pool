# Section

A titled, card-bounded content block whose title lives inside the container.

**Props:** `title`, `description`, `action` (a trailing control such as a ghost "See all" button), `children`, `as` (the heading element, default `h2`), `titleId` for `aria-labelledby`, `className`.

- Only the page's own H1 sits on the canvas. Section titles belong inside their section.
- Use it when content needs a boundary. For a light grouping, a heading with `background-muted` is enough.

Source: `app/components/ui/section.tsx` in twoplustwoone/gift-pool, bundled as is.
