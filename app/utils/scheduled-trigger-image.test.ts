/**
 * @vitest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The scheduled Machines (occasion reminders, exchange sweeps) run their
// trigger scripts out of the production image. Nothing else does, so a script
// missing from the runtime stage fails only in production, once per schedule
// tick, as a stopped machine with exit code 1. The exchange sweeps shipped
// that way. This test is the thing that notices.
describe('scheduled trigger scripts', () => {
  const otherDir = path.join(process.cwd(), 'other');
  const dockerfile = readFileSync(path.join(otherDir, 'Dockerfile'), 'utf8');
  // Only the final stage matters — the build stage copies all of other/.
  const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
  const triggers = readdirSync(otherDir).filter(
    (f) => f.startsWith('trigger-') && f.endsWith('.js'),
  );

  it('has trigger scripts to check', () => {
    expect(triggers.length).toBeGreaterThan(0);
  });

  it.each(triggers)('copies %s into the runtime image', (script) => {
    const copied = runtimeStage
      .split('\n')
      .some(
        (line) => line.startsWith('COPY ') && line.includes(`other/${script}`),
      );
    expect(copied).toBe(true);
  });
});
