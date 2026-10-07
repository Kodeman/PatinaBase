/**
 * US-19 slice 1 (D4) — ⌘K searches the open paper, behind `ask-the-paper`.
 *
 * Chen's paper is in hand with three lines; the sectional sits on PO WS-188.
 * Pins the group order, a paper hit outranking Help, the synonym table, the
 * dry query, the `?` guard, and that flag-off ⌘K prints today's groups.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';

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
jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: () => ({ data: [] }),
  useRecentBoards: () => ({ data: [] }),
  useProjectFFEItems: (...args: unknown[]) => mockUseProjectFFEItems(...args),
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
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({ data: { folders: [], chips: [], live: [mockRow] } }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: null, signOut: jest.fn() }),
}));

let mockAskThePaper = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'ask-the-paper' ? mockAskThePaper : false,
  }),
}));

// Trap 2 (patina-testing): post-sheet and open-help reach @patina/help-system's
// ESM barrel; nothing they do is under test here.
jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

import { CommandBar, openCommandBar } from '../command-bar';
import { KeysShortcut } from '../keys-shortcut';
import { KEYS_SHEET_EVENT } from '../overlays/keys-sheet';

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
  mockRow = chenRow();
  mockPathname.mockReturnValue('/doc/eng-chen');
  mockPush.mockClear();
  mockUseProjectFFEItems.mockReset();
  mockUseProjectFFEItems.mockReturnValue({ data: LINES });
  window.localStorage.clear();
});

describe('⌘K on the paper (D4)', () => {
  it('groups On this paper → Acts on this paper → Elsewhere → Help, in that order', () => {
    openAndType('c');
    expect(groupNames()).toEqual([
      'On this paper · Chen Residence',
      'Acts on this paper',
      'Elsewhere',
      'Help',
    ]);
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

  it('resolves late to the Install reading on an Install paper only', () => {
    mockRow = chenRow({ active_section: 'install' });
    openAndType('late');
    const reading = within(screen.getByRole('group', { name: 'Acts on this paper' })).getByRole(
      'option',
      { name: /The install reading/ },
    );
    const section = jest.fn();
    window.addEventListener('document:open-section', section);
    fireEvent.click(reading);
    window.removeEventListener('document:open-section', section);
    expect((section.mock.calls[0][0] as CustomEvent).detail).toBe('install');
  });

  it('prints the dry query: the sentence, Open the pieces first, Help last, never Help alone', () => {
    openAndType('zzz');
    expect(screen.getByText('Nothing on this paper matches "zzz".')).toBeInTheDocument();
    const options = optionNames();
    expect(options[0]).toBe('Open the pieces · 3 lines');
    expect(options).toContain('Search all jobs for "zzz"');
    expect(options[options.length - 1]).toMatch(/Browse the Help Center/);
    expect(screen.queryByText('No match')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nothing matches.');
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
