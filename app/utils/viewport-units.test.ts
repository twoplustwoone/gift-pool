/**
 * @vitest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `100vh` is the LARGE viewport: the window as it would be with the mobile
// browser's chrome collapsed away. It does not shrink back when the toolbar
// is showing, so anything sized in `vh` is up to ~80px taller than what the
// user can actually see. That shipped twice — as a `min-h-screen` body that
// made the whole document a second scroller (#599), and as a full-snap sheet
// capped at `calc(100vh - 0.75rem)`, which put the drag handle and the ✕
// close button above the top of the screen with no way to dismiss it.
//
// `dvh` tracks the visible height, so it is right in both states. There is
// no browser on a CI box that can catch this — Chromium and WebKit both tie
// vh/svh/lvh/dvh in every emulation mode, because neither models retractable
// browser chrome. A source scan is the only thing that notices.
const FORBIDDEN = /(?<![a-z-])(?:\d+(?:\.\d+)?vh|min-h-screen|h-screen)(?![a-z-])/;

const collect = (dir: string, out: string[] = []) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (/\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

// Comments are where this rule gets explained, so they must not trip it.
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('viewport units', () => {
  it('are dynamic everywhere in app source', () => {
    const appDir = path.join(process.cwd(), 'app');
    const offenders: string[] = [];

    for (const file of collect(appDir)) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (FORBIDDEN.test(line)) {
          offenders.push(
            `${path.relative(process.cwd(), file)}:${i + 1} — ${line.trim().slice(0, 100)}`,
          );
        }
      });
    }

    expect(
      offenders,
      `Static viewport units found. Use dvh (or min-h-full for a page wrapper) — see the "One scroller, and no viewport units in the shell" rule in AGENTS.md:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
