// deno-lint-ignore-file no-import-prefix
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
  buildBoardCompositionModel,
  buildBoardModel,
  buildItemModel,
  buildScheduleModel,
  computeRecordPct,
  renderBoardCompositionPdf,
  renderBoardPdf,
  renderSpecItemPdf,
  renderSpecSchedulePdf,
  type SpecBoardCompositionInput,
  type SpecBoardCompositionPinInput,
  type SpecBoardInput,
  type SpecItemInput,
  type SpecLineInput,
} from './spec-pdf.ts';

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
  assertEquals(model.documentTotalCents, 170000);
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

Deno.test('renderBoardPdf smoke — real bytes', async () => {
  // Drop image urls so the render doesn't fetch at test time.
  const input = boardInput({
    tiles: [
      {
        type: 'product',
        name: 'Walnut sectional',
        imageUrl: null,
        note: null,
        swatches: [],
        priceCents: 480000,
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
    model.pins.find((pin) => pin.type === 'image')!.key,
    'snapshot:2',
  );
  assertEquals(
    model.pins.find((pin) => pin.type === 'image')!.logicalBox.height,
    160,
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

Deno.test('renderBoardCompositionPdf smoke — one landscape Letter page', async () => {
  const model = buildBoardCompositionModel(compositionInput(), {});
  const bytes = await renderBoardCompositionPdf(model);
  assertEquals(bytes instanceof Uint8Array, true);
  assertEquals(bytes.length > 1000, true);
  const pdfText = new TextDecoder('latin1').decode(bytes);
  assertEquals((pdfText.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assertEquals(pdfText.includes('/MediaBox [0 0 792 612]'), true);
});
