/**
 * US-14 arrival — the layering's first rung. `types.ts` is the frozen shared
 * surface (CONTRACT §4): types and constants only, so every other layer
 * (pure → DOM → host) can import it without pulling a runtime module in.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '../types.ts'), 'utf8');

const EXPORTS = [
  'Surface',
  'Part',
  'Carrier',
  'Via',
  'EntryKind',
  'Landing',
  'ArriveToken',
  'DeclineCause',
  'EndHow',
  'GateInput',
  'GateResult',
  'CardPart',
  'Brief',
  'Host',
  'ArrivalEnded',
  'BUDGET',
  'KEYS',
  'SENTINEL',
  'EVENT_ENDED',
] as const;

describe('arrival types.ts — the types-only layer', () => {
  it('imports no runtime module', () => {
    const imports = SOURCE.split('\n').filter((line) => /^\s*import\b/.test(line));
    for (const line of imports) {
      expect(line).toMatch(/^\s*import\s+type\b/);
    }
    expect(SOURCE).not.toMatch(/\brequire\s*\(/);
    expect(SOURCE).not.toMatch(/\bimport\s*\(/);
    expect(SOURCE).not.toMatch(/^\s*export\s+(?!type\b|interface\b|const\b)/m);
  });

  it.each(EXPORTS)('exports %s', (name) => {
    expect(SOURCE).toMatch(
      new RegExp(`^export (?:type|interface|const) ${name}\\b`, 'm'),
    );
  });

  it('exports nothing the contract does not name', () => {
    const exported = Array.from(
      SOURCE.matchAll(/^export (?:type|interface|const) (\w+)/gm),
      (match) => match[1],
    );
    expect(exported.sort()).toEqual([...EXPORTS].sort());
  });
});
