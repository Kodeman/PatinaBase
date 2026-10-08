/**
 * US-19 slice 1 (D4) — ⌘K searches the open paper, behind `ask-the-paper`.
 *
 * Chen's paper is in hand with three lines; the sectional sits on PO WS-188.
 * Pins the group order, a paper hit outranking Help, the synonym table, the
 * dry query, the `?` guard, and that flag-off ⌘K prints today's groups.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockPathname = jest.fn(() => '/doc/eng-chen');
const mockPush = jest.fn();

jest.mock('@/hooks/use-teaching-note', () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

const mockUseProjectFFEItems = jest.fn();
let mockInvoices: Record<string, unknown>[] = [];
jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: () => ({ data: [] }),
  useRecentBoards: () => ({ data: [] }),
  useProjectFFEItems: (...args: unknown[]) => mockUseProjectFFEItems(...args),
  useProjectInvoices: () => ({ data: mockInvoices }),
}));

function chenRow(over: Record<string, unknown> = {}) {
  return {
    engagement_kind: 'project',
    engagement_id: 'eng-chen',
    project_id: 'proj-chen',
    proposal_id: null,
    lead_id: null,
    designer_id: 'designer-1',
    client_profile_id: 'client-1',
    client_name: 'Mei Chen',
    title: 'Chen Residence',
    project_status: 'active',
    current_phase: 'procurement',
    active_section: 'project',
    is_paused: false,
    is_archived: false,
    proposal_status: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

let mockRow = chenRow();
let mockFolders: Record<string, unknown>[] = [];
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({ data: { folders: mockFolders, chips: [], live: [mockRow] } }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: null, signOut: jest.fn() }),
}));

let mockAskThePaper = true;
let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value:
      name === 'ask-the-paper' ? mockAskThePaper : name === 'one-voice' ? mockOneVoice : false,
  }),
}));

// Trap 2 (patina-testing): post-sheet and open-help reach @patina/help-system's
// ESM barrel; nothing they do is under test here.
jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

import { CommandBar, openCommandBar } from '../command-bar';
import { KeysShortcut } from '../keys-shortcut';
import { MobileShellProvider, useMobilePrimaryAction } from '../mobile/mobile-shell';
import { KEYS_SHEET_EVENT } from '../overlays/keys-sheet';
import {
  LAND_RECORD_PAYMENT_EVENT,
  focusFfeLinePending,
  recordPaymentPending,
} from '@/lib/document/registry';

const LINES = [
  {
    id: 'line-sectional',
    name: 'Custom Walnut Sectional — 3 pc',
    vendor_name: 'Woodward & Sons',
    status: 'delivered',
    blocked: false,
    quantity: 1,
    received_quantity: 1,
    room: { name: 'Living Room' },
    purchase_order: { po_number: 'WS-188', vendor_po_number: null },
  },
  {
    id: 'line-lounge',
    name: 'Møbler Lounge Chair — Bouclé',
    vendor_name: 'Nordic Atelier',
    status: 'production',
    blocked: false,
    quantity: 2,
    received_quantity: null,
    room: { name: 'Study' },
    purchase_order: { po_number: 'NA-41', vendor_po_number: null },
  },
  {
    id: 'line-table',
    name: 'Oak Drum Side Table',
    vendor_name: 'Nordic Atelier',
    status: 'specified',
    blocked: false,
    quantity: 1,
    received_quantity: null,
    room: { name: 'Study' },
    purchase_order: null,
  },
];

function openAndType(query: string) {
  render(<CommandBar />);
  act(() => openCommandBar());
  fireEvent.change(screen.getByRole('combobox', { name: 'Find anything' }), {
    target: { value: query },
  });
}

const groupNames = () =>
  within(screen.getByRole('listbox', { name: 'Results' }))
    .getAllByRole('group')
    .map((group) => group.getAttribute('aria-label'));

const optionNames = () =>
  screen.getAllByRole('option').map((option) => option.textContent ?? '');

beforeEach(() => {
  mockAskThePaper = true;
  mockOneVoice = false;
  mockRow = chenRow();
  mockPathname.mockReturnValue('/doc/eng-chen');
  mockPush.mockClear();
  mockUseProjectFFEItems.mockReset();
  mockUseProjectFFEItems.mockReturnValue({ data: LINES });
  mockInvoices = [];
  mockFolders = [];
  focusFfeLinePending.request = null;
  window.localStorage.clear();
});

const groupOptions = (name: string | RegExp) =>
  within(screen.getByRole('group', { name })).getAllByRole('option').map(
    (option) => option.textContent ?? '',
  );

describe('⌘K on the paper (D4)', () => {
  it('groups On this paper → Acts on this paper → Elsewhere → the ask → Help, in that order', () => {
    openAndType('c');
    expect(groupNames()).toEqual([
      'On this paper · Chen Residence',
      'Acts on this paper',
      'Elsewhere',
      'Results',
      'Help',
    ]);
    expect(groupOptions('Results')).toEqual(['Ask about “c”ASK & PLACE']);
    // The paper's own rows are capped at five.
    const paper = screen.getByRole('group', { name: 'On this paper · Chen Residence' });
    expect(within(paper).getAllByRole('option').length).toBeLessThanOrEqual(5);
  });

  it('prints the sectional on the paper, above any Help row, and lands on its Order cell', () => {
    openAndType('sectional');
    const paper = screen.getByRole('group', { name: 'On this paper · Chen Residence' });
    const sectional = within(paper).getByRole('option', {
      name: /Custom Walnut Sectional — 3 pc/,
    });
    expect(sectional).toHaveTextContent('Woodward & Sons · Received · PO WS-188');
    expect(sectional).toHaveTextContent('↵ Open the order');

    const options = optionNames();
    const helpIndex = options.findIndex((name) => /Help Center/.test(name));
    expect(options.indexOf(sectional.textContent ?? '')).toBe(0);
    expect(helpIndex === -1 || helpIndex > 0).toBe(true);

    const landed = jest.fn();
    window.addEventListener('document:focus-ffe-line', landed);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    window.removeEventListener('document:focus-ffe-line', landed);
    expect(landed).toHaveBeenCalledTimes(1);
    expect((landed.mock.calls[0][0] as CustomEvent).detail).toEqual({
      itemId: 'line-sectional',
      cell: 'order',
    });
    // F1 — the request also waits for a Pieces region not yet mounted.
    expect(focusFfeLinePending.request).toEqual({ itemId: 'line-sectional', cell: 'order' });
    // The palette reads the paper through FFESection's own query arguments.
    expect(mockUseProjectFFEItems).toHaveBeenCalledWith('proj-chen', undefined, {
      withLifecycle: true,
    });
  });

  it('reads the synonym table: couch finds the sectional', () => {
    openAndType('couch');
    const paper = screen.getByRole('group', { name: 'On this paper · Chen Residence' });
    expect(
      within(paper).getByRole('option', { name: /Custom Walnut Sectional — 3 pc/ }),
    ).toBeInTheDocument();
  });

  it('reads the synonym table: change offers Record a change, which dispatches the router event', () => {
    openAndType('change');
    const acts = screen.getByRole('group', { name: 'Acts on this paper' });
    const record = within(acts).getByRole('option', { name: /Record a change/ });
    expect(screen.queryByText('Add a change')).not.toBeInTheDocument();

    const opened = jest.fn();
    window.addEventListener('document:open-record-a-change', opened);
    fireEvent.click(record);
    window.removeEventListener('document:open-record-a-change', opened);
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ origin: 'cmdk' });
  });

  it('R26 — late finds the Install reading as its own sentence, act Open Install, on an Install paper only', () => {
    mockRow = chenRow({ active_section: 'install' });
    openAndType('late');
    const paper = screen.getByRole('group', { name: 'On this paper · Chen Residence' });
    const reading = within(paper).getAllByRole('option')[0];
    expect(reading).toHaveTextContent(
      "Møbler Lounge Chair — Bouclé isn't here, and no arrival date is recorded. 1 more isn't here.",
    );
    expect(reading).toHaveTextContent('↵ Open Install');
    expect(screen.queryByText('The install reading')).not.toBeInTheDocument();

    const section = jest.fn();
    window.addEventListener('document:open-section', section);
    fireEvent.click(reading);
    window.removeEventListener('document:open-section', section);
    expect((section.mock.calls[0][0] as CustomEvent).detail).toBe('install');
  });

  it('R26 — late prints no reading on a Project paper', () => {
    openAndType('late');
    expect(screen.queryByText(/isn't here/)).not.toBeInTheDocument();
  });

  it('prints the dry query: the sentence, Open the pieces first, Open Help last, never Help alone', () => {
    openAndType('zzz');
    expect(screen.getByText('Nothing on this paper matches "zzz".')).toBeInTheDocument();
    const options = optionNames();
    expect(options[0]).toBe('Open the pieces · 3 lines');
    expect(options).toContain('Search all jobs for "zzz"');
    expect(options[options.length - 1]).toBe('Open Help');
    expect(screen.queryByText(/Browse the Help Center/)).not.toBeInTheDocument();
    expect(screen.queryByText('No match')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nothing matches.');
  });

  it('R23 — Search all jobs switches the sheet in place, focus on the first result; Esc returns to the paper', async () => {
    openAndType('chen');
    fireEvent.click(screen.getByRole('option', { name: 'Search all jobs for "chen"' }));

    expect(screen.getByRole('dialog', { name: 'Command bar' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(groupNames()).toEqual(['All jobs']);
    const first = within(screen.getByRole('group', { name: 'All jobs' })).getAllByRole(
      'option',
    )[0];
    expect(first).toHaveTextContent('Chen Residence');
    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Command bar' })).toBeInTheDocument();
    expect(groupNames()).toContain('Elsewhere');
    expect(screen.getByRole('combobox', { name: 'Find anything' })).toHaveFocus();
  });

  it('R25 — Elsewhere holds Search all jobs, then Where the work stands, then the cross-paper hits, and nothing else', () => {
    openAndType('procurement');
    const elsewhere = groupOptions('Elsewhere');
    expect(elsewhere[0]).toBe('Search all jobs for "procurement"');
    expect(elsewhere[1]).toMatch(/^In procurement · 1/);
    expect(elsewhere.some((name) => /Ask about/.test(name))).toBe(false);
  });

  it('R27 — each Money head act is its own row: Record the payment first when due, then Draw an invoice; no umbrella', () => {
    mockFolders = [
      {
        row: mockRow,
        need: { kind: 'overdue_decision', text: '2 decisions overdue' },
        needs: [
          { kind: 'overdue_decision', text: '2 decisions overdue' },
          {
            kind: 'payment_due',
            text: 'Deposit to Woodward & Sons · $1,200.00 due 9 Oct — WS-188',
            ledger: {
              name: 'orders',
              context: { page: 'ledger', projectId: 'proj-chen', purchaseOrderId: 'po-188' },
            },
          },
        ],
      },
    ];
    openAndType('payment');
    const acts = screen.getByRole('group', { name: 'Acts on this paper' });
    const names = within(acts)
      .getAllByRole('option')
      .map((option) => option.querySelector('.font-medium')?.textContent);
    expect(names).toEqual(['Record the payment', 'Draw an invoice']);
    expect(screen.queryByRole('option', { name: /^Money/ })).not.toBeInTheDocument();

    const ledger = jest.fn();
    window.addEventListener('document:open-ledger', ledger);
    fireEvent.click(within(acts).getByRole('option', { name: /Record the payment/ }));
    window.removeEventListener('document:open-ledger', ledger);
    expect((ledger.mock.calls[0][0] as CustomEvent).detail).toEqual({
      name: 'orders',
      context: { page: 'ledger', projectId: 'proj-chen', purchaseOrderId: 'po-188' },
    });
  });

  // US-19 F2-3 / 2-5 (P-1) — under one-voice the ⌘K row points at the PO
  // line's own record-payment control; the Orders ledger is not a landing.
  it('R27 one-voice — Record the payment lands on the line, not the Orders ledger', () => {
    mockOneVoice = true;
    mockFolders = [
      {
        row: mockRow,
        need: null,
        needs: [
          {
            kind: 'payment_due',
            text: 'Balance to Woodward & Sons · $3,400.00 due 12 May — WS-188',
            ledger: {
              name: 'orders',
              context: { page: 'ledger', projectId: 'proj-chen', purchaseOrderId: 'po-188' },
            },
          },
        ],
      },
    ];
    openAndType('payment');
    const acts = screen.getByRole('group', { name: 'Acts on this paper' });
    const ledger = jest.fn();
    const landed = jest.fn();
    window.addEventListener('document:open-ledger', ledger);
    window.addEventListener(LAND_RECORD_PAYMENT_EVENT, landed);
    try {
      fireEvent.click(within(acts).getByRole('option', { name: /Record the payment/ }));
    } finally {
      window.removeEventListener('document:open-ledger', ledger);
      window.removeEventListener(LAND_RECORD_PAYMENT_EVENT, landed);
      recordPaymentPending.request = null;
    }
    expect(ledger).not.toHaveBeenCalled();
    expect((landed.mock.calls[0][0] as CustomEvent).detail).toEqual({ purchaseOrderId: 'po-188' });
  });

  it('R27 — with nothing due, the money words offer Draw an invoice alone, as printed', () => {
    openAndType('invoice');
    const acts = screen.getByRole('group', { name: 'Acts on this paper' });
    expect(within(acts).queryByRole('option', { name: /Record the payment/ })).not.toBeInTheDocument();
    const draw = within(acts).getByRole('option', { name: /Draw an invoice/ });
    expect(draw.querySelector('.font-medium')?.textContent).toBe('Draw an invoice');
  });

  it('R29 — invoice numbers are searched through the paper’s invoice rows', () => {
    mockInvoices = [
      { id: 'inv-114', invoice_number: '2026-114', status: 'sent' },
      { id: 'inv-115', invoice_number: '2026-115', status: 'paid' },
    ];
    openAndType('2026-114');
    const paper = screen.getByRole('group', { name: 'On this paper · Chen Residence' });
    const invoice = within(paper).getByRole('option', { name: /Invoice 2026-114/ });
    expect(within(paper).queryByRole('option', { name: /2026-115/ })).not.toBeInTheDocument();

    const folio = jest.fn();
    window.addEventListener('document:open-invoice-folio', folio);
    fireEvent.click(invoice);
    window.removeEventListener('document:open-invoice-folio', folio);
    expect((folio.mock.calls[0][0] as CustomEvent).detail).toEqual({ invoiceId: 'inv-114' });
  });

  it('R30 — keys offers a Keys row with its ? hint under Acts on this paper; Enter opens Keys', () => {
    openAndType('keys');
    const acts = screen.getByRole('group', { name: 'Acts on this paper' });
    const keys = within(acts).getByRole('option', { name: /^Keys/ });
    expect(keys).toHaveTextContent('?');
    expect(within(acts).getAllByRole('option')[0]).toBe(keys);

    const opened = jest.fn();
    window.addEventListener(KEYS_SHEET_EVENT, opened);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    window.removeEventListener(KEYS_SHEET_EVENT, opened);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('R31 — the Desk dry query: Nothing matches, Where the work stands, then one Open Help row', () => {
    mockPathname.mockReturnValue('/desk');
    openAndType('zzz');
    expect(screen.getByText('Nothing matches "zzz".')).toBeInTheDocument();
    expect(groupNames()).toEqual(['Results', 'Where the work stands', 'Results', 'Help']);
    expect(groupOptions('Help')).toEqual(['Open Help']);
    expect(screen.queryByText(/Browse the Help Center/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Open Help' }));
    expect(mockPush).toHaveBeenCalledWith('/help');
  });

  it('prints `? keys` in the foot line', () => {
    openAndType('');
    expect(screen.getByText('↵ open · ↑↓ move · ? keys · esc close')).toBeInTheDocument();
  });
});

describe('`?` never fires inside a text field (R132)', () => {
  it('opens Keys from the page, not from an input', () => {
    render(
      <>
        <KeysShortcut />
        <input aria-label="A field" />
      </>,
    );
    const opened = jest.fn();
    window.addEventListener(KEYS_SHEET_EVENT, opened);

    const field = screen.getByRole('textbox', { name: 'A field' });
    field.focus();
    fireEvent.keyDown(field, { key: '?' });
    expect(opened).not.toHaveBeenCalled();

    field.blur();
    fireEvent.keyDown(document.body, { key: '?' });
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(KEYS_SHEET_EVENT, opened);
  });
});

describe('flag off — today’s ⌘K', () => {
  beforeEach(() => {
    mockAskThePaper = false;
  });

  it('prints today’s single result list and recovery row, and reads no paper', () => {
    openAndType('sectional');
    expect(screen.queryByRole('group', { name: /On this paper/ })).not.toBeInTheDocument();
    expect(groupNames()).toEqual(['Results']);
    expect(screen.getByText('No match')).toBeInTheDocument();
    expect(screen.queryByText(/Search all jobs/)).not.toBeInTheDocument();
    expect(screen.queryByText('↵ open · ↑↓ move · ? keys · esc close')).not.toBeInTheDocument();
    expect(mockUseProjectFFEItems).not.toHaveBeenCalled();
  });

  it('keeps Add a change off the project paper', () => {
    openAndType('change');
    expect(screen.queryByText('Record a change')).not.toBeInTheDocument();
    expect(screen.queryByText('Add a change')).not.toBeInTheDocument();
  });
});

// US-19 FR2 — ⌘K speaks the act names under `one-voice` (F2-11, F2-14, F2-23).
describe('one-voice ⌘K (FR2)', () => {
  beforeEach(() => {
    mockOneVoice = true;
  });

  const directionRow = () =>
    chenRow({
      engagement_kind: 'proposal',
      engagement_id: 'eng-dir',
      project_id: null,
      proposal_id: 'prop-dir',
      proposal_status: 'draft',
      active_section: 'direction',
      title: 'Living Room Direction',
    });

  it('F2-14 — on Direction the Contract Room row is the act row Write the proposal', () => {
    mockRow = directionRow();
    mockPathname.mockReturnValue('/doc/eng-dir');
    openAndType('prop');
    const write = screen.getByRole('option', { name: /^Write the proposal/ });
    expect(write.querySelector('.font-medium')?.textContent).toBe('Write the proposal');
    expect(screen.queryByText('Contract Room')).not.toBeInTheDocument();
    expect(screen.queryByText(/Open the Contract Room/)).not.toBeInTheDocument();

    fireEvent.click(write);
    expect(mockPush).toHaveBeenCalledWith('/drafting/prop-dir');
  });

  it('F2-14 — the empty query’s This surface row prints Write the proposal, never Open the Contract Room', () => {
    mockRow = directionRow();
    mockPathname.mockReturnValue('/doc/eng-dir');
    openAndType('');
    const surface = screen.getByRole('group', { name: 'This surface' });
    expect(within(surface).getByRole('option', { name: /^Write the proposal/ })).toBeInTheDocument();
    expect(screen.queryByText('Open the Contract Room')).not.toBeInTheDocument();
  });

  it('F2-11 — a closed job’s dry query prints one sentence: no second Nothing matches., no pieces row', () => {
    mockRow = chenRow({ project_status: 'completed', active_section: 'care', title: 'Lindqvist' });
    mockUseProjectFFEItems.mockReturnValue({ data: [] });
    openAndType('zzz');
    expect(screen.getAllByText('Nothing on this paper matches "zzz".')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing on this paper matches "zzz".');
    expect(screen.queryByText('Nothing matches.')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Open the pieces/ })).not.toBeInTheDocument();
  });

  it('F2-23 / 507-4 / F3-14 — the ask row reads Ask the paper: “{query}”, with no AI or Engine word', () => {
    openAndType('c');
    expect(groupOptions('Results')).toEqual(['Ask the paper: “c”ASK & PLACE']);
    const dialog = screen.getByRole('dialog', { name: 'Command bar' });
    expect(dialog.textContent).not.toMatch(/\b(AI|Engine)\b/);
  });

  it('F2-23 / 507-5 — The keys is gone: Keys ? is the one door, printed once', () => {
    openAndType('keys');
    expect(screen.queryByText('The keys')).not.toBeInTheDocument();
    const keys = screen.getAllByRole('option', { name: /^Keys/ });
    expect(keys).toHaveLength(1);
    expect(keys[0]).toHaveTextContent('?');
  });

  it('F2-23 / 507-5 — on the Desk the one door is Keys ?, too', () => {
    mockPathname.mockReturnValue('/desk');
    openAndType('keys');
    expect(screen.queryByText('The keys')).not.toBeInTheDocument();
    const keys = screen.getByRole('option', { name: /^Keys/ });
    expect(keys).toHaveTextContent('?');
  });

  it('flag off, the Desk still prints The keys', () => {
    mockOneVoice = false;
    mockPathname.mockReturnValue('/desk');
    openAndType('keys');
    expect(screen.getByText('The keys')).toBeInTheDocument();
  });
});

// US-19 FR3 — the band's Next is a ⌘K row (F3-5), the ask strings (F3-14), and
// the first Esc's focus (F3-17), all under `one-voice`.
describe('one-voice ⌘K (FR3)', () => {
  beforeEach(() => {
    mockOneVoice = true;
  });

  type Next = { label: string; sentence: string; onPress: () => void };
  /** The letterhead's D7 registration: the band's Next, for the dock's centre. */
  function BandNext({ label, sentence, onPress }: Next) {
    useMobilePrimaryAction(
      {
        actionKey: `next:${label}`,
        surfaceKey: 'open-document',
        regionKey: 'lens-band',
        label,
        sentence,
        target: { kind: 'press', onPress },
      },
      { priority: 20 },
    );
    return null;
  }
  function openWithNext(next: Next, query: string) {
    render(
      <MobileShellProvider>
        <BandNext {...next} />
        <CommandBar />
      </MobileShellProvider>,
    );
    act(() => openCommandBar());
    fireEvent.change(screen.getByRole('combobox', { name: 'Find anything' }), {
      target: { value: query },
    });
  }
  const actRow = (name: RegExp) =>
    within(screen.getByRole('group', { name: 'Acts on this paper' })).getByRole('option', { name });

  it.each([
    ['Aspen', 'nudge', 'Nudge the client', 'Waiting on the client: Design Development sign-off — drawing set B'],
    ['Olsen', 'claim', 'File the claim', 'AP-012 has an open damage claim'],
    ['Halloran', 'maker', 'Follow up with the maker', 'With the maker: NA-2026-077 sent 6 days ago, unanswered'],
  ])('F3-5 %s — %s finds the band’s Next: its act over its sentence, landing as its press', (_job, query, label, sentence) => {
    const onPress = jest.fn();
    openWithNext({ label, sentence, onPress }, query);
    expect(screen.queryByText(`Nothing on this paper matches "${query}".`)).not.toBeInTheDocument();
    const row = actRow(new RegExp(`^${label}`));
    expect(row.querySelector('.font-medium')?.textContent).toBe(label);
    expect(row).toHaveTextContent(sentence);
    expect(screen.getAllByRole('option', { name: new RegExp(label) })).toHaveLength(1);
    fireEvent.click(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('F3-5 — the Next row is found by its sentence’s words, too', () => {
    openWithNext(
      { label: 'Follow up with the maker', sentence: 'With the maker: NA-2026-077 sent 6 days ago', onPress: jest.fn() },
      'na-2026',
    );
    expect(actRow(/^Follow up with the maker/)).toBeInTheDocument();
  });

  it('F3-5 — Cedar: the Install reading row ends in Ask the maker for a date, once, landing as the band’s press', () => {
    mockRow = chenRow({ active_section: 'install' });
    const onPress = jest.fn();
    const section = jest.fn();
    window.addEventListener('document:open-section', section);
    openWithNext(
      {
        label: 'Ask the maker for a date',
        sentence: "Møbler Lounge Chair — Bouclé isn't here, and no arrival date is recorded. 1 more isn't here.",
        onPress,
      },
      'date',
    );
    const paper = screen.getByRole('group', { name: 'On this paper · Chen Residence' });
    const reading = within(paper).getAllByRole('option')[0];
    expect(reading).toHaveTextContent('↵ Ask the maker for a date');
    expect(reading).not.toHaveTextContent('Open Install');
    expect(screen.getAllByRole('option', { name: /Ask the maker for a date/ })).toHaveLength(1);
    fireEvent.click(reading);
    window.removeEventListener('document:open-section', section);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(section).not.toHaveBeenCalled();
  });

  it('F3-5 / 514-1 — Next is a payment: R27’s row is the Next row, printed once, with the band’s sentence', () => {
    mockFolders = [
      {
        row: mockRow,
        need: { kind: 'payment_due', text: 'Balance to Woodward & Sons · $3,400 due 12 May — WS-188' },
        needs: [
          {
            kind: 'payment_due',
            text: 'Balance to Woodward & Sons · $3,400 due 12 May — WS-188',
            ledger: { name: 'orders', context: { page: 'payments', purchaseOrderId: 'po-188' } },
          },
        ],
      },
    ];
    const onPress = jest.fn();
    const sentence = 'Pay Woodward & Sons the WS-188 balance, $3,400 — 148 days overdue.';
    openWithNext({ label: 'Record the payment', sentence, onPress }, 'pay');
    const rows = screen.getAllByRole('option', { name: /Record the payment/ });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(sentence);
    const landed = jest.fn();
    window.addEventListener(LAND_RECORD_PAYMENT_EVENT, landed);
    fireEvent.click(rows[0]);
    window.removeEventListener(LAND_RECORD_PAYMENT_EVENT, landed);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(landed).not.toHaveBeenCalled();
  });

  it('flag off — the registered Next prints no row', () => {
    mockOneVoice = false;
    openWithNext({ label: 'Nudge the client', sentence: 'Waiting on the client', onPress: jest.fn() }, 'nudge');
    expect(screen.queryByRole('option', { name: /Nudge the client/ })).not.toBeInTheDocument();
  });

  it('F3-14 — the Desk’s ask row keeps Ask about “{q}”, in typographic quotes', () => {
    mockPathname.mockReturnValue('/desk');
    openAndType('zzz');
    expect(screen.getByRole('option', { name: /^Ask about “zzz”/ })).toBeInTheDocument();
  });

  it('F3-14 — the Direction paper’s ask row reads Ask the paper: “prop”', () => {
    mockRow = chenRow({
      engagement_kind: 'proposal',
      engagement_id: 'eng-dir',
      project_id: null,
      proposal_id: 'prop-dir',
      proposal_status: 'draft',
      active_section: 'direction',
      title: 'Living Room Direction',
    });
    mockPathname.mockReturnValue('/doc/eng-dir');
    openAndType('prop');
    expect(screen.getByRole('option', { name: /^Ask the paper: “prop”/ })).toBeInTheDocument();
    expect(screen.queryByText(/Ask about/)).not.toBeInTheDocument();
  });

  it('F3-14 / 513-5 — zero lines prints Open the pieces with no count', () => {
    mockUseProjectFFEItems.mockReturnValue({ data: [] });
    openAndType('zzz');
    expect(optionNames()[0]).toBe('Open the pieces');
  });

  it('F3-14 / 513-5 — flag off, an open paper with no lines still prints · 0 lines', () => {
    mockOneVoice = false;
    mockUseProjectFFEItems.mockReturnValue({ data: [] });
    openAndType('zzz');
    expect(optionNames()[0]).toBe('Open the pieces · 0 lines');
  });

  describe('F3-17 — the first Esc returns focus', () => {
    const flushFrames = () =>
      act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
    function mountBand() {
      const line = document.createElement('p');
      line.setAttribute('data-lens-line', '2');
      const bandAct = document.createElement('button');
      bandAct.setAttribute('data-part', 'act');
      bandAct.textContent = 'Nudge the client';
      line.appendChild(bandAct);
      document.body.appendChild(line);
      return { bandAct, remove: () => line.remove() };
    }

    it('to the band’s act when nothing had it', async () => {
      const { bandAct, remove } = mountBand();
      (document.activeElement as HTMLElement | null)?.blur();
      render(<CommandBar />);
      act(() => openCommandBar());
      await flushFrames();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flushFrames();
      expect(bandAct).toHaveFocus();
      remove();
    });

    it('to the element that had it', async () => {
      const { remove } = mountBand();
      const opener = document.createElement('button');
      opener.textContent = 'Find anything';
      document.body.appendChild(opener);
      opener.focus();
      render(<CommandBar />);
      act(() => openCommandBar());
      await flushFrames();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flushFrames();
      expect(opener).toHaveFocus();
      opener.remove();
      remove();
    });

    it('flag off, nothing focused stays nothing focused', async () => {
      mockOneVoice = false;
      const { bandAct, remove } = mountBand();
      (document.activeElement as HTMLElement | null)?.blur();
      render(<CommandBar />);
      act(() => openCommandBar());
      await flushFrames();
      fireEvent.keyDown(window, { key: 'Escape' });
      await flushFrames();
      expect(bandAct).not.toHaveFocus();
      remove();
    });
  });
});
