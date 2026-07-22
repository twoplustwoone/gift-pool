/**
 * Live palette comparison tool. NOT a shipped feature — no cookie/SSR
 * persistence, no Settings UI entry. Rendered for any developer in dev and
 * for admins only in production (see the `showPaletteSwitcher` gate in
 * root.tsx). Safe to delete this file, its import in root.tsx, and the
 * `.palette-fete` blocks in tailwind.css wholesale once a palette decision
 * is made.
 */
import { useEffect, useState } from 'react';
import { userHasRole } from '#app/utils/user.ts';

export const PALETTE_STORAGE_KEY = 'gp-dev-palette';
export const PALETTE_CLASS = 'palette-fete';

export function shouldShowPaletteSwitcher(
  isDev: boolean,
  user: Parameters<typeof userHasRole>[0],
) {
  return isDev || userHasRole(user, 'admin');
}

type PaletteId = 'current' | 'fete';

const PALETTES: { id: PaletteId; label: string }[] = [
  { id: 'current', label: 'Current' },
  { id: 'fete', label: 'Fête' },
];

export const PaletteSwitcher = () => {
  // Start `null` (render nothing) until mount so we never guess the palette
  // during SSR — the inline no-flash script in root.tsx's <Document> already
  // applied the right class before hydration; this just needs to agree with
  // it once it reads localStorage itself.
  const [palette, setPalette] = useState<PaletteId | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    setPalette(stored === 'fete' ? 'fete' : 'current');
  }, []);

  useEffect(() => {
    if (palette === null) return;
    const shouldHaveClass = palette === 'fete';
    const root = document.documentElement;
    root.classList.toggle(PALETTE_CLASS, shouldHaveClass);
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);

    // The theme switch re-renders <html>'s className as a single template
    // string, which silently drops this class since React isn't aware of
    // it. Reassert it whenever something else touches the class attribute.
    const observer = new MutationObserver(() => {
      root.classList.toggle(PALETTE_CLASS, shouldHaveClass);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      // Unmounting (e.g. the admin gate closing on logout or a revoked
      // role) must not strand the page on the experimental palette with no
      // switcher left to revert it — <html>'s className is keyed off theme,
      // not palette, so React won't clear this class on its own.
      root.classList.remove(PALETTE_CLASS);
    };
  }, [palette]);

  if (palette === null) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '5.5rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: 'rgba(24,18,20,0.9)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}
      data-testid="palette-switcher"
    >
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
