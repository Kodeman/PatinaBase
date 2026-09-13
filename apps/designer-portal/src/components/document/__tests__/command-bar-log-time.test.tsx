/**
 * "Log time" with NOTHING in hand (W3 · HT-11 · HT-13 · HT-24 · HT-25 · HT-41).
 *
 * The falsifier this suite exists for: every other capture door in the product
 * is gated on a document being open. If the verb ever acquires an in-hand gate
 * — the shape "Draw an invoice" has at command-bar.tsx — the one hour the wave
 * was written about (a 45-minute client call, taken away from the desk) has no
 * home again, and nothing else in the tree would go red.
 */
import type { ReactNode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const mockPathname = jest.fn(() => '/desk');
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

/** Two documents; NEITHER is one the viewer is rostered to (HT-25). */
const captureProjects = [
  { id: 'proj-rostered', name: 'Ellsworth Residence', status: 'active' },
  { id: 'proj-stranger', name: 'Okonkwo House', status: 'active' },
  { id: 'proj-archived', name: 'Old Cottage', status: 'archived' },
];
let mockMyRateRoles: string[] = [];
const mockCreate = jest.fn();

jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: () => ({ data: undefined }),
  useRecentBoards: () => ({ data: [] }),
  useTimeCaptureProjects: () => ({ data: captureProjects }),
  useMyRateRoles: () => ({ data: mockMyRateRoles }),
  useCreateTimeEntry: () => ({ mutateAsync: mockCreate, isPending: false }),
  // HT-15 — the studio an internal hour belongs to, read through
  // `useInternalTimeStudio`. `mockStudios` is what the member belongs to.
  useOrganizations: () => ({ data: mockStudios, isError: false }),
}));

/** The viewer's studios. Empty by default, so the cases below measure the
 *  document form exactly as W3 shipped it; the internal-door case seats her. */
let mockStudios: Array<Record<string, unknown>> = [];

/** The authority read, as an answer the test can leave in flight or fail. */
let mockAuthority: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
} = { data: null, isLoading: false, isError: false };
jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => mockAuthority,
}));

jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({ data: { folders: [], chips: [], live: [] } }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: null, signOut: jest.fn() }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

/** The form reads the document in hand; `LogTimeOverlay` mounts inside the
 *  provider in `(document)/layout.tsx`. */
let mockHeldProjectId: string | null = null;
jest.mock('@/hooks/document-time-provider', () => ({
  useDocumentTime: () => ({ heldProjectId: mockHeldProjectId }),
}));

// Trap 2 (patina-testing) — the ESM leaf reached through the Post sheet.
jest.mock('../overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

const mockEntryLogged = jest.fn();
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    commandBar: {
      opened: jest.fn(),
      queried: jest.fn(),
      zeroResult: jest.fn(),
      selected: jest.fn(),
    },
    wayfinding: { doorOpened: jest.fn() },
    time: { entryLogged: (...a: unknown[]) => mockEntryLogged(...a) },
  },
  readRecentDocumentsInHand: () => [],
}));

import { CommandBar } from '../command-bar';
import { LogTimeOverlay } from '../log-time-sheet';

function Tree({ children }: { children?: ReactNode }) {
  return (
    <>
      <CommandBar />
      <LogTimeOverlay />
      {children}
    </>
  );
}

function openPalette() {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
}

beforeEach(() => {
  mockHeldProjectId = null;
  mockMyRateRoles = [];
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    id: 'entry-1',
    project_id: 'proj-stranger',
    duration_minutes: 45,
    billable: false,
    activity: 'client',
    rate_source: 'none',
    rate_role: null,
  });
  mockEntryLogged.mockClear();
  mockPathname.mockReturnValue('/desk');
  mockAuthority = { data: null, isLoading: false, isError: false };
  window.localStorage.clear();
});

describe('⌘K · Log time', () => {
  it('offers the verb in Begin with no document in hand', () => {
    render(<Tree />);
    act(() => openPalette());

    const verb = screen.getByRole('option', { name: /Log time/ });
    expect(verb).toBeInTheDocument();
    // "This surface" is where an in-hand-gated row would live; with nothing
    // open that group is absent entirely, and the verb is still here.
    expect(
      screen.queryByRole('group', { name: 'This surface' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Begin' })).toContainElement(verb);
  });

  it('opens a form, not a navigation', () => {
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    expect(screen.getByRole('dialog', { name: 'Log time' })).toBeVisible();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lists documents the viewer is not rostered to, and says she will be seated (HT-25)', () => {
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    const picker = screen.getByRole('combobox', { name: 'Document' });
    expect(
      screen.getByRole('option', { name: 'Okonkwo House' }),
    ).toBeInTheDocument();
    // An archived document is not a place to log an hour.
    expect(
      screen.queryByRole('option', { name: 'Old Cottage' }),
    ).not.toBeInTheDocument();

    fireEvent.change(picker, { target: { value: 'proj-stranger' } });
    expect(
      screen.getByText(/seats you as a\s+support designer/),
    ).toBeInTheDocument();
  });

  it("writes source='command_bar' with the date, the stated billable and no rate", async () => {
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-09-01' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Activity' }), {
      target: { value: 'client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const sent = mockCreate.mock.calls[0][0];
    expect(sent).toEqual(
      expect.objectContaining({
        projectId: 'proj-stranger',
        durationMinutes: 45,
        activity: 'client',
        source: 'command_bar',
        billable: false,
      }),
    );
    expect(String(sent.startedAt).slice(0, 10)).toBe('2026-09-01');
    // HT-1 — no rate, no amount, no provenance ever leaves the browser.
    expect(sent).not.toEqual(
      expect.objectContaining({
        hourlyRateCents: expect.anything(),
        ratedAmountCents: expect.anything(),
        rateSource: expect.anything(),
      }),
    );
    // HT-27 — reported off the row the server stored.
    expect(mockEntryLogged).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'command_bar', source: 'command_bar' }),
    );
  });

  it('leaves the activity unset unless it is chosen (HT-24)', async () => {
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    expect(screen.getByRole('combobox', { name: 'Activity' })).toHaveValue('');
    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0].activity).toBeNull();
  });

  it('will not log an hour while the date field is empty (HT-13)', async () => {
    // Clearing the field used to leave `Log it` live, and the hour then landed
    // on TODAY — the same silent mis-date this door was built to close, one
    // backspace away.
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), {
      target: { value: '45' },
    });
    expect(screen.getByRole('button', { name: 'Log it' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });

    expect(screen.getByRole('button', { name: 'Log it' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    await waitFor(() => expect(screen.getByLabelText('Date')).toHaveValue(''));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('waits for the authority read, and keeps the answer she states meanwhile (HT-11)', async () => {
    // Measured before the fix: with minutes already typed, picking a document
    // left `Log it` live while the read was still in flight, so the hour was
    // written `billable = false` whatever the agreement said — under a pill
    // that looked settled because the reason is suppressed until it is. And a
    // tap in that window was thrown away, because the seed effect only claims
    // its slot once the read lands.
    mockAuthority = { data: null, isLoading: true, isError: false };
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });

    expect(
      screen.queryByText('non-billable \u00b7 no agreement'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log it' })).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Non-billable \u2014 press to make billable/,
      }),
    );
    expect(
      screen.getByRole('button', {
        name: /^Billable \u2014 press to make non-billable/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log it' })).toBeEnabled();

    // The read lands, and says non-billable. It does not get to overrule her.
    mockAuthority = { data: null, isLoading: false, isError: false };
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), {
      target: { value: '46' },
    });
    await waitFor(() =>
      expect(
        screen.getByText('non-billable \u00b7 no agreement'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', {
        name: /^Billable \u2014 press to make non-billable/,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ billable: true });
  });

  it('does not report a failed authority read as "no agreement" (W3-R4-m17)', () => {
    // A read that failed has learned nothing about the document; printing
    // "no agreement" states a fact the browser never obtained.
    mockAuthority = { data: null, isLoading: false, isError: true };
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), {
      target: { value: '45' },
    });

    expect(
      screen.queryByText('non-billable \u00b7 no agreement'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('agreement not read \u00b7 state it yourself'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log it' })).toBeDisabled();

    // Her own statement is the way through: a failed read strands nothing.
    fireEvent.click(
      screen.getByRole('button', {
        name: /Non-billable \u2014 press to make billable/,
      }),
    );
    expect(screen.getByRole('button', { name: 'Log it' })).toBeEnabled();
  });

  it('marks a date more than 30 days back as backdated, and today as nothing (HT-13)', () => {
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    expect(screen.queryByText('backdated')).not.toBeInTheDocument();

    const old = new Date(Date.now() - 31 * 86_400_000);
    const iso = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: iso } });
    expect(screen.getByText('backdated')).toBeInTheDocument();

    const recent = new Date(Date.now() - 29 * 86_400_000);
    const recentIso = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-${String(recent.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: recentIso },
    });
    expect(screen.queryByText('backdated')).not.toBeInTheDocument();
  });

  it('proposes the document in hand, so the ⌘K door asks what the Hours row asks', () => {
    mockHeldProjectId = 'proj-rostered';
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    expect(screen.getByRole('combobox', { name: 'Document' })).toHaveValue(
      'proj-rostered',
    );
  });

  it('does not carry the last document into the next opening', () => {
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: 'Log time' }),
    ).not.toBeInTheDocument();

    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));
    // Nothing is in hand this time, so the picker stands empty — not on
    // whatever house was filed against a moment ago.
    expect(screen.getByRole('combobox', { name: 'Document' })).toHaveValue('');
  });

  it('shows the role chip only for a member holding more than one seat (HT-41)', () => {
    mockMyRateRoles = ['support_designer'];
    const single = render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });
    expect(
      screen.queryByRole('combobox', { name: 'Which role priced this hour' }),
    ).not.toBeInTheDocument();
    single.unmount();

    mockMyRateRoles = ['support_designer', 'bookkeeper'];
    render(<Tree />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('option', { name: /Log time/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Document' }), {
      target: { value: 'proj-stranger' },
    });
    expect(
      screen.getByRole('combobox', { name: 'Which role priced this hour' }),
    ).toBeInTheDocument();
  });
});
