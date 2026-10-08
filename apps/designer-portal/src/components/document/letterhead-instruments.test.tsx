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
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RedLetterRow } from './red-letter-zone';
import { LetterheadInstruments } from './letterhead-instruments';
import {
  useMobilePrimaryAction,
  useMobileSecondaryAction,
  type MobileSecondaryAction,
} from './mobile/mobile-shell';
import { MOBILE_ACTION_PRIORITY } from './mobile/lifecycle-mobile-action';
import { openKeys } from './overlays/keys-sheet';
import { openVitalsEditor } from './letterhead-vitals';
import {
  deriveNext,
  rankStanding,
  type LensNeedRow,
} from '@/lib/document/lens-band-derivation';

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
// Call Sheet is a flag-gated instrument; the measured row includes it. US-19's
// `one-voice` is off unless a case turns it on.
let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({
    value: key === 'one-voice' ? mockOneVoice : true,
    isLoading: false,
  }),
}));
jest.mock('./mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
  useMobileSecondaryAction: jest.fn(),
}));
jest.mock('./overlays/keys-sheet', () => ({ openKeys: jest.fn() }));
jest.mock('./letterhead-vitals', () => ({ openVitalsEditor: jest.fn() }));
jest.mock('./lens-band', () => ({
  OPEN_STANDING_SHEET_EVENT: 'document:open-standing-sheet',
}));
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
 * US-19 FR2 F2-9 / 500-3 (`one-voice`) — the letterhead prints D1's names, at
 * every width: `Message {first}` and `Preview the client's copy`, never the
 * bare `MESSAGE` or `PREVIEW`. The printed name is the accessible name.
 */
describe('the letterhead ledger under one-voice — D1 names (FR2 F2-9)', () => {
  beforeEach(() => {
    mockOneVoice = true;
    mockProject = {};
  });
  afterEach(() => {
    mockOneVoice = false;
  });

  function renderFor(clientName: string) {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <LetterheadInstruments
          projectId="proj-1"
          clientProfileId="client-1"
          clientName={clientName}
        />
      </QueryClientProvider>,
    );
  }

  it.each([
    ['≥1180', true],
    ['390', false],
  ] as const)('prints Message {first} · Preview the client’s copy · Sharing at %s', (_tier, wide) => {
    installTier(wide);
    renderFor('Nora Ellison');
    expect(printedLabels()).toEqual([
      'Message Nora',
      "Preview the client's copy",
      'Sharing',
      'Call sheet · 2',
    ]);
    for (const bare of ['Message', 'Preview', 'Punch', 'Share…']) {
      expect(printedLabels()).not.toContain(bare);
    }
    expect(screen.getByRole('button', { name: 'Message Nora' })).toHaveAttribute(
      'data-action-key',
      'message-family',
    );
    expect(
      screen.getByRole('button', { name: "Preview the client's copy" }),
    ).toHaveAttribute('data-action-key', 'preview-as-client');
  });

  it('a placeholder household reads `Message the client`', () => {
    installTier(true);
    renderFor('Client User');
    expect(printedLabels()[0]).toBe('Message the client');
  });

  it('keeps one static primary: Message, live', () => {
    installTier(true);
    renderFor('Nora Ellison');
    const region = document.querySelector('[data-action-region="letterhead-actions"]')!;
    expect(region.querySelectorAll('.da-primary')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Message Nora' })).toHaveClass('da-primary');
  });
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

  // FR1 F4 (R15, R16) — the held act prints its accessible name, and its
  // reason stands directly beneath it in the act's own column, with the
  // repair beside it: never a full-width sentence under the whole row. jsdom
  // lays nothing out, so the column is asserted as structure and the left
  // edge as the act's own inline padding (`px-[6px]`) repeated on the reason.
  it.each([
    ['≥1180', true],
    ['390', false],
  ] as const)('with no client at %s: the reason sits beneath its own act', (_tier, wide) => {
    installTier(wide);
    renderFor(null);

    const message = screen.getByRole('button', { name: 'Message the client' });
    expect(message.querySelector('.da-label')).toHaveTextContent(/^Message the client$/);

    const reason = document.getElementById(message.getAttribute('aria-describedby')!)!;
    expect(reason).toHaveTextContent(/^Link a client first\.$/);
    expect(reason.className).not.toContain('basis-full');

    // One column: the act, then its reason, left-aligned, nothing between.
    const column = message.parentElement!;
    expect(reason.parentElement).toBe(column);
    expect(message.nextElementSibling).toBe(reason);
    expect(column.className).toContain('flex-col');
    expect(column.className).toContain('items-start');
    expect(message.className).toContain('px-[6px]');
    expect(reason.className).toContain('px-[6px]');

    // The repair stands beside the held act, in the same cluster.
    const repair = screen.getByRole('button', { name: 'Link a client' });
    expect(column.nextElementSibling).toBe(repair);
    expect(repair.parentElement!.className).toContain('items-start');
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
    expect(primary).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'message-family', label: 'Message the client' }),
    );
    expect(screen.queryByRole('button', { name: 'Link a client' })).not.toBeInTheDocument();
  });

  it('with a client: Message is the primary action and prints live, unchanged', () => {
    renderFor('client-1');
    expect(primary).toHaveBeenCalledWith(
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

/**
 * US-19 D7 (`one-voice`) — the phone dock. The centre is the band's Next in
 * the band's words; More carries the ruled acts in the ruled order; Message
 * with no client linked is held there, never the centre.
 */
describe('the phone dock under one-voice (D7, §3 2-6)', () => {
  const primary = useMobilePrimaryAction as jest.Mock;
  const secondary = useMobileSecondaryAction as jest.Mock;

  // Chen Residence, as lens-band-derivation.test.ts states it: one balance
  // owed to the maker (class 1) above two class-2 rows.
  const NOW = new Date('2026-08-29T12:00:00');
  const payOnAct = jest.fn();
  const row = (
    key: string,
    kind: RedLetterRow['kind'],
    text: string,
    actionLabel: string,
    dueOn: string | null,
    owner: LensNeedRow['owner'],
    onAct: () => void = jest.fn(),
  ): LensNeedRow => ({ key, kind, text, actionLabel, onAct, urgent: true, dueOn, owner });
  const CHEN_NEEDS: LensNeedRow[] = [
    row('approval-0', 'overdue_decision', 'Primary bedroom approval overdue 6 days', 'Send a reminder', '2026-08-23', 'client'),
    row('pay-0', 'payment_due', 'Balance to Woodward & Sons · $12,400 due Aug 20 — PO WS-188', 'Record payment', '2026-08-20', 'designer', payOnAct),
    row('po-0', 'po_unacknowledged', 'PO-2026-0418 sent — no acknowledgment, 14 days', 'Follow up with the maker', null, 'maker'),
  ];
  const chenNext = () =>
    deriveNext({
      standing: rankStanding([], CHEN_NEEDS, NOW),
      ownAct: null,
      clientFirstName: null,
      closed: false,
    });

  beforeEach(() => {
    installTier(false);
    primary.mockClear();
    secondary.mockClear();
    payOnAct.mockClear();
    (openKeys as jest.Mock).mockClear();
    (openVitalsEditor as jest.Mock).mockClear();
    mockProject = {};
    mockOneVoice = true;
  });
  afterAll(() => {
    mockOneVoice = false;
  });

  function renderDock({
    clientProfileId,
    clientName = 'Chen Residence',
    doorInDock = false,
  }: {
    clientProfileId: string | null;
    clientName?: string;
    doorInDock?: boolean;
  }) {
    const next = chenNext();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <LetterheadInstruments
          projectId="proj-1"
          clientProfileId={clientProfileId}
          clientName={clientName}
          voice={{ next, standingCount: 2, doorInDock }}
        />
      </QueryClientProvider>,
    );
    return next;
  }

  /** More, as registered: the latest registration per act, in its order. */
  function more(): MobileSecondaryAction[] {
    const latest = new Map<string, MobileSecondaryAction>();
    for (const [action] of secondary.mock.calls) {
      if (action) latest.set(action.actionKey, action);
    }
    return [...latest.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function centreCall() {
    return primary.mock.calls.find(
      ([action, options]) =>
        action !== null && options?.priority === MOBILE_ACTION_PRIORITY.next,
    );
  }

  it('2-6: the centre reads deriveNext()’s act in full, at the top priority, and lands where the band does', () => {
    const next = renderDock({ clientProfileId: null });
    expect(next?.act.label).toBe('Record the payment');

    const call = centreCall();
    expect(call).toBeDefined();
    const [action, options] = call!;
    expect(action.label).toBe(next!.act.label);
    expect(options.priority).toBeGreaterThan(MOBILE_ACTION_PRIORITY.lifecycle);

    action.target.onPress();
    expect(payOnAct).toHaveBeenCalledTimes(1);
  });

  it('2-6: with no client linked, Message is never the centre; More holds it with its reason and repair', () => {
    renderDock({ clientProfileId: null });

    for (const [action] of primary.mock.calls) {
      expect(action?.actionKey).not.toBe('message-family');
    }
    const message = more().find((act) => act.actionKey === 'message-family');
    expect(message).toMatchObject({
      label: 'Message the client',
      held: { reason: 'Link a client first.', repair: { label: 'Link a client' } },
    });

    expect(screen.queryByTestId('household-sheet')).not.toBeInTheDocument();
    act(() => message!.held!.repair!.onPress());
    expect(screen.getByTestId('household-sheet')).toBeInTheDocument();
  });

  it('prints More in the ruled order', () => {
    renderDock({ clientProfileId: 'client-1' });
    expect(more().map((act) => act.label)).toEqual([
      'Message Chen',
      "Preview the client's copy",
      'Sharing',
      'Call sheet',
      'Set dates',
      'Set a budget band',
      'Keys',
    ]);
    const byKey = (key: string) => more().find((act) => act.actionKey === key)!;
    expect(byKey('message-family').held).toBeUndefined();

    byKey('set-dates').onPress();
    expect(openVitalsEditor).toHaveBeenCalledWith('target');
    byKey('set-budget-band').onPress();
    expect(openVitalsEditor).toHaveBeenCalledWith('budget');
    byKey('keys').onPress();
    expect(openKeys).toHaveBeenCalledTimes(1);

    const onCallSheet = jest.fn();
    window.addEventListener('document:open-call-sheet', onCallSheet);
    byKey('open-call-sheet').onPress();
    window.removeEventListener('document:open-call-sheet', onCallSheet);
    expect(onCallSheet).toHaveBeenCalledTimes(1);
  });

  it('leads More with `Standing · N` when the band moved its door to the dock, opening the one sheet', () => {
    renderDock({ clientProfileId: 'client-1', doorInDock: true });
    const [first] = more();
    expect(first.label).toBe('Standing · 2');

    const onOpen = jest.fn();
    window.addEventListener('document:open-standing-sheet', onOpen);
    first.onPress();
    window.removeEventListener('document:open-standing-sheet', onOpen);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('flag off: no Next centre, nothing published to More, Message unchanged', () => {
    mockOneVoice = false;
    renderDock({ clientProfileId: 'client-1', clientName: 'The Ellsworths', doorInDock: true });

    expect(centreCall()).toBeUndefined();
    expect(secondary).not.toHaveBeenCalled();
    expect(primary).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'message-family', label: 'Message The Ellsworths' }),
    );
  });
});
