/**
 * R35 source contracts (the R3/R16 shadow-lint precedent) — the Strata Mark
 * progress system's build contract, held mechanically so it can't regress:
 *   · the three MOVEMENT hues (Mocha/Clay/Dusty-Blue), line 3 softened
 *   · the --f fill as a left-clipped scaleX, four size variants, mono flag
 *   · the .sweeping loader's classes match the globals keyframes
 *   · the spine carries per-section fill; the canonical button renders the
 *     sweep, not a CSS spinner.
 *
 * The r3f viewer's `LoadingOverlay` used to be a third surface asserted here; it
 * was deleted with the rest of that stack (Rendered Room v2, W2), and a contract
 * over a file that no longer exists is not a contract.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const mark = read('components/document/strata-mark.tsx');
const sweep = read('components/ui/strata-sweep.tsx');
const globals = read('app/globals.css');
const spine = read('components/document/doc-spine.tsx');
const button = read('components/ui/controls/button.tsx');

describe('R35 — the three-hue progress mark', () => {
  it('each line carries its movement hue, line 3 softened (the gradient fade)', () => {
    expect(mark).toMatch(/var\(--color-mocha\)/);
    expect(mark).toMatch(/var\(--color-clay\)/);
    expect(mark).toMatch(/var\(--color-dusty-blue\)/);
    expect(mark).toMatch(/LINE3_OPACITY\s*=\s*0\.55/);
  });

  it('fill is a left-clipped scaleX(--f) over a ghost track, with a mono escape', () => {
    expect(mark).toMatch(/scaleX\(\$\{clamp\(fill\[i\]\)\}\)/);
    expect(mark).toMatch(/transformOrigin: 'left center'/);
    expect(mark).toMatch(/mono\b/);
  });

  it('exposes the four R35 size variants', () => {
    for (const s of ['sm:', 'md:', 'lg:', 'xl:']) expect(mark).toContain(s);
    expect(mark).toMatch(/w:\s*48/); // sm
    expect(mark).toMatch(/w:\s*150/); // xl
  });
});

describe('R35 — the sweep loader', () => {
  it('StrataSweep renders the strata-sweep/.strata-line/.strata-fill structure', () => {
    expect(sweep).toMatch(/strata-sweep inline-flex/);
    expect(sweep).toMatch(/strata-line/);
    expect(sweep).toMatch(/strata-fill/);
    expect(sweep).toMatch(/role="status"/);
    // movement hues (the brand mark accumulating), line 3 softened
    expect(sweep).toMatch(/var\(--color-mocha\)/);
    expect(sweep).toMatch(/0\.55/);
  });

  it('globals.css defines the sweep keyframes + classes matching the component', () => {
    for (const k of [
      '@keyframes strata-sweep-1',
      '@keyframes strata-sweep-2',
      '@keyframes strata-sweep-3',
      '@keyframes strata-sweep-fade',
      '.strata-sweep .strata-fill',
      '.strata-sweep .strata-line:nth-child(1) .strata-fill',
    ]) {
      expect(globals).toContain(k);
    }
    // reduced-motion stills it to a static partial
    expect(globals).toMatch(/prefers-reduced-motion[\s\S]*strata-sweep[\s\S]*scaleX\(0\.6\)/);
  });
});

describe('R35 — surfaces carry the mark', () => {
  it('the spine renders per-section fill (the staircase), active breathing', () => {
    expect(spine).toMatch(/fillStateAtSection\(s\.key\)/);
    expect(spine).toMatch(/breathing=\{s\.state === 'active'\}/);
  });

  it('the canonical button sweeps on load (no lucide spinner)', () => {
    expect(button).toMatch(/<StrataSweep/);
    expect(button).not.toMatch(/Loader2/);
    expect(button).not.toMatch(/animate-spin/);
  });
});
