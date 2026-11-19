# Button

The pill-shaped action button for every click that does something.

**Use** `default` (terracotta) for the one primary action in a view, `secondary` or `outline` for alternatives, `ghost` for low-emphasis actions in rows and headers, `link` for inline navigation, and `destructive` only for destructive actions like leaving or deleting.

**Props:** `variant` (`default | secondary | outline | ghost | link | destructive`), `size` (`default` 40px, `xs` 32, `sm` 36, `lg` 44, `wide`, `pill`, `icon` 32px square with `radius-xl`), `asChild` to render the styles on a child link, plus every native button attribute. The consumer provides the label as children.

- Use verb-first, sentence-case labels: "Start a pool", not "Pool".
- Keep one `default` button per view. Two terracotta pills compete.
- Hover changes only on fine pointers. Press scales to 0.98 when motion is allowed.
- Disabled is 50% opacity. If a stage blocks the action, add a reason nearby.

Source: `app/components/ui/button.tsx` in twoplustwoone/gift-pool, bundled as is.
