/**
 * The letterhead ledger's one printing (W3-R4, labels per W3-R5 §1/§2).
 *
 * The five full-label acts took ~616px out of a track that was starving the
 * title's, so the PRINT sheds every word the paper already says: the family
 * word (the household chip states it 20px above) AND the sharing act's tier
 * word, at every width. W3-R5 §1: the tier is state the sharing panel prints
 * one press away, and on the letterhead it was the only label that cost a
 * second row. What the ledger must never shed is the ACCESSIBLE NAME — a
 * screen reader hears `Sharing · Milestones` at both tiers.
 *
 * There is no separate MILESTONES instrument to fold: `SharingTierInstrument`
 * is ONE act whose accessible name states its current tier.
 *
 * The two tiers now differ only in REGISTER (W3-R5 §2): below 1180 the ledger
 * prints at the paper's 11px mono floor so its four acts are one row inside a
 * 327px run; at ≥1180 they stay at 12px. That is a class on the group, and it
 * is asserted here as a source literal — jsdom lays nothing out.
 *
 * The mocking shape is letterhead-instruments-scan-door.test.tsx's, minus the
 * scan (no photo resolves, so the scan door never mounts and the row is the
 * four acts the budget was measured on).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LetterheadInstruments } from './letterhead-instruments';
import { useMobilePrimaryAction } from './mobile/mobile-shell';

// No tier recorded — the instrument's own default is `milestone`, which is
// the tier the W3-R4 row is specified against. F52 cases set a proposal.
let mockProject: Record<string, unknown> = {};

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
  useProjectV2: () => ({ data: mockProject }),
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
jest.mock('./overlays/household-sheet', () => ({
  HouseholdSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="household-sheet" /> : null,
}));

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

  it('prints MESSAGE · PREVIEW · SHARING · CALL SHEET · N', () => {
    renderLedger();
    expect(printedLabels()).toEqual([
      'Message',
      'Preview',
      'Sharing',
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

  it('prints the same four labels — the row is identical at every width', () => {
    renderLedger();
    expect(printedLabels()).toEqual([
      'Message',
      'Preview',
      'Sharing',
      'Call sheet · 2',
    ]);
  });

  it('drops the acts to the 11px mono floor below 1180, and only below it', () => {
    renderLedger();
    const group = document.querySelector(
      '[role="group"][data-action-region="letterhead-actions"]',
    )!;
    // A descendant selector, because `DocumentAction`'s own `text-[12px]` is a
    // single class: `.parent .da-act` (0,2,0) beats it, where a `text-[11px]`
    // passed down as `className` would race it in the stylesheet.
    expect(group.className).toContain('[&_.da-act]:text-[11px]');
    expect(group.className).toContain('min-[1180px]:[&_.da-act]:text-[12px]');
    // The press target is `min-h`, and the register never touches it.
    for (const act of group.querySelectorAll('[data-action-key]')) {
      expect(act.className).toContain('min-h-[44px]');
    }
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

/**
 * F52 (0a-3, D3, D7) — Message needs a linked client. With nobody linked the
 * dock's centre is never Message, and the letterhead offers it held: focusable,
 * `aria-disabled`, its reason beneath and the repair beside it.
 */
describe('Message needs a linked client (F52)', () => {
  const primary = useMobilePrimaryAction as jest.Mock;
  beforeEach(() => {
    installTier(true);
    primary.mockClear();
    mockProject = {};
  });

  function renderFor(clientProfileId: string | null) {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <LetterheadInstruments
          projectId="proj-1"
          clientProfileId={clientProfileId}
          clientName="Client User"
        />
      </QueryClientProvider>,
    );
  }

  it('with no client: Message is not the primary action, and prints held with its reason', () => {
    renderFor(null);

    expect(primary).toHaveBeenCalled();
    for (const [arg] of primary.mock.calls) expect(arg).toBeNull();

    const message = screen.getByRole('button', { name: 'Message the client' });
    expect(message).toHaveAttribute('aria-disabled', 'true');
    expect(message).not.toHaveAttribute('disabled');
    message.focus();
    expect(message).toHaveFocus();

    const reasonId = message.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).toHaveTextContent('Link a client first.');

    // The press is a no-op: no composer opens.
    fireEvent.click(message);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('with no client: the repair act opens the household sheet', () => {
    renderFor(null);
    expect(screen.queryByTestId('household-sheet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link a client' }));
    expect(screen.getByTestId('household-sheet')).toBeInTheDocument();
  });

  it('a captured household (relationship, no profile) counts as linked, as the chip says', () => {
    mockProject = { proposal: { designer_client_id: 'dc-1' } };
    renderFor(null);
    expect(primary).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionKey: 'message-family', label: 'Message the client' }),
    );
    expect(screen.queryByRole('button', { name: 'Link a client' })).not.toBeInTheDocument();
  });

  it('with a client: Message is the primary action and prints live, unchanged', () => {
    renderFor('client-1');
    expect(primary).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionKey: 'message-family', label: 'Message the client' }),
    );
    const message = screen.getByRole('button', { name: 'Message the client' });
    expect(message).not.toHaveAttribute('aria-disabled');
    expect(message).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Link a client first.')).not.toBeInTheDocument();
    fireEvent.click(message);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
