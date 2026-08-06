/**
 * Plan Room source-text contracts (the client-mirror-contract precedent —
 * source-level, cheap, and impossible to satisfy by accident).
 *
 * Three invariants that no runtime test can hold:
 *
 *  (a) The client's read of the plan room never touches the ledger. A client
 *      sees SHEETS and their current prints — never an issue, never a
 *      transmittal, never a token, never who else holds what.
 *  (b) The PDF libraries stay behind a dynamic import. A top-level import of
 *      pdfjs-dist or pdf-lib pulls a DOM-dependent runtime into the server and
 *      Cloudflare Worker bundles, which fails at build or at the edge.
 *  (c) The Document's laws: zero shadows (D4) and ledgers as CSS grids, never
 *      a <table>.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');
const REPO = join(SRC, '..', '..', '..');

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Comments are stripped before every assertion below. These files DESCRIBE the
 * things they must not do ("never a <table>", "must never select from
 * plan_transmittals"), and a contract that its own documentation breaks would
 * push authors to stop writing the documentation.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Shipped source only. A spec that asserts `.not.toMatch(/shadow/)` contains
 * the word by necessity, and sweeping it would make the D4 check fail on the
 * very test that enforces D4.
 */
function sourcesUnder(dir: string): Array<[string, string]> {
  return readdirSync(dir).flatMap((entry): Array<[string, string]> => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : sourcesUnder(full);
    }
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.(test|spec)\.tsx?$/.test(entry)) return [];
    return [[entry, stripComments(read(full))]];
  });
}

describe('useClientPlanSet reads sheets, never the ledger', () => {
  const source = read(
    join(REPO, 'packages', 'supabase', 'src', 'hooks', 'use-plan-room.ts'),
  );
  const body = stripComments(
    source.slice(source.indexOf('export function useClientPlanSet')),
  );

  it('never names a ledger table or a token column', () => {
    for (const forbidden of [
      'plan_transmittals',
      'plan_transmittal_tokens',
      'plan_issues',
      'plan_issue_prints',
      'plan_print_batches',
      'token_hash',
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('is bounded to shared sheets', () => {
    expect(body).toMatch(/\.eq\("state",\s*"shared"\)/);
  });
});

describe('the PDF libraries stay behind a dynamic import', () => {
  const source = stripComments(read(join(SRC, 'lib', 'plans', 'pdf.ts')));

  it('has no top-level import of pdfjs-dist or pdf-lib', () => {
    expect(source).not.toMatch(/^import .*(pdfjs|pdf-lib)/m);
  });

  it('reaches them only through await import(...)', () => {
    expect(source).toMatch(/await import\(['"]pdfjs-dist['"]\)/);
    expect(source).toMatch(/await import\(['"]pdf-lib['"]\)/);
  });

  it('is the only file in the portal that names them at all', () => {
    const offenders = [
      ...sourcesUnder(join(SRC, 'components', 'document', 'plans')),
      ...sourcesUnder(join(SRC, 'lib', 'plans')).filter(
        ([name]) => name !== 'pdf.ts',
      ),
    ].filter(([, body]) => /['"](pdfjs-dist|pdf-lib)['"]/.test(body));
    expect(offenders.map(([name]) => name)).toEqual([]);
  });
});

describe('the plan room obeys the Document’s laws', () => {
  const sources = sourcesUnder(join(SRC, 'components', 'document', 'plans'));

  it('carries no shadow anywhere (D4)', () => {
    // Deliberately broad: bare `shadow`, any `shadow-*` utility, arbitrary
    // values (`shadow-[0_1px_2px]`), and opacity syntax (`shadow-black/10`).
    // The earlier enumeration of Tailwind's named sizes let all three through.
    const offenders = sources
      .filter(([, body]) => /\bshadow(\b|-)/.test(body))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('rules its ledgers as CSS grids, never a <table>', () => {
    const offenders = sources
      .filter(([, body]) => /<table[\s>]/.test(body))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });
});
