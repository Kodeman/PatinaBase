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
import {
  deriveLineStage,
  deriveLineStamp,
  laborPiece,
  lineStageInputFromRow,
  lineStampLabel,
  type LineStampRow,
} from '../stamp-derivation';
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

  // US-21 Q3: PLACEHOLDER is a derived stamp, not a stage a line can be moved
  // to, so the board's dropdown has no word for it to drift from.
  it('keeps placeholder off the stage dropdown and prints Q3’s word', () => {
    expect(FFE_STAGE_KEYS).not.toContain('placeholder');
    expect(lineStampLabel('placeholder')).toBe('Placeholder');
  });

  // US-21 D1: the four stage words are derived, not stages a line is moved to.
  it.each(['specced', 'ready', 'released'] as const)(
    'keeps %s off the stage dropdown',
    (kind) => {
      expect(FFE_STAGE_KEYS).not.toContain(kind);
      expect(lineStampLabel(kind)).not.toBe('');
    },
  );
});

/**
 * US-21 D1 parity — CONTRACT §3.3: wherever `ffe_line_stage` is present on the
 * row, the TS mirror must equal it. These rows are the fixtures of
 * `supabase/tests/ffe/pieces_line_stage_test.sql`, with `ffe_line_stage` and
 * `ffe_line_authorization` exactly as 00736 computed them on the local stack
 * (captured 2026-10-08, rolled back; SQ-625 evidence `sql-stage-rows.json`).
 */
type ServerRow = LineStampRow & { id: string; name: string; ffe_line_stage: string | null };

const P = 'product';
const MAKER = 'vendor-maker';
const INSTALLER = 'vendor-installer';
const server = (
  id: string,
  name: string,
  status: string,
  item_type: string,
  cols: Partial<ServerRow>,
  ffe_line_authorization: string | null,
  ffe_line_stage: string | null,
): ServerRow => ({
  id,
  name,
  status,
  item_type,
  blocked: false,
  received_quantity: null,
  product_id: null,
  vendor_id: null,
  vendor_name: null,
  quantity: 1,
  unit_price_cents: 0,
  budget_max_cents: null,
  line_kind: 'goods',
  parent_ffe_item_id: null,
  ...cols,
  ffe_line_authorization,
  ffe_line_stage,
});

const SERVER_ROWS: ServerRow[] = [
  server('161', 'R6a sent', 'specified', 'fixed', { product_id: P, unit_price_cents: 3_800 }, 'sent', 'released'),
  server('162', 'R6b signed allowance', 'specified', 'allowance', { budget_max_cents: 300_000 }, 'client_signed', 'released'),
  server('171', 'R7a fixed', 'specified', 'fixed', { product_id: P, quantity: 2, unit_price_cents: 3_800 }, null, 'ready'),
  server('172', 'R7b allowance', 'specified', 'allowance', { product_id: P, budget_max_cents: 120_000 }, null, 'ready'),
  server('173', 'R7c rough only', 'specified', 'fixed', { product_id: P }, null, 'specced'),
  server('181', 'R8a no price', 'specified', 'fixed', { product_id: P }, null, 'specced'),
  server('182', 'R8b custom cabinet', 'specified', 'fixed', { vendor_name: 'Hollis Millwork' }, null, 'specced'),
  server('191', 'R9a rough name', 'specified', 'fixed', {}, null, 'placeholder'),
  server('192', 'R9b priced name', 'specified', 'fixed', { unit_price_cents: 5_000 }, null, 'placeholder'),
  server('199', 'ordered', 'ordered', 'fixed', { product_id: P, unit_price_cents: 3_800 }, 'sent', null),
  server('201', 'Wallpaper (ready)', 'specified', 'fixed', { product_id: P, vendor_id: MAKER, quantity: 9, unit_price_cents: 21_000 }, null, 'ready'),
  server('202', 'Wallpaper (specced)', 'specified', 'fixed', { product_id: P, vendor_id: MAKER, quantity: 9 }, null, 'specced'),
  server('203', 'Wallpaper (released)', 'specified', 'fixed', { product_id: P, vendor_id: MAKER, quantity: 9, unit_price_cents: 21_000 }, 'sent', 'released'),
  server('301', 'L1 install', 'specified', 'fixed', { vendor_id: INSTALLER, quantity: 9, unit_price_cents: 8_500, line_kind: 'labor', parent_ffe_item_id: '201' }, null, 'ready'),
  server('302', 'L2 install', 'specified', 'fixed', { vendor_id: INSTALLER, quantity: 9, unit_price_cents: 8_500, line_kind: 'labor', parent_ffe_item_id: '202' }, null, 'specced'),
  server('303', 'L3 install', 'specified', 'fixed', { vendor_id: INSTALLER, quantity: 9, unit_price_cents: 8_500, line_kind: 'labor', parent_ffe_item_id: '203' }, 'sent', 'released'),
  server('304', 'L edge', 'specified', 'fixed', { vendor_id: INSTALLER, quantity: 1, unit_price_cents: 9_000, line_kind: 'labor', parent_ffe_item_id: '203' }, null, 'ready'),
];

describe('D1 parity · the TS mirror equals ffe_line_stage (00736)', () => {
  const tsStage = (row: ServerRow) =>
    deriveLineStage(lineStageInputFromRow(row, laborPiece(row, SERVER_ROWS)));

  it.each(SERVER_ROWS.filter((r) => r.ffe_line_stage != null))(
    '$name: TS equals the server’s $ffe_line_stage',
    (row) => {
      expect(tsStage(row)).toBe(row.ffe_line_stage);
    },
  );

  it.each(SERVER_ROWS.filter((r) => r.ffe_line_stage != null))(
    '$name: the stamp the paper prints is the same stage word',
    (row) => {
      const stamp = deriveLineStamp({
        ...row,
        stage: lineStageInputFromRow(row, laborPiece(row, SERVER_ROWS)),
      });
      expect(stamp.kind).toBe(row.ffe_line_stage);
    },
  );

  it('where the server has no stage (ordered on), the goods word prints', () => {
    const ordered = SERVER_ROWS.find((r) => r.ffe_line_stage == null)!;
    const stamp = deriveLineStamp({ ...ordered, stage: lineStageInputFromRow(ordered) });
    expect(lineStampLabel(stamp.kind)).toBe('Released to maker');
  });
});
