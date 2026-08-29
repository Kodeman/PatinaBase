/**
 * The letterhead ledger's two printings (W3-R4).
 *
 * The five full-label acts took ~616px out of a track that was starving the
 * title's, so the PRINT sheds every word the paper already says: the family
 * word (the household chip states it 20px above) at every width, and the
 * sharing act's tier word below 1180. What it must never shed is the
 * ACCESSIBLE NAME — a screen reader hears the whole sentence at both tiers.
 *
 * There is no separate MILESTONES instrument to fold: `SharingTierInstrument`
 * is ONE act whose label states its current tier, which is why the ≥1180 row
 * reads `SHARING · MILESTONES` and the 390 one reads `SHARING`.
 *
 * The mocking shape is letterhead-instruments-scan-door.test.tsx's, minus the
 * scan (no photo resolves, so the scan door never mounts and the row is the
 * four acts the budget was measured on).
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LetterheadInstruments } from './letterhead-instruments';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
      }),
    },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
  // No tier recorded — the instrument's own default is `milestone`, which is
  // the tier the W3-R4 row is specified against.
  useProjectV2: () => ({ data: {} }),
  useProjectRoster: () => ({ data: [{ id: 'r1' }, { id: 'r2' }] }),
  resolveCoverPhoto: () => null,
  publicUrlToPath: () => null,
}));

jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  // Call Sheet is a flag-gated instrument; the measured row includes it.
  useFeatureFlag: () => ({ value: true, isLoading: false }),
}));
jest.mock('./mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('./client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('./proposal-preview', () => ({ ProposalPreview: () => null }));

/** jsdom evaluates no media queries: this is how the tier is driven, the same
 *  shape as responsive-document-shell.test.tsx's `installMatchMedia`. */
function installTier(wide: boolean) {
  window.matchMedia = jest.fn(
    (query: string) =>
      ({
        matches: query.includes('1180px') ? wide : false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }) as unknown as MediaQueryList,
  );
}

function renderLedger() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <LetterheadInstruments
        projectId="proj-1"
        clientProfileId="client-1"
        clientName="The Ellsworths"
      />
    </QueryClientProvider>,
  );
}

/** What the ledger PRINTS, in order — the `.da-label` of each act. */
function printedLabels(): string[] {
  return Array.from(
    document.querySelectorAll('[data-action-region="letterhead-actions"] [data-action-key]'),
  ).map((el) => el.querySelector('.da-label')!.textContent!.trim());
}

describe('the letterhead ledger — what it prints at ≥1180', () => {
  beforeEach(() => installTier(true));

  it('prints MESSAGE · PREVIEW · SHARING · MILESTONES · CALL SHEET · N', () => {
    renderLedger();
    expect(printedLabels()).toEqual([
      'Message',
      'Preview',
      'Sharing · Milestones',
      'Call sheet · 2',
    ]);
  });

  it('never repeats the household chip’s family word', () => {
    renderLedger();
    const region = document.querySelector(
      '[data-action-region="letterhead-actions"]',
    )!;
    expect(region.textContent).not.toMatch(/Ellsworths/);
  });
});

describe('the letterhead ledger — what it prints below 1180', () => {
  beforeEach(() => installTier(false));

  it('prints MESSAGE · PREVIEW · SHARING · CALL SHEET · N — the tier word folds into the panel', () => {
    renderLedger();
    expect(printedLabels()).toEqual([
      'Message',
      'Preview',
      'Sharing',
      'Call sheet · 2',
    ]);
  });
});

describe('the letterhead ledger — the accessible names lose nothing', () => {
  for (const [tier, wide] of [
    ['≥1180', true],
    ['390', false],
  ] as const) {
    it(`keeps the full sentences at ${tier}`, () => {
      installTier(wide);
      renderLedger();

      expect(
        screen.getByRole('button', { name: 'Message The Ellsworths' }),
      ).toHaveAttribute('data-action-key', 'message-family');
      expect(
        screen.getByRole('button', { name: 'Preview as The Ellsworths' }),
      ).toHaveAttribute('data-action-key', 'preview-as-client');
      expect(
        screen.getByRole('button', { name: 'Sharing · Milestones' }),
      ).toHaveAttribute('data-action-key', 'sharing-settings');
    });
  }
});
