// Usage notes and scales for the Gift Pool Design System artifact.
// Colour values come from app/styles/tailwind.css; build.ts fails when a
// colour token there has no note here, or a note names a token that is gone.

export type TypeStyle = {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  usage: string;
  sample?: string;
};
export type TypeGroup = {
  name: string;
  family: 'sans' | 'display';
  styles: TypeStyle[];
};
export type LengthToken = { name: string; value: string; usage: string };

export const colorUsage: Record<string, string> = {
  'foreground-destructive':
    'Error text on `background` and `card`: field errors, destructive copy. Not a fill.',
  background:
    'Page canvas. The space between sections, never a surface content sits on.',
  'background-muted':
    'Low-emphasis tonal grouping: an ordinary section set apart without a card.',
  foreground:
    'Body text and headings on `background`, `card`, `muted`, `subcard` and `modal`.',
  muted:
    'Quiet fills: default badges, system labels, skeletons, inactive pills.',
  'muted-foreground':
    'Secondary text (descriptions, meta, timestamps) on `background`, `card` and `muted`.',
  popover: 'Floating surfaces: select and dropdown menus, tooltips.',
  'popover-foreground': 'Text on `popover`.',
  card: 'Cards and sections: distinct interactive objects or important state. Same value as `subcard`.',
  'card-foreground': 'Text on `card`.',
  border:
    'Hairline dividers and card edges (cards use it at 60% in `Section`). Decorative, not a control boundary.',
  input:
    'Text-field and outline-button borders. Low contrast by design (1.4 to 1.7:1 light, 1.1 to 1.2:1 dark): fields read by their `input-bg` fill, which does not meet 3:1 either. A known source gap.',
  'input-invalid':
    'Border of a field with aria-invalid. Always paired with an error message in `foreground-destructive`.',
  'input-bg':
    'Text-field fill, recessed against a white `card`. Same value as `muted`.',
  primary:
    'Terracotta: the primary action fill (default Button), checked Switch and Checkbox, link text on `background`.',
  'primary-foreground': 'Text and icons on `primary`.',
  secondary: 'Secondary Button fill.',
  'secondary-foreground': 'Text on `secondary`.',
  accent: 'Hover and press fill for ghost and outline buttons and menu items.',
  'accent-foreground':
    'Vivid coral emphasis: hover text on `accent`, selected marks, decoration. Not for body text (about 2.3:1 on `accent` in light).',
  destructive: 'Destructive Button fill. Destructive actions and errors only.',
  'destructive-foreground': 'Text on `destructive`.',
  success:
    'Unambiguous success only (a decision made, a confirmed step). Text on `success-muted`. Never money styling. Light pair is 4.18:1, short of 4.5:1 for 12px text: a known source gap (dark 7.7:1).',
  'success-foreground': 'Text on a solid `success` fill.',
  'success-muted':
    'Success tint behind `success` text, e.g. the "Buy the gift" stage pill.',
  warning:
    'Amber: waiting, time-sensitive or blocked. Text on `warning-muted`. Same in every palette by design.',
  'warning-foreground': 'Text on a solid `warning` fill.',
  'warning-muted':
    'Warning tint behind `warning` text, e.g. the "Choose the gift" and "Deliver it" stage pills.',
  ring: 'Focus ring: 2px, offset 2px, on every interactive control. Light: 2.4:1 on `background`, 2.6:1 on `card`, short of the 3:1 floor for focus indicators; dark 5.9:1+. A known source gap.',
  surface: 'Page header band and tinted panels: one step above `background`.',
  'surface-foreground': 'Text on `surface`.',
  'surface-border': 'Edge of a `surface` panel.',
  subcard: 'Innermost rows and pills inside a card or section.',
  'subcard-foreground': 'Text on `subcard`.',
  'subcard-border': 'Edge of a `subcard` row.',
  modal: 'Dialog and bottom-sheet surface.',
  'modal-border': 'Edge of a `modal`.',
  scrim: 'Overlay behind dialogs and sheets.',
  gift: 'Brand "gift" hue, equal to `primary`. The light "gift" half of the wordmark and brand moments.',
  'gift-foreground': 'Text on a `gift` fill.',
  pool: 'Teal: privacy, coordination, completion. The bold "pool" half of the wordmark, SecrecyNote, the pool Badge, the "Collect ideas" stage pill (text on a 15% `pool` tint), progress fills.',
  'pool-foreground': 'Text on a solid `pool` fill.',
  'pool-badge-foreground': 'Text on the solid pool Badge.',
  'brand-gradient-start':
    'Start of the 135° brand gradient (`bg-brand-gradient`). Brand moments only: logo lockups, marketing hero.',
  'brand-gradient-end':
    'End of the brand gradient. Never on progress bars or amounts.',
};

const UNUSED = ' Defined in the theme, unused in the app as of Nov 2026.';

export const typeGroups: TypeGroup[] = [
  {
    name: 'Headings',
    family: 'display',
    styles: [
      {
        name: 'mega',
        fontSize: '5rem',
        lineHeight: '5.25rem',
        fontWeight: 700,
        usage: '`text-mega`.' + UNUSED,
      },
      {
        name: 'h1',
        fontSize: '3.5rem',
        lineHeight: '3.875rem',
        fontWeight: 700,
        usage: '`text-h1`: marketing and invite hero headlines.',
        sample: 'Group gifting, without the awkward money chat',
      },
      {
        name: 'h2',
        fontSize: '2.5rem',
        lineHeight: '3rem',
        fontWeight: 700,
        usage: '`text-h2`: marketing section headlines.',
        sample: 'Everyone chips in what they can',
      },
      {
        name: 'h3',
        fontSize: '2rem',
        lineHeight: '2.25rem',
        fontWeight: 700,
        usage: '`text-h3`: large display moments.',
        sample: 'Pick the gift together',
      },
      {
        name: 'h4',
        fontSize: '1.75rem',
        lineHeight: '2.25rem',
        fontWeight: 700,
        usage: '`text-h4`.' + UNUSED,
      },
      {
        name: 'h5',
        fontSize: '1.5rem',
        lineHeight: '2rem',
        fontWeight: 700,
        usage: '`text-h5`: the page title (the one H1 on an app page).',
        sample: "Maya's birthday",
      },
      {
        name: 'h6',
        fontSize: '1rem',
        lineHeight: '1.25rem',
        fontWeight: 700,
        usage: '`text-h6`.' + UNUSED,
      },
    ],
  },
  {
    name: 'App text',
    family: 'sans',
    styles: [
      {
        name: 'app-2xl',
        fontSize: '1.5rem',
        lineHeight: '2rem',
        fontWeight: 700,
        usage:
          '`text-2xl`: a page heading in denser surfaces (settings, admin).',
        sample: 'Notifications',
      },
      {
        name: 'app-xl',
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
        fontWeight: 600,
        usage: '`text-xl`: dialog titles, large section heads.',
        sample: 'Start a pool',
      },
      {
        name: 'app-lg',
        fontSize: '1.125rem',
        lineHeight: '1.75rem',
        fontWeight: 600,
        usage: '`text-lg font-semibold`: section titles (`Section`).',
        sample: 'Upcoming occasions',
      },
      {
        name: 'app-base',
        fontSize: '1rem',
        lineHeight: '1.5rem',
        fontWeight: 400,
        usage:
          '`text-base`: field values on phones (16px stops iOS zoom), long-form copy.',
        sample: 'Everyone pays what they are comfortable with.',
      },
      {
        name: 'app-sm',
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
        fontWeight: 400,
        usage:
          '`text-sm`: the workhorse. Body copy, buttons (`font-medium`), descriptions, field values at 640px+.',
        sample: 'Ideas stay hidden from Maya until the gift is delivered.',
      },
      {
        name: 'app-label',
        fontSize: '0.875rem',
        lineHeight: '1',
        fontWeight: 700,
        usage: '`Label`: form labels, bold with no extra leading.',
        sample: 'Gift price',
      },
      {
        name: 'app-xs',
        fontSize: '0.75rem',
        lineHeight: '1rem',
        fontWeight: 600,
        usage: '`text-xs font-semibold`: badges, stage pills, meta.',
        sample: 'Collect ideas',
      },
      {
        name: 'app-system',
        fontSize: '10px',
        lineHeight: '1rem',
        fontWeight: 500,
        usage:
          '`SystemLabel`: system annotations (you, owner) that must not read as typed content.',
        sample: 'you',
      },
    ],
  },
  {
    name: 'Body ramp',
    family: 'sans',
    styles: [
      {
        name: 'body-2xl',
        fontSize: '2rem',
        lineHeight: '2.25rem',
        fontWeight: 400,
        usage: '`text-body-2xl`.' + UNUSED,
      },
      {
        name: 'body-xl',
        fontSize: '1.75rem',
        lineHeight: '2.25rem',
        fontWeight: 400,
        usage: '`text-body-xl`.' + UNUSED,
      },
      {
        name: 'body-lg',
        fontSize: '1.5rem',
        lineHeight: '2rem',
        fontWeight: 400,
        usage: '`text-body-lg`: rare large lead copy.',
      },
      {
        name: 'body-md',
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
        fontWeight: 400,
        usage:
          '`text-body-md`: marketing lead paragraphs and the wordmark (`font-light` gift, `font-bold` pool).',
        sample: 'Never miss a birthday again.',
      },
      {
        name: 'body-sm',
        fontSize: '1rem',
        lineHeight: '1.25rem',
        fontWeight: 400,
        usage: '`text-body-sm`: card body copy (`CardContent`).',
      },
      {
        name: 'body-xs',
        fontSize: '0.875rem',
        lineHeight: '1.125rem',
        fontWeight: 400,
        usage: '`text-body-xs`: small body copy.',
      },
      {
        name: 'body-2xs',
        fontSize: '0.75rem',
        lineHeight: '1rem',
        fontWeight: 400,
        usage: '`text-body-2xs`.' + UNUSED,
      },
      {
        name: 'caption',
        fontSize: '1.125rem',
        lineHeight: '1.5rem',
        fontWeight: 600,
        usage: '`text-caption`.' + UNUSED,
      },
      {
        name: 'button',
        fontSize: '0.75rem',
        lineHeight: '1rem',
        fontWeight: 700,
        usage: '`text-button`.' + UNUSED,
      },
    ],
  },
];

export const spacingNote: string | undefined =
  'Tailwind default 4px scale. Layout widths are locked per page type.';
export const spacingTokens: LengthToken[] = [
  {
    name: 'space-1',
    value: '0.25rem',
    usage: 'Tight gaps: icon to label, pill padding.',
  },
  {
    name: 'space-2',
    value: '0.5rem',
    usage: 'Inline gaps between buttons and chips.',
  },
  {
    name: 'space-3',
    value: '0.75rem',
    usage: 'Section title row to content; card padding `sm`.',
  },
  {
    name: 'space-4',
    value: '1rem',
    usage:
      'Card and Section padding (`md`, the default); field padding x is 12px.',
  },
  {
    name: 'space-6',
    value: '1.5rem',
    usage: 'Card padding `lg`; gaps between sections.',
  },
  {
    name: 'space-8',
    value: '2rem',
    usage: 'Container side padding; large section gaps.',
  },
  { name: 'space-12', value: '3rem', usage: 'Marketing section rhythm.' },
  {
    name: 'top-bar-height',
    value: '4.0625rem',
    usage:
      'Fixed top bar on phones (65px); 4.5625rem (73px) from 768px when the desktop nav appears.',
  },
  {
    name: 'bottom-nav-height',
    value: '3.5rem',
    usage:
      'Bottom tab bar below 768px, plus env(safe-area-inset-bottom) in the app.',
  },
  {
    name: 'width-narrow',
    value: '48rem',
    usage: '`max-w-3xl`: settings, forms and detail pages.',
  },
  {
    name: 'width-standard',
    value: '72rem',
    usage: '`max-w-6xl`: standard app pages.',
  },
  {
    name: 'width-max',
    value: '1400px',
    usage: 'Maximum content width (container 2xl). A cap, not a page width.',
  },
];

export const radiusNote: string | undefined = undefined;
export const radiusTokens: LengthToken[] = [
  {
    name: 'radius',
    value: '0.5rem',
    usage: 'The base (`rounded-lg`): SecrecyNote, menus, modest panels.',
  },
  {
    name: 'radius-sm',
    value: '4px',
    usage: '`rounded-sm` (base minus 4px): checkbox, SystemLabel.',
  },
  {
    name: 'radius-md',
    value: '6px',
    usage: '`rounded-md` (base minus 2px): text fields, EmptyState, skeletons.',
  },
  {
    name: 'radius-xl',
    value: '0.75rem',
    usage: '`rounded-xl`: cards and sections, icon buttons.',
  },
  {
    name: 'radius-2xl',
    value: '1rem',
    usage: '`rounded-2xl`: feature cards, sheets, large groupings.',
  },
  {
    name: 'radius-full',
    value: '9999px',
    usage: 'Buttons, badges, stage pills, avatars, switches.',
  },
];

export const shadowNote: string | undefined =
  'Low and ambient. Cards rest on shadow-sm.';
export const shadowTokens: LengthToken[] = [
  {
    name: 'shadow-sm',
    value: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    usage: 'Resting cards and sections, switch thumb.',
  },
  {
    name: 'shadow-md',
    value: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    usage: 'Hovered interactive card (desktop only); elevated card.',
  },
  {
    name: 'shadow-lg',
    value: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    usage: 'Hovered elevated card; menus and dialogs.',
  },
];
