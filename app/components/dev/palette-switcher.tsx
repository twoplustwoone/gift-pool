/**
 * Live palette comparison tool. NOT a shipped feature — no cookie/SSR
 * persistence, no Settings UI entry. Rendered for any developer in dev and
 * for admins only in production (see the `showPaletteSwitcher` gate in
 * root.tsx). Safe to delete this file, its import in root.tsx, and the
 * `.palette-*` blocks in tailwind.css wholesale once a palette decision is
 * made.
 */
import { useEffect, useRef, useState } from 'react';
import { userHasRole } from '#app/utils/user.ts';

export const PALETTE_STORAGE_KEY = 'gp-dev-palette';

export type PaletteId = 'current' | 'fete' | 'botanical' | 'golden' | 'jewel';

// 'current' has no entry — it's just :root/.dark, the production tokens.
// Exported so root.tsx's pre-hydration script can serialize the same map
// instead of hardcoding class names in a second place.
export const PALETTE_CLASSES: Partial<Record<PaletteId, string>> = {
  fete: 'palette-fete',
  botanical: 'palette-botanical',
  golden: 'palette-golden',
  jewel: 'palette-jewel',
};

const ALL_PALETTE_CLASSES = Object.values(PALETTE_CLASSES);

// Guard every mutation with a `contains` check rather than calling
// add/remove unconditionally. The MutationObserver below reasserts this
// class on every class-attribute change (including its own), so a call that
// touches the DOM even when nothing actually needs to change causes an
// infinite observer->mutate->observer loop under jsdom, which (unlike real
// browsers) emits a mutation record for add/remove calls regardless of
// whether the resulting value differs from before.
function applyPaletteClass(root: HTMLElement, id: PaletteId) {
  const target = PALETTE_CLASSES[id];
  for (const cls of ALL_PALETTE_CLASSES) {
    if (cls !== target && root.classList.contains(cls))
      root.classList.remove(cls);
  }
  if (target && !root.classList.contains(target)) root.classList.add(target);
}

export function shouldShowPaletteSwitcher(
  isDev: boolean,
  user: Parameters<typeof userHasRole>[0],
) {
  return isDev || userHasRole(user, 'admin');
}

const PALETTES: { id: PaletteId; label: string }[] = [
  { id: 'current', label: 'Current' },
  { id: 'fete', label: 'Fête' },
  { id: 'botanical', label: 'Botanical' },
  { id: 'golden', label: 'Golden hour' },
  { id: 'jewel', label: 'Jewel box' },
];

const isPaletteId = (value: string | null): value is PaletteId =>
  value != null && PALETTES.some((p) => p.id === value);

export const PaletteSwitcher = () => {
  // Start `null` (render nothing) until mount so we never guess the palette
  // during SSR — the inline no-flash script in root.tsx's <Document> already
  // applied the right class before hydration; this just needs to agree with
  // it once it reads localStorage itself.
  const [palette, setPalette] = useState<PaletteId | null>(null);
  // Collapsed by default: expanded, this sits on top of whatever occupies the
  // bottom-right of the page, which on a phone is usually the primary action —
  // it was covering "Save and gather people" on the new-exchange form.
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Opening and closing swap one tree for another, so the element the keyboard
  // user just activated stops existing. Without this, focus falls back to
  // <body> and they have to tab in from the top of the page again.
  const wasOpen = useRef(open);

  useEffect(() => {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    setPalette(isPaletteId(stored) ? stored : 'current');
  }, []);

  useEffect(() => {
    if (palette === null) return;
    const root = document.documentElement;
    applyPaletteClass(root, palette);
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);

    // The theme switch re-renders <html>'s className as a single template
    // string, which silently drops these classes since React isn't aware of
    // them. Reassert whenever something else touches the class attribute.
    const observer = new MutationObserver(() => {
      applyPaletteClass(root, palette);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      // Unmounting (e.g. the admin gate closing on logout or a revoked
      // role) must not strand the page on an experimental palette with no
      // switcher left to revert it — <html>'s className is keyed off theme,
      // not palette, so React won't clear these classes on its own.
      for (const cls of ALL_PALETTE_CLASSES) root.classList.remove(cls);
    };
  }, [palette]);

  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    // Into the panel on open, back to the trigger on close.
    (open ? closeRef : triggerRef).current?.focus();
  }, [open]);

  if (palette === null) return null;

  const shell = {
    position: 'fixed',
    bottom: '5.5rem',
    right: '1rem',
    zIndex: 9999,
    borderRadius: 16,
    background: 'rgba(24,18,20,0.9)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  } as const;

  if (!open) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change palette"
        aria-expanded={false}
        style={{
          ...shell,
          display: 'grid',
          placeItems: 'center',
          width: 36,
          height: 36,
          border: 'none',
          cursor: 'pointer',
          color: '#fff',
          fontSize: 15,
          lineHeight: 1,
        }}
        data-testid="palette-switcher"
      >
        <span aria-hidden>🎨</span>
      </button>
    );
  }

  return (
    <div
      style={{
        ...shell,
        display: 'flex',
        flexWrap: 'wrap',
        maxWidth: '13rem',
        gap: 4,
        padding: 4,
      }}
      data-testid="palette-switcher"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Hide palette switcher"
        aria-expanded
        style={{
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          padding: '7px 9px',
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          background: 'transparent',
          color: '#fff',
        }}
      >
        ✕
      </button>
      {PALETTES.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setPalette(id)}
          style={{
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            padding: '7px 11px',
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            background: palette === id ? '#fff' : 'transparent',
            color: palette === id ? '#18121a' : '#fff',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
