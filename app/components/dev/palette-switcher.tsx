/**
 * Owner-only live palette comparison tool. NOT a shipped feature — no
 * cookie/SSR persistence, no Settings UI entry, dev-build only (see the
 * `import.meta.env.DEV` gate in root.tsx). Safe to delete this file, its
 * import in root.tsx, and the `.palette-fete` blocks in tailwind.css
 * wholesale once a palette decision is made.
 */
import { useEffect, useState } from 'react';

export const PALETTE_STORAGE_KEY = 'gp-dev-palette';
export const PALETTE_CLASS = 'palette-fete';

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
    document.documentElement.classList.toggle(
      PALETTE_CLASS,
      palette === 'fete',
    );
    window.localStorage.setItem(PALETTE_STORAGE_KEY, palette);
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
