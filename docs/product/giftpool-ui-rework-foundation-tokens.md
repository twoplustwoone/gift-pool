# UI rework foundation tokens — PR 1 appendix

**Status:** consolidated 2026-07-19. Subordinate to `docs/product/giftpool-ui-rework-handoff.md`; where this document and the handoff disagree, the handoff wins. Supersedes the 2026-07-18 standalone "Companionable Gifting retheme" spec, whose conflicts with the grilled contract are resolved here (recorded at the end).

This appendix gives PR 1 (Foundation and shell) the concrete values the handoff intentionally leaves semantic. Hex values are source of truth; they are converted to the HSL-triplet format used by `app/styles/tailwind.css` at implementation time. Token **names** are unchanged — the new palette pours into the existing variables.

## 1. Light mode

| Token                           | Value                                                | Semantic role (handoff §4)                                                                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--background`                  | `#FFF8F6`                                            | Warm near-white canvas                                                                                                                                                                                                                 |
| `--background-muted`            | `#FAEBE5`                                            | Low-emphasis grouping                                                                                                                                                                                                                  |
| `--foreground`                  | `#211A17`                                            | Warm brown-black text                                                                                                                                                                                                                  |
| `--muted`                       | `#F4E5E0`                                            | Muted surfaces                                                                                                                                                                                                                         |
| `--muted-foreground`            | `#58423D`                                            | Secondary text                                                                                                                                                                                                                         |
| `--card` / `--surface`          | `#FFF1EC`                                            | Distinct interactive objects / important state only (handoff card rule)                                                                                                                                                                |
| `--subcard`                     | `#FFFFFF`                                            | Innermost rows/pills                                                                                                                                                                                                                   |
| `--popover` / `--modal`         | `#FFFFFF`                                            | Floating surfaces                                                                                                                                                                                                                      |
| `--border` / `--surface-border` | `#DFC0B9`                                            | Dividers, section rules (sections prefer spacing/dividers over boxes)                                                                                                                                                                  |
| `--subcard-border`              | `#EEDFDA`                                            |                                                                                                                                                                                                                                        |
| `--input` / `--input-bg`        | `#FAEBE5` fill; focus lightens to white + coral ring | Filled fields, builds on the June `--input-bg` work                                                                                                                                                                                    |
| `--primary`                     | `#A73921`                                            | Primary action. This is the accepted Stitch export's primary — the "coral" of the semantic ladder is this warm terracotta family. Passes AA with white text (~7:1); the current `#FF5D5D` is ~3:1, a shipping contrast fail this fixes |
| `--primary-foreground`          | `#FFFFFF`                                            |                                                                                                                                                                                                                                        |
| `--accent-foreground`           | `#FF7A5C`                                            | Emotional emphasis / selected states. Fails AA with white text — never a text-on-fill button color; use on light surfaces with dark text or as non-text emphasis                                                                       |
| `--pool` family                 | `#006A63` (containers `#8BF1E6` / `#71D7CD`)         | Teal: privacy, supportive coordination, completion, calm secondary emphasis                                                                                                                                                            |
| `--destructive`                 | `#BA1A1A` (container `#FFDAD6`)                      | Destructive/errors only                                                                                                                                                                                                                |
| `--ring`                        | coral family                                         | Focus visibility                                                                                                                                                                                                                       |
| `--radius`                      | `0.5rem` (unchanged)                                 | Controls modest; cards medium; sheets/large groupings `rounded-xl` (1.5rem); full pills only for compact badges/segmented controls                                                                                                     |

### Semantic roles the old spec lacked (handoff §4 requires them)

| Role                                              | Light anchor                                 | Notes                                                        |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| Amber — warning, waiting, time-sensitive, blocked | `#8E4E14` (containers `#FFDCC4` / `#DE9051`) | The Stitch export's tertiary family; already warm-harmonized |
| Green — unambiguous success only                  | `#1D7A46` (container `#C9F0D8`)              | Never generic money styling; amounts are not money-green     |
| Muted neutral — disabled, historical, inactive    | `#8B716B` on `#EEDFDA`                       | From the export's outline family                             |

All roles need non-color cues alongside color (handoff accessibility contract).

## 2. Dark mode — dedicated warm tokens, not inversion

Derived from the export's inverse tokens (`inverse-surface #372F2B`, `inverse-on-surface #FDEEE8`, `inverse-primary #FFB4A3`):

- `--background` ≈ `#1A1310` deep warm brown-black (replaces cool navy).
- Surfaces step lighter and warmer with elevation: card ≈ `#241B17`, subcard/modal a step above; `--input-bg` a step lighter than card (today's relationship preserved).
- `--foreground` ≈ `#FDEEE8` warm off-white; muted foreground ≈ `#D8C2BB`.
- `--primary` flips to light coral `#FFB4A3` with dark text (`#3D0600` family) — solid terracotta fails on dark surfaces.
- Teal lightens to `#71D7CD`; destructive to `#FFB4AB` with dark text; amber to `#FFB780`; green to `#7FD8A8`.

Every token pair in both modes must pass WCAG 2.2 AA (4.5:1 body, 3:1 large text/UI) — verified during implementation, not assumed.

## 3. Progress

One semantic fill — teal (supportive coordination/completion) — thick, `rounded-full`. **No gradient fills for progress** (handoff §4 bans decorative gradient progress; the old spec's coral→teal "joy-bar" is overruled). The `--brand-gradient-*` tokens and `bg-brand-gradient` utility may remain for brand moments (logo lockups, marketing hero), re-pointed to warm values; they must not style progress or amounts. Denominator rules are the handoff's: no percentage before a concrete gift price exists; never a fundraising goal.

## 4. Typography

- **Display:** self-hosted **variable Plus Jakarta Sans** as `--font-display` (major headings, display moments), following the `nunito-font.css` self-hosting pattern.
- **Body:** **Nunito Sans** for body, navigation, controls, forms, dense operational content. PR 1 must **replace the current incomplete Nunito loading** rather than layering fonts over it (handoff §4 — this overrules the old spec's keep-Nunito shortcut).
- System fallbacks; deliberately small weight set (variable fonts help here).
- `tailwind.config.ts` gains `fontFamily.display`.
- **Sentence case everywhere** — buttons, labels, navigation, headings; no all-caps (accepted export's typography rule; sweep existing violations, e.g. the pools-list "ACTIVE" label).

## 5. Shape and elevation

- Cards represent distinct interactive objects or important state — **not every section**. Ordinary sections use spacing, `SectionHeader`-style headings, dividers, and subtle tonal grouping (`--background-muted`). The old spec's "drop all card borders app-wide" is narrowed to this rule.
- Shadows low and ambient (~4% opacity, ~20px blur).
- Elevation reads tonally: canvas → tint → white subcard (light); progressively lighter warm surfaces (dark).

## 6. Widths

Per-page width system stays as shipped (standard pages `max-w-6xl`, narrow/form pages `max-w-3xl`); the handoff's 1400px figure is the **maximum content width cap**, not a new per-page standard. QA widths per handoff §8: 390, 640, 768, 1024, 1280, 1440.

## 7. Conflicts resolved against the 2026-07-18 spec

| Old spec said                                   | Contract says                                                                            | Resolution                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| Coral→teal gradient progress "joy-bar"          | One semantic fill; no decorative gradient progress                                       | Teal single fill           |
| Drop borders on all cards/sections              | Cards for objects/state; sections use spacing/dividers/tonal grouping                    | Handoff rule               |
| Keep existing Nunito body ("swap buys nothing") | Nunito Sans; replace incomplete font loading in the foundation milestone                 | Nunito Sans, loading fixed |
| 3-PR retheme sequence                           | 7-PR rework sequence (handoff §12); this doc feeds PR 1                                  | Handoff sequence           |
| Marketing page theme-inherits only              | PR 2 (Acquisition and trust) reworks public Home properly                                | Handoff sequence           |
| IA out of scope entirely                        | Handoff defines the accepted IA (Groups canonical, no Circles, nav unchanged in concept) | Handoff IA                 |
