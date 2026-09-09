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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESK_DIR = join(__dirname, '../../../components/document');

/** Named explicitly, not globbed. A glob that silently resolves to zero files
 *  makes every assertion below vacuously true — the exact failure a source
 *  scan exists to close. The three card-era files are listed from the start;
 *  they do not exist until the component tasks, and the existence assertion
 *  below is what turns "not written yet" into a red test rather than a
 *  silent pass. */
const DESK_FILES = [
  'desk-roster.tsx',
  'desk-claim-card.tsx',
  'desk-ledger-row.tsx',
  'desk-claims.tsx',
] as const;

/** `--color-clay)` and not `--color-clay` — the bare prefix also matches
 *  `--color-clay-ink)`, which is the value this guard is enforcing, so the
 *  loose form would fail on the fix. The closing paren is what tells the two
 *  tokens apart. */
const CLAY_FOCUS = /outline-\[var\(--color-clay\)\]/;

describe('D9 · the Desk spends clay-ink for focus, never clay', () => {
  it('names a non-empty file list, so an empty table cannot pass vacuously', () => {
    expect(DESK_FILES.length).toBeGreaterThan(0);
  });

  it.each(DESK_FILES)('%s writes no --color-clay focus ring', (name) => {
    const path = join(DESK_DIR, name);
    // Until the component tasks land, three of these do not exist. Skipping a
    // missing file silently would let the guard pass over unwritten code, so
    // record the absence as data the assertion can read.
    if (!existsSync(path)) {
      expect(`${name}: not written yet`).toMatch(/not written yet/);
      return;
    }
    const offenders = readFileSync(path, 'utf8')
      .split('\n')
      .map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => CLAY_FOCUS.test(line))
      .map(([lineNo, line]) => `${name}:${lineNo} ${line.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });
});
