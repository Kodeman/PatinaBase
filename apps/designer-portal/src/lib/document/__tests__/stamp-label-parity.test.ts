/**
 * F58 — the paper's stamp words and the FF&E board's stage words are two
 * hand-maintained copies of one vocabulary, and only one of them may drift.
 *
 * `stamp-derivation.ts` carries STAGE_CONFIG's machine words as literals on
 * purpose: `stages.ts` pulls `@patina/help-system`, which the derivation module
 * stays clear of so the leaf and page suites can mock it freely. This spec is
 * the join those literals were missing — it imports both and holds them equal,
 * with `delivered` as the one ruled divergence (R125 item 4: the dropdown names
 * the stage a line can be moved TO — `Received` — while the stamp names what is
 * true of the goods, and arrived is not inspected).
 */

// `stages.ts` imports SurfaceKeys from @patina/help-system, whose barrel pulls
// @portabletext/react — untransformed ESM, a SyntaxError under Jest. Mocking
// '@patina/help-system' does NOT work: tsconfig `paths` maps it to the package
// src and SWC rewrites the specifier, so the require key never matches the
// registration. Mock the un-mapped ESM offender itself (the pattern
// stage-select.test.tsx documents). STAGE_CONFIG itself stays REAL — mocking it
// is what makes drift unobservable in the leaf suite, and unobservable drift is
// the whole finding this spec answers.
jest.mock('@portabletext/react', () => ({
  PortableText: () => null,
  toPlainText: () => '',
}));

import { STAGE_CONFIG } from '@/components/portal/ffe/stages';
import { lineStampLabel } from '../stamp-derivation';
import { FFE_STAGE_KEYS } from '@patina/types';

describe('F58 · one vocabulary across the paper and the FF&E board', () => {
  const divergent = 'delivered';

  it.each(FFE_STAGE_KEYS.filter((k) => k !== divergent))(
    '%s reads the same word on the stamp and in the stage dropdown',
    (key) => {
      expect(lineStampLabel(key)).toBe(STAGE_CONFIG[key].label);
    },
  );

  it('keeps delivered deliberately apart — Delivered on paper, Received in the dropdown', () => {
    expect(lineStampLabel('delivered')).toBe('Delivered');
    expect(STAGE_CONFIG.delivered.label).toBe('Received');
    expect(lineStampLabel('received')).toBe('Received');
  });
});
