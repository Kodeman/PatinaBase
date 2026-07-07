// Deno tests for the shared spec-sheet builder.
//
// Run (npm specifiers need auto node-modules resolution in this repo — a
// node_modules dir from pnpm puts Deno in manual mode otherwise):
//   deno test --no-check --node-modules-dir=auto \
//     supabase/functions/_shared/spec-pdf.test.ts
//
// The PURE-MODEL tests (buildScheduleModel / buildItemModel / computeRecordPct)
// prove the money-visibility gating without parsing PDF bytes. The two SMOKE
// tests render real PDFs and need react-pdf from npm; if npm can't be fetched
// they fail to load, but the pure-model tests above them still stand as the
// proof of the gating logic.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  buildItemModel,
  buildScheduleModel,
  computeRecordPct,
  renderSpecItemPdf,
  renderSpecSchedulePdf,
  type SpecItemInput,
  type SpecLineInput,
} from './spec-pdf.ts';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function line(overrides: Partial<SpecLineInput> = {}): SpecLineInput {
  return {
    code: 'FF-01',
    name: 'Sofa',
    quantity: 1,
    leadLabel: '6–8 wks',
    clientUnitCents: 120000,
    lineTotalCents: 120000,
    supplierName: 'Acme Furnishings',
    itemType: 'fixed',
    recordVerified: false,
    ...overrides,
  };
}

const itemBase: SpecItemInput = {
  studioName: 'Studio Patina',
  projectName: 'Maple Residence',
  name: 'Eames Lounge Chair',
  code: 'FF-01',
  category: 'Seating',
  roomName: 'Living Room',
  quantity: 2,
  leadLabel: '6–8 wks',
  itemType: 'fixed',
  specs: 'Black leather, walnut shell. COM available.',
  customFields: [
    { label: 'Finish', value: 'Walnut' },
    { label: 'Fabric', value: 'Sonoma Black' },
  ],
  sourceUrl: 'https://www.hermanmiller.com/eames-lounge',
  capturedBy: 'Leah Chen',
  recordPct: 100,
  brand: 'Herman Miller',
  imageUrls: [], // no network fetch in tests
  clientUnitCents: 700000,
};

// ─── buildScheduleModel — pricing visible (default) ──────────────────────────

Deno.test('buildScheduleModel — pricing visible by default surfaces prices + totals', () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living Room',
        lines: [
          line({ lineTotalCents: 120000, clientUnitCents: 120000 }),
          line({ name: 'Rug', lineTotalCents: 80000, clientUnitCents: 80000 }),
        ],
      },
    ],
    {}, // visibility undefined → every flag true
  );

  assertEquals(model.showPricing, true);
  assertEquals(model.showSupplier, true);

  const [l0, l1] = model.sections[0].lines;
  assertEquals(l0.clientPriceCents, 120000);
  assertEquals(l1.clientPriceCents, 80000);
  assertEquals(l0.supplierName, 'Acme Furnishings');

  // subtotal + document total both equal Σ lineTotalCents
  assertEquals(model.sections[0].subtotalCents, 200000);
  assertEquals(model.documentTotalCents, 200000);
});

// ─── buildScheduleModel — pricing off strips prices AND totals ───────────────

Deno.test('buildScheduleModel — pricing off strips every price and every total', () => {
  const model = buildScheduleModel(
    [
      { roomName: 'Living Room', lines: [line(), line({ name: 'Rug' })] },
      { roomName: 'Bedroom', lines: [line({ name: 'Bed' })] },
    ],
    { pricing: false },
  );

  assertEquals(model.showPricing, false);
  assertEquals(model.documentTotalCents, undefined);

  for (const section of model.sections) {
    assertEquals(section.subtotalCents, undefined);
    for (const l of section.lines) {
      assertEquals(l.clientPriceCents, undefined);
      // Key ABSENT, not merely undefined-valued.
      assertEquals('clientPriceCents' in l, false);
    }
  }
});

// ─── buildScheduleModel — supplier off, pricing unaffected ───────────────────

Deno.test('buildScheduleModel — supplier off strips supplier, keeps pricing', () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living Room',
        lines: [line(), line({ name: 'Rug', lineTotalCents: 50000, clientUnitCents: 50000 })],
      },
    ],
    { supplierIdentity: false },
  );

  assertEquals(model.showSupplier, false);
  for (const l of model.sections[0].lines) {
    assertEquals(l.supplierName, undefined);
    assertEquals('supplierName' in l, false);
  }

  // Pricing entirely unaffected by the supplier flag.
  assertEquals(model.showPricing, true);
  assertEquals(model.sections[0].lines[0].clientPriceCents, 120000);
  assertEquals(model.documentTotalCents, 170000);
});

// ─── money-never-trade — structural, not a filter ───────────────────────────

Deno.test('SpecLine/SpecSection/SpecScheduleModel carry no trade/markup/margin key', () => {
  const model = buildScheduleModel([{ roomName: 'Living Room', lines: [line()] }], {});
  const l = model.sections[0].lines[0];

  // The obvious offender never exists.
  assertEquals(Object.keys(l).includes('tradeCents'), false);

  const forbidden = ['trade', 'markup', 'margin'];
  const scan = (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      for (const bad of forbidden) {
        assertEquals(lower.includes(bad), false);
      }
    }
  };
  scan(l as unknown as Record<string, unknown>);
  scan(model.sections[0] as unknown as Record<string, unknown>);
  scan(model as unknown as Record<string, unknown>);

  // Sanity: with pricing on, the CLIENT price key IS present.
  assertEquals('clientPriceCents' in l, true);
});

// ─── verifiedCount / totalCount ──────────────────────────────────────────────

Deno.test('buildScheduleModel — verifiedCount / totalCount tally across sections', () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living Room',
        lines: [
          line({ recordVerified: true }),
          line({ recordVerified: false }),
          line({ recordVerified: true }),
        ],
      },
      {
        roomName: 'Bedroom',
        lines: [line({ recordVerified: false }), line({ recordVerified: true })],
      },
    ],
    {},
  );

  assertEquals(model.totalCount, 5);
  assertEquals(model.verifiedCount, 3);
});

// ─── computeRecordPct — mirrors piece-progress.ts ───────────────────────────

Deno.test('computeRecordPct — fully populated + taught eye = 100', () => {
  const pct = computeRecordPct(
    {
      name: 'Eames Lounge',
      brand: 'Herman Miller',
      dimensions: { width: '32', height: '33', depth: '32', unit: 'in' },
      materials: ['leather', 'plywood'],
      price_retail: 700000,
      price_trade: 490000,
      images: ['https://cdn.example.com/eames.jpg'],
    },
    2,
  );
  assertEquals(pct, 100);
});

Deno.test('computeRecordPct — empty product row = 0', () => {
  assertEquals(computeRecordPct({}, 0), 0);
});

Deno.test('computeRecordPct — no linked product = null', () => {
  assertEquals(computeRecordPct(null, 0), null);
});

Deno.test('computeRecordPct — identity + folio only, untaught = 33', () => {
  // fill = [0.5 (identity) + 0 (piece), 0 (commerce) + 0.5 (folio), 0 (eye)]
  // => round((1/3) * 100) = 33
  const pct = computeRecordPct(
    { name: 'Side Table', brand: 'CB2', images: ['https://cdn.example.com/t.jpg'] },
    0,
  );
  assertEquals(pct, 33);
});

// ─── buildItemModel — visibility gating ──────────────────────────────────────

Deno.test('buildItemModel — visibility gates price, source host, lead time', () => {
  const open = buildItemModel(itemBase, {});
  assertEquals(open.clientPriceCents, 700000);
  assertEquals(open.provenance.sourceHost, 'www.hermanmiller.com');
  assertEquals(open.leadLabel, '6–8 wks');

  const locked = buildItemModel(itemBase, {
    pricing: false,
    sourceUrls: false,
    leadTimes: false,
  });
  assertEquals('clientPriceCents' in locked, false);
  assertEquals(locked.provenance.sourceHost, null);
  assertEquals(locked.leadLabel, null);
  // brand / capturedBy / recordPct are NOT gated.
  assertEquals(locked.provenance.brand, 'Herman Miller');
  assertEquals(locked.provenance.capturedBy, 'Leah Chen');
  assertEquals(locked.provenance.recordPct, 100);
});

Deno.test('buildItemModel — drops empty-valued custom fields', () => {
  const model = buildItemModel(
    {
      ...itemBase,
      customFields: [
        { label: 'A', value: 'x' },
        { label: 'B', value: '   ' },
        { label: 'C', value: '' },
      ],
    },
    {},
  );
  assertEquals(model.customFields.length, 1);
  assertEquals(model.customFields[0].label, 'A');
});

// ─── Smoke — real PDF bytes (needs react-pdf from npm) ───────────────────────

Deno.test('renderSpecSchedulePdf — produces a valid PDF', async () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living Room',
        lines: [line(), line({ name: 'Rug', code: 'FF-02', recordVerified: true })],
      },
    ],
    {},
  );
  const bytes = await renderSpecSchedulePdf(model, {
    studioName: 'Studio Patina',
    projectName: 'Maple Residence',
    title: 'Specification',
  });
  assertEquals(bytes instanceof Uint8Array, true);
  assertEquals(bytes.length > 1000, true);
});

Deno.test('renderSpecItemPdf — produces a valid PDF', async () => {
  const model = buildItemModel(itemBase, {});
  const bytes = await renderSpecItemPdf(model);
  assertEquals(bytes instanceof Uint8Array, true);
  assertEquals(bytes.length > 1000, true);
});
