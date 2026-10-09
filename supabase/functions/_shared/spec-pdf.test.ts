// deno-lint-ignore-file no-import-prefix
// Deno tests for the shared spec-sheet builder.
//
// Run (npm specifiers need auto node-modules resolution in this repo — a
// node_modules dir from pnpm puts Deno in manual mode otherwise):
//   deno test --allow-env --node-modules-dir=auto \
//     supabase/functions/_shared/spec-pdf.test.ts
//
// The PURE-MODEL tests (buildScheduleModel / buildItemModel / computeRecordPct)
// prove the money-visibility gating without parsing PDF bytes. The two SMOKE
// tests render real PDFs and need react-pdf from npm; if npm can't be fetched
// they fail to load, but the pure-model tests above them still stand as the
// proof of the gating logic.

import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { getDocument } from 'npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs';
import {
  buildBoardCompositionModel,
  buildBoardModel,
  buildItemModel,
  buildScheduleModel,
  computeRecordPct,
  quantityText,
  renderBoardCompositionPdf,
  renderBoardPdf,
  renderSpecItemPdf,
  renderSpecSchedulePdf,
  SCHEDULE_COLUMN_GAP,
  SCHEDULE_COLUMNS,
  SCHEDULE_ROW_WIDTH,
  scheduleCells,
  scheduleColumnKeys,
  type SpecBoardCompositionInput,
  type SpecBoardCompositionPinInput,
  type SpecBoardInput,
  type SpecItemInput,
  type SpecLineInput,
  wholeWordParts,
} from './spec-pdf.ts';
import { pdfText } from './pdf-text.ts';

const compositionPinTypeWitness: SpecBoardCompositionPinInput = {
  type: 'product',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  resolvedHeight: null,
  zIndex: 0,
  rotation: 0,
  imageDataUrl: null,
  imageRequested: false,
  name: null,
  vendorName: null,
  note: null,
  swatches: [],
  priceCents: null,
  sectionId: null,
};
const compositionPinCannotCarryTrade: SpecBoardCompositionPinInput = {
  ...compositionPinTypeWitness,
  // @ts-expect-error Composition inputs have no studio cost field.
  tradePriceCents: 100,
};
const compositionPinCannotCarryMarkup: SpecBoardCompositionPinInput = {
  ...compositionPinTypeWitness,
  // @ts-expect-error Composition inputs have no markup field.
  markupPercent: 25,
};
const compositionPinCannotCarryMargin: SpecBoardCompositionPinInput = {
  ...compositionPinTypeWitness,
  // @ts-expect-error Composition inputs have no margin field.
  marginPercent: 20,
};
void compositionPinCannotCarryTrade;
void compositionPinCannotCarryMarkup;
void compositionPinCannotCarryMargin;

interface RenderedPdfText {
  str: string;
  transform: number[];
}

async function inspectRenderedPdf(bytes: Uint8Array): Promise<{
  pageCount: number;
  width: number;
  height: number;
  text: RenderedPdfText[];
}> {
  const pdf = await getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    return {
      pageCount: pdf.numPages,
      width: viewport.width,
      height: viewport.height,
      text: content.items.flatMap((item) =>
        'str' in item && item.str
          ? [{ str: item.str, transform: [...item.transform] }]
          : []
      ),
    };
  } finally {
    await pdf.destroy();
  }
}

function renderedText(
  pdf: Awaited<ReturnType<typeof inspectRenderedPdf>>,
  value: string,
): RenderedPdfText {
  const match = pdf.text.find((item) => item.str === value);
  assert(match, `Expected rendered PDF text ${JSON.stringify(value)}`);
  return match;
}

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
  assertEquals(model.sections[0].subtotal, { currency: 'USD', cents: 200000 });
  assertEquals(model.documentTotal, { currency: 'USD', cents: 200000 });
  // A line with no currency reads as USD.
  assertEquals(l0.currency, 'USD');
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
  assertEquals('documentTotal' in model, false);

  for (const section of model.sections) {
    assertEquals('subtotal' in section, false);
    for (const l of section.lines) {
      assertEquals(l.clientPriceCents, undefined);
      // Key ABSENT, not merely undefined-valued.
      assertEquals('clientPriceCents' in l, false);
      assertEquals('currency' in l, false);
    }
  }
});

// ─── buildScheduleModel — supplier off, pricing unaffected ───────────────────

Deno.test('buildScheduleModel — supplier off strips supplier, keeps pricing', () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living Room',
        lines: [
          line(),
          line({ name: 'Rug', lineTotalCents: 50000, clientUnitCents: 50000 }),
        ],
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
  assertEquals(model.documentTotal, { currency: 'USD', cents: 170000 });
});

// ─── Currency: a total never adds across currencies (SQ-212) ─────────────────

Deno.test('buildScheduleModel — each price keeps its own currency; one-currency totals stay sums', () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living Room',
        lines: [
          line({ currency: 'EUR' }),
          line({ name: 'Rug', currency: 'eur', lineTotalCents: 80000, clientUnitCents: 80000 }),
        ],
      },
    ],
    {},
  );
  assertEquals(model.sections[0].lines.map((l) => l.currency), ['EUR', 'EUR']);
  assertEquals(model.sections[0].subtotal, { currency: 'EUR', cents: 200000 });
  assertEquals(model.documentTotal, { currency: 'EUR', cents: 200000 });
});

Deno.test('buildScheduleModel — mixed currencies refuse the total and list the codes, sorted', () => {
  const model = buildScheduleModel(
    [
      { roomName: 'Living Room', lines: [line({ currency: 'USD' }), line({ name: 'Rug' })] },
      {
        roomName: 'Bedroom',
        lines: [
          line({ name: 'Bed', currency: 'GBP' }),
          line({ name: 'Lamp', currency: 'EUR' }),
          // A null amount adds nothing and names no currency.
          line({ name: 'TBD', currency: 'JPY', lineTotalCents: null, clientUnitCents: null }),
        ],
      },
    ],
    {},
  );
  // One all-USD room still totals (missing currency = USD).
  assertEquals(model.sections[0].subtotal, { currency: 'USD', cents: 240000 });
  assertEquals(model.sections[1].subtotal, { mixed: ['EUR', 'GBP'] });
  assertEquals(model.documentTotal, { mixed: ['EUR', 'GBP', 'USD'] });
});

// All-USD output is byte-for-byte what it was before SQ-212. The hashes were
// taken from main @ d0254134a (pre-change) rendering these exact inputs. The
// only masked bytes are react-pdf's wall-clock CreationDate and the trailer
// ID derived from it; they differ on every render, before and after.
async function normalizedPdfSha256(bytes: Uint8Array): Promise<string> {
  const text = new TextDecoder('latin1').decode(bytes)
    .replace(/\(D:[^)]*\)/g, '(D:)')
    .replace(/\/ID \[<[0-9a-f]+> <[0-9a-f]+>\]/gi, '/ID []');
  const digest = await crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(text, (c) => c.charCodeAt(0)),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const usdGoldenSections = [
  {
    roomName: 'Living Room',
    lines: [
      line(),
      line({ name: 'Rug', clientUnitCents: 80050, lineTotalCents: 160100, quantity: 2 }),
    ],
  },
  {
    roomName: 'Bedroom',
    lines: [
      line({ name: 'Bed', clientUnitCents: null, lineTotalCents: null }),
      line({ name: 'Lamp', clientUnitCents: 999, lineTotalCents: 999 }),
    ],
  },
];
const goldenHeader = {
  studioName: 'Studio Patina',
  projectName: 'Maple Residence',
  title: 'Specification',
};

// The schedule hashes were re-pinned for T-60c F14, whose fixed-width columns
// and gaps move every cell on purpose. The pre-SQ-212 pins were
// 517e48fd… (pricing on) and ecaa5418… (pricing off).
Deno.test('all-USD schedule PDF is byte-for-byte its pinned output', async () => {
  for (
    const [visibility, expected] of [
      [{}, '9e35fda92237bc680f936708f7cead151f86bf3dc9d8b777f05f9f409497ce82'],
      [{ pricing: false }, '0751ee407b22a5da5e3d22b5bbb7e1d793f10620effbe3b02204de83e16ffe09'],
    ] as const
  ) {
    const bytes = await renderSpecSchedulePdf(
      buildScheduleModel(usdGoldenSections, visibility),
      goldenHeader,
    );
    assertEquals(await normalizedPdfSha256(bytes), expected);
  }
});

Deno.test('all-USD item PDF is byte-for-byte the pre-SQ-212 output', async () => {
  const model = buildItemModel(
    {
      studioName: 'Studio Patina',
      projectName: 'Maple Residence',
      name: 'Eames Lounge Chair',
      code: 'FF-01',
      category: 'Seating',
      roomName: 'Living Room',
      quantity: 2,
      leadLabel: '6–8 wks',
      itemType: 'fixed',
      specs: 'Black leather.',
      customFields: [],
      sourceUrl: null,
      capturedBy: null,
      recordPct: null,
      brand: null,
      imageUrls: [],
      clientUnitCents: 700000,
    },
    {},
  );
  assertEquals(
    await normalizedPdfSha256(await renderSpecItemPdf(model)),
    'a996ffe1bee685e1d3779dff4a3e85f6772d510f41008bc27febbc710b729cd3',
  );
});

Deno.test('mixed-currency schedule PDF prints each price in its currency and never a sum', async () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living Room',
        lines: [
          line({ currency: 'EUR' }),
          line({ name: 'Rug', clientUnitCents: 80000, lineTotalCents: 80000 }),
        ],
      },
    ],
    {},
  );
  const pdf = await inspectRenderedPdf(await renderSpecSchedulePdf(model, goldenHeader));
  const strings = pdf.text.map((t) => t.str);
  renderedText(pdf, '€1,200.00');
  renderedText(pdf, '$800.00');
  // Section subtotal and document total both refuse the sum (the note may
  // wrap across text runs, so compare the joined page text).
  const joined = strings.join(' ').replace(/\s+/g, ' ');
  assertEquals(
    joined.split('Mixed currencies — total unavailable (EUR, USD)').length - 1,
    2,
    `Expected the mixed note twice, got ${JSON.stringify(strings)}`,
  );
  for (const sum of ['$2,000.00', '€2,000.00', '2,000.00']) {
    assertEquals(strings.some((s) => s.includes(sum)), false, `rendered a cross-currency sum ${sum}`);
  }
});

Deno.test('item PDF prints the client price in the row currency', async () => {
  const model = buildItemModel({ ...itemBase, currency: 'GBP' }, {});
  assertEquals(model.currency, 'GBP');
  const pdf = await inspectRenderedPdf(await renderSpecItemPdf(model));
  renderedText(pdf, '£7,000.00');
});

// ─── Unit, LABOR, also-in (US-21 T-61 F3; wording = spec-book-render) ───────

/** The page's text runs joined, as a narrow cell wraps its words across runs. */
const joinedText = (pdf: Awaited<ReturnType<typeof inspectRenderedPdf>>) =>
  pdf.text.map((t) => t.str).join(' ').replace(/\s+/g, ' ');

const FLOOR_PLACEMENTS = [
  { roomName: 'Living', quantity: 320, areaNote: 'Back entry' },
  { roomName: 'Hall', quantity: 120 },
  { roomName: 'Dining', quantity: 180 },
];

// ── T-60b: counted units (roll, box, hour, lot) read plural for any
// quantity but 1 ────────────────────────────────────────────────────────

Deno.test('quantityText pluralizes counted units but leaves measures alone', () => {
  assertEquals(quantityText(9, 'roll'), '9 rolls');
  assertEquals(quantityText(1, 'roll'), '1 roll');
  assertEquals(quantityText(913, 'sq_ft'), '913 sq ft');
});

Deno.test('a goods line in one room counted each gains no key', () => {
  const model = buildScheduleModel([{ roomName: 'Living Room', lines: [line({ unit: 'each' })] }], {});
  const l = model.sections[0].lines[0];
  assertEquals('unit' in l || 'labor' in l || 'alsoIn' in l, false);
});

Deno.test('schedule PDF prints the unit, the LABOR mark and the also-in line', async () => {
  const model = buildScheduleModel(
    [
      {
        roomName: 'Living',
        lines: [
          line({
            code: 'F1',
            name: 'Oak floor',
            quantity: 913,
            unit: 'sq_ft',
            roomName: 'Living',
            placements: FLOOR_PLACEMENTS,
          }),
          line({ code: 'F1a', name: 'Floor install', quantity: 913, unit: 'sq_ft', lineKind: 'labor' }),
        ],
      },
    ],
    {},
  );
  const [floor, labor] = model.sections[0].lines;
  assertEquals(floor.alsoIn, 'ALSO IN HALL · DINING · 320 SQ FT HERE · BACK ENTRY');
  assertEquals(labor.labor, true);
  const pdf = await inspectRenderedPdf(await renderSpecSchedulePdf(model, goldenHeader));
  const joined = joinedText(pdf);
  for (const words of ['913 sq ft', 'F1a · LABOR', 'ALSO IN HALL · DINING · 320 SQ FT HERE · BACK ENTRY']) {
    assert(joined.includes(words), `Expected ${JSON.stringify(words)} in ${JSON.stringify(joined)}`);
  }
  assertEquals(joined.includes('F1 · LABOR'), false);
});

// ─── T-60c: primes and columns ───────────────────────────────────────────────

Deno.test('F13: a dimension in a line name prints as feet and inches, and the data is unchanged', () => {
  const name = 'Runner, 2′6″ × 10′';
  const model = buildScheduleModel([{ roomName: 'Hall', lines: [line({ name })] }], {});
  const [runner] = model.sections[0].lines;
  assertEquals(runner.name, name);
  const item = scheduleCells(model, runner).find((cell) => cell.key === 'item')!;
  assertEquals(item.text, name);
  assertEquals(pdfText(item.text), `Runner, 2'6" × 10'`);
});

// Helvetica's AFM advance widths, in 1/1000 em, for what a USD figure prints.
function helveticaMoneyWidth(text: string, fontSize: number): number {
  const em = [...text].reduce((sum, ch) => sum + (ch === ',' || ch === '.' ? 278 : 556), 0);
  return (em * fontSize) / 1000;
}

Deno.test('F14: a long maker name next to a money cell keeps its own column; the money never wraps', () => {
  const maker = 'Nordiska Hantverkshuset Snickeri och Möbelverkstad Aktiebolag';
  const model = buildScheduleModel(
    [{
      roomName: 'Living Room',
      lines: [
        line({
          name: 'White oak floor, satin Bona finish',
          quantity: 830,
          unit: 'sq_ft',
          clientUnitCents: 1150,
          lineTotalCents: 954500,
          supplierName: maker,
        }),
      ],
    }],
    {},
  );
  const cells = scheduleCells(model, model.sections[0].lines[0]);
  assertEquals(cells.map((cell) => cell.key), ['code', 'item', 'qty', 'lead', 'client', 'supplier']);
  const client = cells.find((cell) => cell.key === 'client')!;
  const supplier = cells.find((cell) => cell.key === 'supplier')!;
  assertEquals(client.text, '$11.50');
  // The maker is one cell, whole, and the text boundary leaves it whole.
  assertEquals(supplier.text, maker);
  assertEquals(pdfText(supplier.text), maker);
  // The money cell has no break opportunity, a fixed width that never
  // shrinks, and room for a seven-figure price at the 10pt body size.
  assertEquals(/[ \-]/.test(client.text), false);
  const money = SCHEDULE_COLUMNS.client;
  assert(money.width !== undefined && money.grow === undefined);
  assert(money.width >= helveticaMoneyWidth('$9,999,999.99', 10));
  // Supplier takes what is left after the gap, never the money column's space.
  assertEquals(SCHEDULE_COLUMNS.supplier.width, undefined);
  assert(SCHEDULE_COLUMN_GAP > 0);
});

Deno.test('F14: every visible column set fits the LETTER row with a gap between columns', () => {
  for (
    const visibility of [{}, { pricing: false }, { supplierIdentity: false }, {
      pricing: false,
      supplierIdentity: false,
    }]
  ) {
    const keys = scheduleColumnKeys(buildScheduleModel([], visibility));
    const fixed = keys.reduce((sum, key) => sum + (SCHEDULE_COLUMNS[key].width ?? 0), 0);
    const grow = keys.reduce((sum, key) => sum + (SCHEDULE_COLUMNS[key].grow ?? 0), 0);
    const left = SCHEDULE_ROW_WIDTH - fixed - SCHEDULE_COLUMN_GAP * (keys.length - 1);
    // The Item column keeps at least 120pt for a name.
    const itemWidth = (left * SCHEDULE_COLUMNS.item.grow!) / grow;
    assert(itemWidth >= 120, `${JSON.stringify(visibility)}: Item is ${itemWidth}pt`);
  }
});

Deno.test('F14: the hyphenation callback returns each word whole and splits a run of spaces', () => {
  assertEquals(wholeWordParts('finish'), ['finish']);
  assertEquals(wholeWordParts('Möbelverkstad'), ['Möbelverkstad']);
  assertEquals(wholeWordParts(' '), [' ']);
  assertEquals(wholeWordParts('  '), [' ', ' ']);
});

Deno.test('item PDF prints Quantity with its unit, LABOR and the also-in line', async () => {
  const model = buildItemModel(
    {
      ...itemBase,
      code: 'F1',
      roomName: 'Living',
      quantity: 913,
      unit: 'sq_ft',
      lineKind: 'labor',
      placements: FLOOR_PLACEMENTS,
    },
    {},
  );
  const pdf = await inspectRenderedPdf(await renderSpecItemPdf(model));
  const joined = joinedText(pdf);
  for (const words of ['913 sq ft', 'F1 · LABOR', 'ALSO IN HALL · DINING · 320 SQ FT HERE · BACK ENTRY']) {
    assert(joined.includes(words), `Expected ${JSON.stringify(words)} in ${JSON.stringify(joined)}`);
  }
});

// ─── money-never-trade — structural, not a filter ───────────────────────────

Deno.test('SpecLine/SpecSection/SpecScheduleModel carry no trade/markup/margin key', () => {
  const model = buildScheduleModel([{
    roomName: 'Living Room',
    lines: [line()],
  }], {});
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
        lines: [
          line({ recordVerified: false }),
          line({ recordVerified: true }),
        ],
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
    {
      name: 'Side Table',
      brand: 'CB2',
      images: ['https://cdn.example.com/t.jpg'],
    },
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
        lines: [
          line(),
          line({ name: 'Rug', code: 'FF-02', recordVerified: true }),
        ],
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

// ─── Board model (B3) ─────────────────────────────────────────────────────────

function boardInput(overrides: Partial<SpecBoardInput> = {}): SpecBoardInput {
  return {
    studioName: 'Studio Patina',
    projectName: 'Maple Residence',
    boardName: 'Living Room',
    sections: [
      { id: 'sofa-wall', name: 'Sofa wall' },
      { id: 'reading-nook', name: 'Reading nook' },
    ],
    tiles: [
      {
        type: 'product',
        name: 'Walnut sectional',
        imageUrl: 'https://cdn.example.com/sofa.jpg',
        note: null,
        swatches: [],
        priceCents: 480000,
        sectionId: 'sofa-wall',
      },
      {
        type: 'note',
        name: null,
        imageUrl: null,
        note: 'Keep the palette warm',
        swatches: [],
        priceCents: null,
        sectionId: 'reading-nook',
      },
      {
        type: 'image',
        name: null,
        imageUrl: 'https://cdn.example.com/mood.jpg',
        note: null,
        swatches: [],
        priceCents: null,
        sectionId: null, // unsectioned
      },
    ],
    ...overrides,
  };
}

Deno.test('board model: pricing on → product tile carries client price, no trade key', () => {
  const model = buildBoardModel(boardInput(), { pricing: true });
  const forbidden = ['trade', 'markup', 'margin'];
  const scan = (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      for (const bad of forbidden) assertEquals(lower.includes(bad), false);
    }
  };
  // Every tile + section is scanned; the money invariant is structural.
  for (const section of model.sections) {
    scan(section as unknown as Record<string, unknown>);
    for (const tile of section.tiles) {
      scan(tile as unknown as Record<string, unknown>);
    }
  }
  scan(model as unknown as Record<string, unknown>);

  const sofaTile = model.sections.find((s) => s.name === 'Sofa wall')!.tiles[0];
  assertEquals('clientPriceCents' in sofaTile, true);
  assertEquals(sofaTile.clientPriceCents, 480000);
});

Deno.test('board model: pricing off → client price key ABSENT (not undefined)', () => {
  const model = buildBoardModel(boardInput(), { pricing: false });
  const sofaTile = model.sections.find((s) => s.name === 'Sofa wall')!.tiles[0];
  assertEquals('clientPriceCents' in sofaTile, false);
});

Deno.test('board model: non-product tiles never carry a price even with pricing on', () => {
  const model = buildBoardModel(boardInput(), { pricing: true });
  const nook = model.sections.find((s) => s.name === 'Reading nook')!;
  assertEquals('clientPriceCents' in nook.tiles[0], false); // the note
  const unsectioned = model.sections.find((s) => s.name === 'Unsectioned')!;
  assertEquals('clientPriceCents' in unsectioned.tiles[0], false); // the image
});

Deno.test('board model: declared section order preserved, unsectioned LAST, empty declared sections dropped', () => {
  const model = buildBoardModel(boardInput(), {});
  assertEquals(
    model.sections.map((s) => s.name),
    ['Sofa wall', 'Reading nook', 'Unsectioned'],
  );
});

Deno.test('board model: a pin whose section_id is unknown falls into Unsectioned', () => {
  const input = boardInput({
    sections: [{ id: 'known', name: 'Known' }],
    tiles: [
      {
        type: 'product',
        name: 'Orphan',
        imageUrl: null,
        note: null,
        swatches: [],
        priceCents: 1000,
        sectionId: 'ghost-section',
      },
    ],
  });
  const model = buildBoardModel(input, { pricing: true });
  assertEquals(model.sections.length, 1);
  assertEquals(model.sections[0].name, 'Unsectioned');
});

Deno.test('renderBoardPdf keeps the legacy portrait, section-grouped tile grid', async () => {
  // Two pins in one section must remain side-by-side tiles. This is the legacy
  // `kind: board` signature, intentionally distinct from absolute composition.
  const input = boardInput({
    tiles: [
      {
        type: 'product',
        name: 'Legacy left tile',
        imageUrl: null,
        note: null,
        swatches: [],
        priceCents: 480000,
        sectionId: 'sofa-wall',
      },
      {
        type: 'capture',
        name: 'Legacy right tile',
        imageUrl: null,
        note: null,
        swatches: [],
        priceCents: null,
        sectionId: 'sofa-wall',
      },
    ],
  });
  const bytes = await renderBoardPdf(
    buildBoardModel(input, { pricing: true }),
    {
      studioName: 'Studio Patina',
      projectName: 'Maple Residence',
    },
  );
  assertEquals(bytes instanceof Uint8Array, true);
  assertEquals(bytes.length > 1000, true);
  const pdf = await inspectRenderedPdf(bytes);
  assertEquals(pdf.pageCount, 1);
  assertAlmostEquals(pdf.width, 612, 0.01);
  assertAlmostEquals(pdf.height, 792, 0.01);

  const section = renderedText(pdf, 'Sofa wall');
  const left = renderedText(pdf, 'Legacy left tile');
  const right = renderedText(pdf, 'Legacy right tile');
  assert(left.transform[4] < right.transform[4]);
  assert(right.transform[4] - left.transform[4] > 100);
  assertAlmostEquals(left.transform[5], right.transform[5], 0.5);
  assert(section.transform[5] > left.transform[5]);
});

// ─── Board composition model — persisted geometry on one landscape page ────

function compositionInput(
  overrides: Partial<SpecBoardCompositionInput> = {},
): SpecBoardCompositionInput {
  return {
    studioName: 'Studio Patina',
    projectName: 'Maple Residence',
    boardName: 'Composition study',
    canvasWidth: 1600,
    canvasHeight: 900,
    backgroundColor: '#F4F0EA',
    sections: [
      { id: 'main', name: 'Main grouping', color: '#C9B7A4' },
      { id: 'empty', name: 'Empty grouping' },
    ],
    pins: [
      {
        ...compositionPinTypeWitness,
        id: 'product-pin',
        type: 'product',
        x: 100,
        y: 100,
        zIndex: 5,
        rotation: 15,
        name: 'Sofa',
        vendorName: 'Patina Vendor',
        priceCents: 420000,
        sectionId: 'main',
      },
      {
        ...compositionPinTypeWitness,
        id: 'capture-pin',
        type: 'capture',
        x: 350,
        y: 100,
        zIndex: 1,
      },
      {
        ...compositionPinTypeWitness,
        type: 'image',
        x: 600,
        y: 100,
        width: 250,
        height: null,
        resolvedHeight: 160,
        zIndex: 2,
        imageRequested: true,
      },
      {
        ...compositionPinTypeWitness,
        id: 'palette-pin',
        type: 'palette',
        x: 100,
        y: 400,
        zIndex: 3,
        swatches: ['#112233', '#DDEEFF'],
      },
      {
        ...compositionPinTypeWitness,
        id: 'note-pin',
        type: 'note',
        x: 350,
        y: 400,
        zIndex: 4,
        note: 'Keep it warm.',
      },
      {
        ...compositionPinTypeWitness,
        id: 'scan-pin',
        type: 'room_scan',
        x: 600,
        y: 400,
        zIndex: 6,
      },
    ],
    ...overrides,
  };
}

Deno.test('board composition: landscape fit preserves canvas aspect and shared geometry', () => {
  const model = buildBoardCompositionModel(compositionInput(), {
    pricing: true,
  });
  assertEquals(model.canvas, {
    width: 1600,
    height: 900,
    backgroundColor: '#F4F0EA',
  });
  assertEquals(model.frame, {
    x: 24,
    y: 105.75,
    width: 744,
    height: 418.5,
    scale: 0.465,
  });
  assertEquals(model.sections.map((section) => section.name), [
    'Main grouping',
  ]);
  assertEquals(model.sections[0].memberKeys, ['product-pin']);
  assertEquals(
    model.pins.map((pin) => pin.type),
    ['capture', 'image', 'palette', 'note', 'product', 'room_scan'],
  );
  assertEquals(
    model.pins.find((pin) => pin.key === 'product-pin')!.rotation,
    15,
  );
  assertEquals(
    model.pins.find((pin) => pin.key === 'product-pin')!.pageBox,
    { x: 70.5, y: 152.25, width: 93, height: 93 },
  );
  assertEquals(
    model.pins.find((pin) => pin.type === 'image')!.key,
    'snapshot:2',
  );
  assertEquals(
    model.pins.find((pin) => pin.type === 'image')!.logicalBox.height,
    160,
  );
  assertEquals(
    model.pins.find((pin) => pin.type === 'image')!.pageBox,
    { x: 303, y: 152.25, width: 116.25, height: 74.4 },
  );
});

Deno.test('board composition: dense metadata warns but retains every pin', () => {
  const tinyPins = Array.from({ length: 61 }, (_, index) => ({
    ...compositionPinTypeWitness,
    id: `pin-${index}`,
    width: 10,
    height: 10,
    zIndex: index,
  }));
  const model = buildBoardCompositionModel(
    compositionInput({ pins: tinyPins }),
    {},
  );
  assertEquals(model.pins.length, 61);
  assertEquals(model.warnings.includes('dense_board'), true);
  assertEquals(model.warningMetadata.denseBoard?.pinLimitExceeded, true);
  assertEquals(
    model.warningMetadata.denseBoard?.pinsBelowTwentyPoints.length,
    61,
  );
});

Deno.test('board composition: image failures become labelled placeholders', () => {
  const model = buildBoardCompositionModel(compositionInput(), {});
  const image = model.pins.find((pin) => pin.type === 'image')!;
  assertEquals(image.placeholderLabel, 'Image unavailable');
  assertEquals(model.warnings.includes('image_placeholders'), true);
  assertEquals(model.warningMetadata.imagePlaceholders, ['snapshot:2']);
});

Deno.test('board composition: client price is gated and model has no internal money keys', () => {
  const open = buildBoardCompositionModel(compositionInput(), {
    pricing: true,
  });
  const locked = buildBoardCompositionModel(compositionInput(), {
    pricing: false,
  });
  assertEquals(
    open.pins.find((pin) => pin.key === 'product-pin')!.clientPriceCents,
    420000,
  );
  assertEquals(
    'clientPriceCents' in locked.pins.find((pin) => pin.key === 'product-pin')!,
    false,
  );

  const forbidden = ['trade', 'markup', 'margin'];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (
      const [key, child] of Object.entries(value as Record<string, unknown>)
    ) {
      forbidden.forEach((word) => assertEquals(key.toLowerCase().includes(word), false));
      visit(child);
    }
  };
  visit(open);
});

Deno.test('renderBoardCompositionPdf preserves absolute canonical geometry on landscape Letter', async () => {
  const model = buildBoardCompositionModel(compositionInput({
    canvasWidth: 1200,
    canvasHeight: 800,
    sections: [{ id: 'absolute', name: 'Absolute group', color: '#A66D4F' }],
    pins: [
      {
        ...compositionPinTypeWitness,
        id: 'absolute-left',
        x: 80,
        y: 90,
        width: 220,
        height: 220,
        zIndex: 1,
        name: 'Absolute left pin',
        sectionId: 'absolute',
      },
      {
        ...compositionPinTypeWitness,
        id: 'absolute-right',
        x: 900,
        y: 450,
        width: 180,
        height: 180,
        zIndex: 2,
        name: 'Absolute right pin',
        sectionId: 'absolute',
      },
      {
        ...compositionPinTypeWitness,
        id: 'absolute-rotated',
        x: 500,
        y: 200,
        width: 200,
        height: 200,
        zIndex: 3,
        rotation: 25,
        name: 'Rotated evidence',
      },
    ],
  }), {});
  const bytes = await renderBoardCompositionPdf(model);
  assertEquals(bytes instanceof Uint8Array, true);
  assertEquals(bytes.length > 1000, true);
  const pdf = await inspectRenderedPdf(bytes);
  assertEquals(pdf.pageCount, 1);
  assertAlmostEquals(pdf.width, 792, 0.01);
  assertAlmostEquals(pdf.height, 612, 0.01);

  const leftPin = model.pins.find((pin) => pin.key === 'absolute-left')!;
  const rightPin = model.pins.find((pin) => pin.key === 'absolute-right')!;
  assertEquals(leftPin.pageBox, { x: 73.6, y: 122.8, width: 136.4, height: 136.4 });
  assertEquals(rightPin.pageBox, { x: 582, y: 346, width: 111.6, height: 111.6 });

  const left = renderedText(pdf, 'Absolute left pin');
  const right = renderedText(pdf, 'Absolute right pin');
  assertAlmostEquals(
    right.transform[4] - left.transform[4],
    rightPin.pageBox.x - leftPin.pageBox.x,
    2,
  );
  // PDF text coordinates rise from the bottom, so the visually lower right pin
  // has the smaller text y. The gap proves persisted y was not tile-reflowed.
  assert(left.transform[5] - right.transform[5] > 150);

  const rotated = renderedText(pdf, 'Rotated evidence');
  assert(Math.abs(rotated.transform[1]) > 0.1 || Math.abs(rotated.transform[2]) > 0.1);
  renderedText(pdf, 'Absolute group');
});
