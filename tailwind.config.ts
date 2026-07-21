import { type Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';
import radixPlugin from 'tailwindcss-radix';
import { marketingPreset } from './app/routes/_marketing+/tailwind-preset';
import { extendedTheme } from './app/utils/extended-theme.ts';

export default {
  content: ['./app/**/*.{ts,tsx,jsx,js}'],
  // Safelist dynamic utility classes used by UI kit primitives (e.g., Grid, Box)
  // so Tailwind does not purge them when they're constructed at runtime.
  safelist: [
    // grid columns (with responsive variants)
    { pattern: /^grid-cols-(1|2|3|4|5|6|7|8|9|10|11|12)$/ },
    {
      pattern: /^grid-cols-(1|2|3|4|5|6|7|8|9|10|11|12)$/,
      variants: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    // auto-fit variant used by Grid when autoFit is true
    'grid-cols-[repeat(auto-fit,minmax(0,1fr))]',
    // gaps (common scale with responsive variants)
    { pattern: /^gap-(0|1|2|3|4|5|6|7|8|9|10|11|12)$/ },
    {
      pattern: /^gap-(0|1|2|3|4|5|6|7|8|9|10|11|12)$/,
      variants: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
    // padding/margin scales used by Box (keep modest range to avoid bloat)
    { pattern: /^(p|px|py|pt|pr|pb|pl)-(0|1|2|3|4|5|6|7|8|9|10|11|12)$/ },
    { pattern: /^(m|mx|my|mt|mr|mb|ml)-(0|1|2|3|4|5|6|7|8|9|10|11|12)$/ },
    // flex utilities used by Flex primitive
    { pattern: /^flex-(row|column|row-reverse|column-reverse)$/ },
    { pattern: /^flex-(nowrap|wrap|wrap-reverse)$/ },
    { pattern: /^justify-(start|center|end|between|around|evenly)$/ },
    { pattern: /^items-(start|center|end|baseline|stretch)$/ },
    'flex',
    'inline-flex',
  ],
  darkMode: 'class',
  future: {
    // Compiles hover: (and group-hover:/peer-hover:) to
    // `@media (hover: hover) and (pointer: fine) { &:hover }` instead of
    // plain `&:hover`. Without this, iOS treats a tap as `:hover` with no
    // matching mouseleave, so the tapped element stays visually "hovered"
    // after the finger lifts — worse in standalone PWA mode.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      ...extendedTheme,
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },
    },
  },
  presets: [marketingPreset],
  plugins: [animatePlugin, radixPlugin],
} satisfies Config;
