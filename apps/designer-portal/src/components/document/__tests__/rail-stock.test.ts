/**
 * R126 — the third paper stock. The spine and the margin are ONE deeper sheet,
 * `--doc-rail-stock`, not two alpha washes over whatever happens to be behind
 * them (a 1.081:1 pearl wash on the spine, a 1.000:1 paper wash on the margin).
 *
 * Asserted at the source rather than through a render: margin-rail mounts the
 * Supabase margin hooks and doc-spine the full section list, and the fact under
 * test is one class string on one element in each.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCUMENT_DIR = join(__dirname, '..');

function read(file: string): string {
  return readFileSync(join(DOCUMENT_DIR, file), 'utf8');
}

describe('R126 · the rail stock', () => {
  it('grounds the spine on the rail stock', () => {
    const source = read('doc-spine.tsx');
    expect(source).toContain('bg-[var(--doc-rail-stock)]');
    expect(source).not.toContain('rgba(229,226,221,0.28)');
  });

  it('grounds the margin panel on the same stock, at every width', () => {
    const source = read('margin-rail.tsx');
    expect(source).toContain('bg-[var(--doc-rail-stock)]');
    // The 1440 override was a second, lighter wash — one rail, one stock.
    expect(source).not.toContain('rgba(250,247,242,0.98)');
    expect(source).not.toContain('rgba(250,247,242,0.55)');
  });

  // The ladder is the rail's one block now (OD-16), so it spends the rail's
  // register or nothing: `--color-aged-oak` on this stock measured 3.51:1 and
  // `--color-clay` 1.82:1, which is what took the old running index's inactive
  // values below AA.
  it.each(['doc-spine.tsx', 'spine/lens-ladder.tsx'])(
    'keeps %s to charcoal, the muted ramp and clay-ink',
    (file) => {
      const source = read(file);
      const inks = source.match(/text-\[var\(--[a-z-]+\)\]/g) ?? [];
      const allowed = new Set([
        'text-[var(--color-charcoal)]',
        'text-[var(--color-clay-ink)]',
        'text-[var(--text-primary)]',
        'text-[var(--text-body)]',
        'text-[var(--text-muted)]',
        'text-[var(--text-subtle)]',
        'text-[var(--text-faint)]',
      ]);
      expect(inks.length).toBeGreaterThan(0);
      expect([...new Set(inks)].filter((ink) => !allowed.has(ink))).toEqual([]);
    },
  );
});
