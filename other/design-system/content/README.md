Gift Pool is a wishlist and group-gifting app. People keep wishlists, belong to groups, and coordinate a gift for someone in a **pool** that stays hidden from that person. The interface should feel joyful, familiar and quietly personal: warmth comes from specific copy, warm color, real avatars and gift images, and tactile feedback. It should never constantly sell, celebrate itself, or manufacture urgency.

One system has three expressions. Use the fullest warmth on the **companionable consumer** surfaces (Home, people, Groups, Pools, Friends, Wishlist). Use the same tokens with less decoration and more clarity on **quiet trust** surfaces (marketing, invites, sign-in, legal). Use denser, more neutral composition on **calm operations** surfaces (settings, admin).

## Content fundamentals

- **Talk to the person as "you".** "Your wishlist", "Your notes · private", "What you share with this group. Your contribution stays private to you." Use first person only for things the person owns in navigation.
- **Sentence case everywhere**: buttons, labels, navigation, headings. Never all caps, never Title Case. Write "Start a pool", "Leave group", "Group settings".
- **Verb-first actions** that name the outcome: _Start a pool_, _Suggest an idea_, _Copy invite link_, _Choose the gift_, _Not this time_.
- **Say what happened and the next safe step.** "Too many requests. Please try again soon." Explain rate limits without shaming, and keep the user's input when something fails.
- **Use the canonical nouns.** `Group` is the functional noun (never "Circle" in UI). A `Pool` is an occasion-specific, recipient-concealed coordination effort, not a fund. Pool stages are **Collect ideas → Choose the gift → Buy the gift → Deliver it → Complete**, with **Cancelled** separate. `Gift Price` is a product cost, never a goal. `Contribution Limit` is one person's private ceiling. `Received` means the purchaser confirmed a share outside Gift Pool.
- **Never imply Gift Pool holds money.** Avoid _raised, funded, collected, gathered, pledge, campaign_. Show no percentage before a concrete gift price exists, and never present a fundraising goal.
- **Private things say so.** Label author-private notes "Your notes · private". Name a secrecy boundary plainly: "Hidden from Maya".
- **Emoji are rare.** A single 🎁 in an invite title is the ceiling. Emoji are never icons or controls.

## Visual foundations

### Color

Colors are semantic roles. Build with tokens only, never literal hex.

- **Terracotta `primary` / `gift`** is the primary action, checked state and links. White `primary-foreground` sits on it in light (6.5:1). In dark it flips to light coral with dark text.
- **Coral `accent-foreground`** is emotional emphasis and selected marks on `accent`. It's decorative: never use it for body text or text on a fill.
- **Teal `pool`** means privacy, supportive coordination and completion: SecrecyNote, the pool Badge, the "Collect ideas" stage, and progress. Progress is one solid teal fill, thick and fully rounded. **Never a gradient.**
- **Warm neutrals** carry everything else. `background` is the canvas, `background-muted` groups an ordinary section tonally, `card` and `subcard` are white surfaces, `muted` is a quiet fill, and `muted-foreground` is secondary text.
- **Red `destructive`** is for destructive actions and errors only. Error text is `foreground-destructive`.
- **Amber `warning` on `warning-muted`** means waiting, time-sensitive or blocked. It stays the same color in every palette on purpose.
- **Green `success` on `success-muted`** means unambiguous success only. Never color an amount green because it's money.
- **Muted `muted-foreground` on `muted`** marks disabled, historical or inactive things ("Complete", "Cancelled").
- Pair every color with a word or icon. Two different states may share amber because the label tells them apart.
- `bg-brand-gradient` (`brand-gradient-start` → `brand-gradient-end`, 135°) is for brand moments only: logo lockups and the marketing hero. Never use it on progress, amounts or buttons.
- Dark mode is a dedicated warm, low-glare palette, not an inversion. Accents get lighter and take dark text on top.

### Type

- **Plus Jakarta Sans** (`--font-display`) for display and major headings. The `h1`, `h2` and `h3` elements get it automatically; anything else opts in with `font-display`.
- **Nunito Sans** (`--font-sans`) for everything else: body, navigation, controls, forms, dense tables.
- Both are self-hosted variable fonts. Use a small set of weights: 400 body, 500 buttons, 600 titles and pills, 700 headings and labels, 300 for the "gift" half of the wordmark.
- The working scale is Tailwind's: `app-sm` (14px) is the workhorse for body, buttons and descriptions; `app-xs` semibold (12px) for pills and meta; `app-lg` semibold (18px) for section titles. Use `h5` (24px) for the one page title on an app page, and `h1`/`h2` for marketing and invite heroes.
- Field values are 16px (`app-base`) below 640px so iOS doesn't zoom, and 14px above.

### Shape, surfaces and elevation

- **Cards are for distinct interactive objects or important state, not every section.** An ordinary section uses spacing, a heading, dividers or a `background-muted` tint. Use `Section` when content needs a bounded container with its own title.
- Elevation reads tonally: `background` canvas → `surface` / `background-muted` tint → white `card` and `subcard`. In dark mode, surfaces get lighter as they rise.
- Radii: controls are modest (`radius-md` 6px fields, `radius-sm` 4px checkboxes), cards and sections are `radius-xl` (12px), and sheets and large feature groupings are `radius-2xl` (16px). `radius-full` is for buttons, badges, stage pills, avatars and switches.
- Shadows stay low and ambient. Cards rest on `shadow-sm`; an interactive card lifts to `shadow-md` on desktop hover only.
- Borders are hairline `border`. Fields are told apart by their `input-bg` fill more than their `input` border.

### Layout

- Standard pages are capped at `width-standard` (72rem, `max-w-6xl`), and settings, forms and detail pages at `width-narrow` (48rem, `max-w-3xl`). Admin is uncapped and dense. Nothing exceeds `width-max` (1400px).
- **Below 640px every modal is a bottom sheet.** At 640px and up, centered dialogs are allowed. Always use `ResponsiveDialog`.
- Bottom tab bar below 768px, top navigation from 768px. Contextual rails and multi-column layouts start at 1024px.
- The app has exactly one scroll area. Pages never declare their own scroller or use viewport-height units.
- Primary mobile controls need a 44×44px practical touch target (Switch is built that way).
- QA at 390, 640, 768, 1024, 1280 and 1440px, in light and dark.

### Motion and states

- **Press:** buttons scale to 0.98 and dim slightly (100ms ease-out), under `motion-safe` only.
- **Hover:** desktop and fine pointers only. `primary` drops to 80%, ghost and outline pick up `accent`, interactive cards gain `muted` and `shadow-md`. Touch devices never get a stuck hover.
- **Focus:** a 2px `ring` with a 2px offset on every interactive control.
- **Disabled:** 50% opacity, no pointer events. If someone would reasonably expect an action that timing or stage blocks, keep it visible and disabled with a specific reason. Otherwise hide it.
- **Pending:** inline labels such as "Saving…" or "Choosing…" via `StatusButton`, keeping context and blocking a double submit.
- **Loading:** a local `Skeleton` where the layout is known. No global spinners.
- **Empty:** one purposeful next step (`EmptyState`). "All caught up" and no-result states stay quiet.
- **Celebration** is reserved for five moments: first wishlist item, pool created, gift chosen, gift delivered, outcome recorded. Each one is one-time, non-blocking and has a reduced-motion equivalent.

### Imagery

Only domain imagery: avatars, and wishlist, idea, chosen-gift and product images. Every layout must still read well when an image is missing, loading or broken. A missing image is ordinary content, not an error. Small expressive icons are welcome. No mascots, scenes or stock photography.

## Iconography

- **Lucide** is the main icon set, used through `react-icons/lu` (`LuEyeOff`, `LuCalendar`, …) and in a few places `lucide-react`. Stroke icons are 24px on a 2px stroke, usually rendered at `h-4 w-4` beside text and colored with `currentColor` from the surrounding text token.
- A small **Radix Icons** sprite (the Icons asset group; `Icon name="check"` in code) covers utility glyphs like check, cross, chevrons, update and copy. These are 15px fill icons.
- Icons accompany a word unless the control has an `aria-label`. Decorative icons get `aria-hidden`.
- Never draw custom SVG icons, and never use emoji as icons.

## Brand mark

The mark (`assets/Logos/logo.svg`) is a gold gift box with a cream ribbon on a coral-to-red gradient heart. It's a full-color illustration with its own fixed colors that don't follow the theme, so it reads the same on light and dark. Set it at 32px beside a live-text wordmark: **gift** in `font-light` `gift`, then **pool** in `font-bold` `pool`, both at `body-md`. In the app the halves nudge apart on hover. Never redraw the mark, and never replace the live wordmark with an image. The old coral/teal `logo-with-text.svg` predates the current palette and isn't used.

## Using this system

Load `tokens.css`, then `components/bundle.css`, then React 18 and `components/bundle.js`, which defines `window.GiftPool`. Switch themes with `data-theme="light"` or `data-theme="dark"` on `<html>`. The components are the production `app/components/ui` code, so their props match the app.
