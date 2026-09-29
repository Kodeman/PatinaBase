/**
 * US-14 arrival — one name for the long form (CONTRACT §4a, §4c test hygiene). The page carries
 * the card's whole sentence on `data-arr-long`; `run-contract.ts` is frozen and still names the
 * mockup's attribute in its comments, so it alone is exempt.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const PORTAL = join(__dirname, '../../../..');
const ROOTS = ['src/lib/arrival', 'src/components/document/arrival'];
const EXEMPT = new Set(['run-contract.ts', basename(__filename)]);
const RETIRED = ['data', 'part', 'long'].join('-');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|css)$/.test(name) && !EXEMPT.has(name) ? [path] : [];
  });
}

describe('the long-form attribute', () => {
  it(`no arrival source reads ${RETIRED}`, () => {
    const files = ROOTS.flatMap((root) => sources(join(PORTAL, root)));
    expect(files.length).toBeGreaterThan(10);
    const readers = files
      .filter((file) => readFileSync(file, 'utf8').includes(RETIRED))
      .map((file) => relative(PORTAL, file));
    expect(readers).toEqual([]);
  });

  it('brief reads data-arr-long', () => {
    const brief = readFileSync(join(PORTAL, 'src/lib/arrival/brief.ts'), 'utf8');
    expect(brief).toMatch(/getAttribute\(\s*'data-arr-long'\s*\)/);
  });
});
