# Select

A Radix select: a filled trigger that matches Input, with a `popover` menu.

**Parts:** `Select` (root: `value`, `defaultValue`, `onValueChange`), `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (`value`), `SelectGroup`, `SelectLabel`, `SelectSeparator`.

- Use for one choice from about 4 to 15 options. Fewer options read better as radios or a segmented control.
- Known gap: the highlighted item uses `accent-foreground` text on `accent`, about 2.2:1 in light.

Source: `app/components/ui/select.tsx` in twoplustwoone/gift-pool, bundled as is.
