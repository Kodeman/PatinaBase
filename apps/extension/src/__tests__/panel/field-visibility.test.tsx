/**
 * Field-visibility audit (capture-launch W0-D1).
 *
 * For the DWR and 1stDibs fixtures, runs the real extractor, builds a draft
 * with draftFromExtraction (the same adapter the live panel uses), and mounts
 * RecordScreen — the C2 "captured & enriched" screen (RecordRegion +
 * InsightRegion + RouteCommitRegion) — under CaptureProvider
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

interface FieldFlags {
  name: boolean;
  price: boolean;
  description: boolean;
  brand: boolean;
  dimensions: boolean;
  materials: boolean;
  colors: boolean;
  finish: boolean;
  images: boolean;
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
    /** The field's row (Label + FieldBadge) is present in the DOM, whether
     * or not it currently carries a value — e.g. Dimensions/Materials/Finish
     * render this unconditionally, showing a "+ Add …" button in place of
     * the (hidden) inputs when the field is empty. */
    rowPresent: FieldFlags;
    /** The field's actual value is visible — a populated input, a chip, or
     * (for name/price/description/brand/images) the same check the W0
     * baseline used. False whenever the row shows its "+ Add …" fallback. */
    valueVisible: FieldFlags;
  };
  /** == valueVisible — kept as a flat alias so this stays comparable to the
   * W0 baseline report, whose single `visibleInDom` flag meant "value
   * visible", not merely "row present". */
  visibleFields: FieldFlags;
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

      // CL-R1 (capture-launch/w2-d4): RecordRegion now renders Dimensions,
      // Materials, and Finish rows between Price and Description. Each row
      // always renders its Label + FieldBadge (rowPresent); when the field
      // has a value the row shows its editable inputs (valueVisible),
      // otherwise a "+ Add …" button stands in for the (hidden) inputs.
      const dimensionsRowPresent = !!screen.queryByText('Dimensions');
      const materialsRowPresent = !!screen.queryByText('Materials');
      const finishRowPresent = !!screen.queryByText('Finish');

      // Populated-value checks: a real Width input mounted (dimensions), at
      // least one material chip's remove button (materials — generic
      // aria-label prefix rather than matching a specific material's name,
      // which risks a false positive against unrelated description copy),
      // and the Finish input carrying focusable content.
      const dimensionsValueVisible = !!screen.queryByLabelText('Width');
      const materialsValueVisible =
        container.querySelectorAll('button[aria-label^="Remove "]').length > 0;
      const finishValueVisible = !!screen.queryByLabelText('Finish');

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
          rowPresent: {
            name: !!screen.queryByText('Name'),
            price: !!screen.queryByText('Price'),
            description: !!screen.queryByText('Description'),
            brand: brandVisible,
            dimensions: dimensionsRowPresent,
            materials: materialsRowPresent,
            // Colors remain untouched by CL-R1 (not ruled) — RecordRegion
            // has no Colors row at all, present or otherwise.
            colors: false,
            finish: finishRowPresent,
            // The hero image slot (button + placeholder-or-<img>) always
            // renders, populated or not.
            images: true,
          },
          valueVisible: {
            name: !!nameInput,
            price: !!priceInput,
            description: !!descriptionTextarea,
            brand: brandVisible,
            // DWR's fixture extracts 0 dimension fields (dimensionFieldCount:
            // 0 below) — its Dimensions row shows "+ Add dimensions" rather
            // than populated inputs, so dimensionsValueVisible is false
            // there even though dimensionsRowPresent is true. 1stDibs
            // extracts 3. Both fixtures have materials, so
            // materialsValueVisible is true for both. Neither extracts a
            // finish, so finishValueVisible is false for both.
            dimensions: dimensionsValueVisible,
            materials: materialsValueVisible,
            colors: false,
            finish: finishValueVisible,
            images: container.querySelectorAll('img[src]').length > 0,
          },
        },
        visibleFields: {
          name: !!nameInput,
          price: !!priceInput,
          description: !!descriptionTextarea,
          brand: brandVisible,
          dimensions: dimensionsValueVisible,
          materials: materialsValueVisible,
          colors: false,
          finish: finishValueVisible,
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
        lane: 'capture-launch/w2-d4',
        notes: [
          'RecordScreen (RecordRegion + InsightRegion + RouteCommitRegion) mounted ' +
            'directly under <CaptureProvider initial={...}> in state C2 — the same seam ' +
            'src/__tests__/state/CaptureProvider.test.tsx and ' +
            'src/__tests__/spec-books/route-commit-ga.test.tsx use — rather than through ' +
            'PanelShell, which pulls in useCaptureController()/useSettingsSync() side effects ' +
            'not needed for this survey.',
          'FFESlotPicker and useReferenceData were left real (not mocked away) so the route ' +
            'region select/input counts reflect actual render output; supabase is mocked via ' +
            'src/__tests__/mocks/supabase.ts so those queries resolve to empty projects/styles ' +
            'without a network call.',
          'CL-R1 fix pass (2026-08-29): visibleInDom now splits rowPresent (the Label + ' +
            'FieldBadge is in the DOM, regardless of value) from valueVisible (a populated ' +
            'input/chip is in the DOM) for dimensions/materials/finish, since those rows can be ' +
            'present-but-empty (a "+ Add …" button standing in for the hidden inputs). ' +
            'visibleFields is kept as a flat alias of valueVisible so this stays comparable to ' +
            'the W0 baseline report, whose single visibleInDom flag meant "value visible".',
        ],
        cases: report,
      },
      null,
      2
    )
  );
});
