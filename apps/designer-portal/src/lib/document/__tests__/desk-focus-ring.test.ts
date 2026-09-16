/**
 * D9 — the Desk's focus ring is clay-INK.
 *
 * --color-clay (#C4A57B) reads 2.18:1 on paper and fails WCAG 1.4.11/2.4.11
 * as a focus indicator; --color-clay-ink (#7C5E30) reads 5.61:1 and is what
 * the house sheet specifies. The wrong token was wired while the right value
 * was already computed and commented one line away.
 *
 * Scoped to the Desk's own components rather than the portal, because other
 * surfaces carry the same defect and fixing them is a separate program.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESK_DIR = join(__dirname, '../../../components/document');

/** Named explicitly, not globbed. A glob that silently resolves to zero files
 *  makes every assertion below vacuously true — the exact failure a source
 *  scan exists to close. */
const DESK_FILES = [
  'desk-roster.tsx',
  'desk-claim-card.tsx',
  'desk-ledger-row.tsx',
  'desk-claims.tsx',
] as const;

// An empty table would make the `it.each` below pass vacuously. Guarded here,
// outside any `it`, so a later edit that empties the list fails loudly at
// collection time rather than reading as a quiet green suite.
if (DESK_FILES.length === 0) {
  throw new Error('desk-focus-ring.test.ts: DESK_FILES must not be empty');
}

/** `--color-clay)` and not `--color-clay` — the bare prefix also matches
 *  `--color-clay-ink)`, which is the value this guard is enforcing, so the
 *  loose form would fail on the fix. The closing paren is what tells the two
 *  tokens apart. */
const CLAY_FOCUS = /outline-\[var\(--color-clay\)\]/;

describe('D9 · the Desk spends clay-ink for focus, never clay', () => {
  it.each(DESK_FILES)('%s writes no --color-clay focus ring', (name) => {
    const path = join(DESK_DIR, name);
    const offenders = readFileSync(path, 'utf8')
      .split('\n')
      .map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => CLAY_FOCUS.test(line))
      .map(([lineNo, line]) => `${name}:${lineNo} ${line.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });
});
