/**
 * Field-visibility audit (capture-launch W0-D1).
 *
 * For the DWR and 1stDibs fixtures, runs the real extractor, builds a draft
 * with draftFromExtraction (the same adapter the live panel uses), and mounts
 * RecordScreen — the C2 "captured & enriched" screen (RecordRegion +
 * TradeRegion + InsightRegion + RouteCommitRegion) — under CaptureProvider
 * with that draft, exactly as the panel would after a real extraction. Counts
 * which extracted fields actually surface as a visible input/value in the
 * rendered DOM, and how many <select>/<input> elements the route region
 * exposes. No correctness assertions — this is a survey, written to
 * artifacts/capture-launch-2026-08-29/field-visibility.json.
 *
 * supabase is mocked (src/__tests__/mocks/supabase.ts) since RouteCommitRegion
 * pulls projects/styles via useReferenceData(); chrome.* is mocked globally
 * in src/__tests__/setup.ts. FFESlotPicker and useReferenceData are NOT
 * mocked away — the whole point here is to count what they really render.
 */
import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import type { ExtractedProductData } from '@patina/shared';

vi.mock('../../lib/supabase', async () => {
  const { createMockSupabase } = await import('../mocks/supabase');
  const { supabase } = createMockSupabase();
  return { supabase, PORTAL_URL: 'https://app.patina.cloud' };
});

import { RecordScreen } from '../../screens/RecordScreen';
import { CaptureProvider } from '../../state/CaptureProvider';
import { draftFromExtraction } from '../../state/draft';
import { initialCaptureState } from '../../state/reducer';
import { extractProductData } from '../../lib/extraction';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const REPORT_DIR = path.join(__dirname, '../../../../../artifacts/capture-launch-2026-08-29');
const REPORT_PATH = path.join(REPORT_DIR, 'field-visibility.json');

interface FixtureCase {
  file: string;
  url: string;
}

const CASES: FixtureCase[] = [
  {
    file: 'dwr.com.eames-lounge-chair-and-ottoman.html',
    url: 'https://www.dwr.com/living-lounge-chairs/eames-lounge-chair-and-ottoman/5667.html?lang=en_US',
  },
  {
    file: '1stdibs.com.rare-1964-eames-lounge-chair.html',
    url: 'https://www.1stdibs.com/furniture/seating/lounge-chairs/rare-1964-rosewood-herman-miller-eames-lounge-chair-ottoman-w-original-receipt/id-f_48117292/',
  },
];

/** Extract with the same jsdom-swap approach as extraction/fixtures.test.ts. */
async function extractFromFixture(file: string, url: string): Promise<ExtractedProductData> {
  const html = readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return (this as HTMLElement).textContent ?? '';
    },
  });
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  // Swap in the fixture DOM for the duration of extraction.
  globalThis.document = dom.window.document;
  // @ts-expect-error -- jsdom's Window type isn't assignable to the DOM
  // lib's Window type, but this is the same object shape at runtime.
  globalThis.window = dom.window;
  try {
    return await extractProductData(url);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
}

interface FieldVisibilityEntry {
  file: string;
  url: string;
  extracted: {
    name: boolean;
    price: boolean;
    description: boolean;
    manufacturer: string | null;
    dimensionFieldCount: number;
    materialsCount: number;
    colorsCount: number;
    finish: string | null;
    imagesCount: number;
  };
  visibleInDom: {
    name: boolean;
    price: boolean;
    description: boolean;
    brand: boolean;
    dimensions: boolean;
    materials: boolean;
    colors: boolean;
    finish: boolean;
    images: boolean;
  };
  routeRegion: {
    selectCount: number;
    inputCount: number;
  };
}

const report: FieldVisibilityEntry[] = [];

afterEach(cleanup);

describe('field visibility on the C2 record screen', () => {
  for (const { file, url } of CASES) {
    it(`shows which extracted fields are visible for ${file}`, async () => {
      const data = await extractFromFixture(file, url);
      const draft = draftFromExtraction(data);

      const state = initialCaptureState();
      state.nav.screen = 'C2';
      state.session = { status: 'signed-in', user: { id: 'user-1' } as never, workspaceId: null };
      state.draft = draft;

      const { container } = render(
        <CaptureProvider initial={state}>
          <RecordScreen />
        </CaptureProvider>
      );

      // Wait for the async spec-book-placement context load (chrome.storage)
      // to resolve so FFESlotPicker replaces the loading skeleton.
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Capture destination' })).toBeTruthy()
      );

      const inputs = Array.from(container.querySelectorAll('input'));
      const textareas = Array.from(container.querySelectorAll('textarea'));

      const nameInput = inputs.find((i) => i.value === (data.productName ?? ''));
      const priceValue = data.price ? (data.price.value / 100).toFixed(2) : '';
      const priceInput = inputs.find((i) => i.value === priceValue && priceValue !== '');
      const descriptionTextarea = textareas.find((t) => t.value === (data.description ?? ''));

      // draftFromExtraction always seeds manufacturer/retailer vendor slots
      // as { vendor: null } regardless of data.manufacturer (draft.ts) — so
      // "Brand" in RecordRegion, which only renders when
      // draft.manufacturer.vendor?.name ?? draft.retailer.vendor?.name is
      // truthy, can never render from a fresh extraction. Checked via the
      // "Brand" label itself (querySelector on bodyText for the
      // manufacturer's name string is NOT reliable here: real marketing
      // copy in the description textarea's rendered value routinely
      // mentions the retailer/brand by name, e.g. DWR's own description
      // reads "...at Design Within Reach.", which would false-positive a
      // plain substring check against data.manufacturer).
      const brandVisible = !!screen.queryByText('Brand');

      const dimensionFieldCount = data.dimensions
        ? Object.entries(data.dimensions).filter(
            ([k, v]) => k !== 'unit' && k !== 'raw' && v !== null && v !== undefined
          ).length
        : 0;

      const routeSection = screen.getByText('Route to').closest('section');
      const routeRegion = routeSection
        ? {
            selectCount: within(routeSection).getAllByRole('combobox').length,
            inputCount: routeSection.querySelectorAll('input').length,
          }
        : { selectCount: 0, inputCount: 0 };

      const entry: FieldVisibilityEntry = {
        file,
        url,
        extracted: {
          name: !!data.productName,
          price: !!data.price,
          description: !!data.description,
          manufacturer: data.manufacturer,
          dimensionFieldCount,
          materialsCount: data.materials?.length ?? 0,
          colorsCount: data.colors?.length ?? 0,
          finish: data.finish?.name ?? null,
          imagesCount: data.images?.length ?? 0,
        },
        visibleInDom: {
          name: !!nameInput,
          price: !!priceInput,
          description: !!descriptionTextarea,
          brand: brandVisible,
          // Dimensions, materials, colors, and finish have no rendered value
          // anywhere on C2: RecordRegion renders inputs only for
          // name/price/description plus a plain-text Brand row; TradeRegion
          // only echoes price; InsightRegion and RouteCommitRegion don't
          // touch these fields at all. The only DOM trace of them is
          // InsightRegion's flagged-field-key summary line ("materials,
          // colors, finish, dimensions need a look") when the field is
          // missing — that's the field's *key name* appearing as a flag
          // label, not its extracted *value*, so it does not count as
          // "visible" here. Hard-coded false rather than pattern-matched:
          // a substring scan against bodyText produced false positives in
          // testing (real vendor description copy incidentally contains
          // words that also appear as material/color names or the brand
          // name — e.g. DWR's own description text reads "...at Design
          // Within Reach.", and 1stDibs' product name contains "Rosewood",
          // one of its own extracted materials).
          dimensions: false,
          materials: false,
          colors: false,
          finish: false,
          images: container.querySelectorAll('img[src]').length > 0,
        },
        routeRegion,
      };
      report.push(entry);

      // Survey only — no correctness assertions. Confirms the screen mounted
      // and the route region was reachable, which is what makes the counts
      // above meaningful.
      expect(container.querySelector('input')).toBeTruthy();
      expect(routeSection).toBeTruthy();
    });
  }
});

// Gated: `pnpm test` must never dirty tracked files. Regenerate the report
// with `CAPTURE_REPORT=1 pnpm --filter @patina/extension test -- field-visibility`.
afterAll(() => {
  if (process.env.CAPTURE_REPORT !== '1') return;
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        lane: 'capture-launch/w0-d1',
        notes: [
          'RecordScreen (RecordRegion + TradeRegion + InsightRegion + RouteCommitRegion) mounted ' +
            'directly under <CaptureProvider initial={...}> in state C2 — the same seam ' +
            'src/__tests__/state/CaptureProvider.test.tsx and ' +
            'src/__tests__/spec-books/route-commit-ga.test.tsx use — rather than through ' +
            'PanelShell, which pulls in useCaptureController()/useSettingsSync() side effects ' +
            'not needed for this survey.',
          'FFESlotPicker and useReferenceData were left real (not mocked away) so the route ' +
            'region select/input counts reflect actual render output; supabase is mocked via ' +
            'src/__tests__/mocks/supabase.ts so those queries resolve to empty projects/styles ' +
            'without a network call.',
        ],
        cases: report,
      },
      null,
      2
    )
  );
});
