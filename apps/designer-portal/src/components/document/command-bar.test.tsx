/**
 * A7 (doc-polish) — static tracing found the Desk's "Find anything" button →
 * `openCommandBar()` → `document:open-command-bar` → `CommandBar`'s listener
 * → `setOpen(true)` circuit fully wired, with the Desk Walkthrough tour's own
 * coachmark (packages/help-system TourController) explicitly built to never
 * intercept clicks on the underlying surface (Radix Popover content only, no
 * backdrop — "Never blocks the underlying interface", spec §4.7 rule 6). No
 * test exercised this exact circuit before (grep for 'find-anything' /
 * 'Find anything' across *.test.tsx returned zero hits), so this pins it: a
 * real DOM click on the real DocumentAction opens the real CommandBar.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// SP-16/F21 (A2-L3) — both new suites below need a controllable pathname (to
// put a document "in hand") and desk data (the row itself); every earlier
// test keeps working off the same defaults ('/desk', no rows) the old static
// mocks returned.
const mockPathname = jest.fn(() => '/desk');
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: () => ({ data: undefined }),
  useRecentBoards: () => ({ data: [] }),
}));

const mockDeskData = jest.fn(() => ({ folders: [] as unknown[], chips: [] as unknown[] }));
jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => {
    const data = mockDeskData() as unknown as Record<string, unknown[]>;
    if (!data) return { data };
    // Production's `live` is every non-archived row the composition saw, need
    // or no need; a fixture that only states folders and chips is stating the
    // same population through its two derived halves.
    return {
      data: {
        ...data,
        live:
          data.live ??
          [...(data.folders ?? []), ...(data.chips ?? [])].map(
            (entry) => (entry as { row: unknown }).row,
          ),
      },
    };
  },
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: null, signOut: jest.fn() }),
}));

let mockCallSheetFlag = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'call-sheet' ? mockCallSheetFlag : false,
  }),
}));

// Trap 2 (patina-testing): command-bar.tsx → ./overlays/post-sheet →
// @/lib/help-system/use-sheet-surface-key → @patina/help-system's barrel →
// HelpArticle → @portabletext/react, which throws a raw ESM SyntaxError
// under Jest. Mock the direct relative importers instead of fighting
// transformIgnorePatterns — none of their real behavior is under test here.
jest.mock('./overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

import { callSheetPending, CommandBar, openCommandBar } from './command-bar';
import { startBoardPending } from '@/lib/document/shelves';
import { DocumentAction } from './document-action';
import { PLAN_ROOM_SURFACE } from '@/lib/document/registry';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';

// A minimal document_state row — only the fields command-bar.tsx's own code
// paths read (folderTab, fillStateForDesk's active_section, the
// engagement/project id match), same fixture shape as
// __tests__/call-sheet-doorways.test.tsx's deskRow.
function deskRow(over: Record<string, unknown> = {}) {
  return {
    engagement_kind: 'project',
    engagement_id: 'eng-1',
    project_id: 'proj-1',
    proposal_id: null,
    lead_id: null,
    designer_id: 'designer-1',
    client_profile_id: 'client-1',
    client_name: 'Ellsworth',
    title: 'Ellsworth Residence',
    project_status: 'active',
    current_phase: 'procurement',
    active_section: 'project',
    is_paused: false,
    is_archived: false,
    proposal_status: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as any;
}

beforeEach(() => {
  mockCallSheetFlag = false;
  mockPathname.mockReturnValue('/desk');
  mockDeskData.mockReturnValue({ folders: [], chips: [] });
  mockPush.mockClear();
  window.localStorage.clear();
  startBoardPending.value = false;
});

/** The Desk header's actual control (desk/page.tsx:225-237), reproduced
 *  exactly enough to exercise the real click circuit rather than a stand-in. */
function FindAnythingButton() {
  return (
    <DocumentAction
      actionKey="find-anything"
      variant="tertiary"
      data-tour-anchor="desk-find-anything"
      onClick={openCommandBar}
    >
      Find anything
    </DocumentAction>
  );
}

describe('the Find anything → command bar circuit', () => {
  it('opens the command bar on a real click, with no simulated event', () => {
    render(
      <>
        <FindAnythingButton />
        <CommandBar />
      </>,
    );

    expect(screen.queryByRole('dialog', { name: 'Command bar' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /find anything/i }));

    expect(screen.getByRole('dialog', { name: 'Command bar' })).toBeInTheDocument();
  });
});

// SP-07 (A1-L4) — the Engine framing goes: placeholder, aria-label, and the
// no-match fallback ship the plain replacement copy, and the word "Engine"
// never appears anywhere in the rendered palette.
describe('SP-07 — the palette drops the Engine framing', () => {
  it('opens with the plain placeholder and aria-label', () => {
    render(
      <>
        <FindAnythingButton />
        <CommandBar />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /find anything/i }));

    const input = screen.getByRole('textbox', { name: 'Find anything' });
    expect(input).toHaveAttribute('placeholder', 'Find a document or a ledger…');
  });

  it('shows "No match" / "Try the Help Center" for a query with no hits', () => {
    render(
      <>
        <FindAnythingButton />
        <CommandBar />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /find anything/i }));

    const input = screen.getByRole('textbox', { name: 'Find anything' });
    fireEvent.change(input, { target: { value: 'zzz-no-such-thing-zzz' } });

    expect(screen.getByText('No match')).toBeInTheDocument();
    expect(screen.getByText('Try the Help Center')).toBeInTheDocument();
  });

  it('never renders the word "Engine" anywhere in the palette', () => {
    render(
      <>
        <FindAnythingButton />
        <CommandBar />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /find anything/i }));

    const dialog = screen.getByRole('dialog', { name: 'Command bar' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'anything' },
    });

    expect(dialog.textContent).not.toMatch(/\bEngine\b/);
  });
});

// ============================================================================
// SP-16/F50 (A2-L3) — ⌘K's typed search finds the plan room. Empty-query
// already carried "The plan room" as a "This surface" row; matchSurfaces()
// had no entry for it, so a typed "plan" fell through to "No match". Gated
// the same way the empty-query row is: only with a project document in hand.
// ============================================================================
describe('SP-16 — ⌘K typed search finds the plan room', () => {
  async function openPaletteAndType(query: string) {
    render(
      <>
        <FindAnythingButton />
        <CommandBar />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /find anything/i }));
    const input = screen.getByRole('textbox', { name: 'Find anything' });
    fireEvent.change(input, { target: { value: query } });
  }

  it('offers no match for "plan" without a document in hand', async () => {
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({ folders: [], chips: [] });

    await openPaletteAndType('plan');

    expect(screen.queryByText('Plan room')).not.toBeInTheDocument();
    expect(screen.getByText('No match')).toBeInTheDocument();
  });

  it('matches "plan", "plan room", "floor plan", "plans" and "drawings" with a document in hand', async () => {
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    for (const query of ['plan', 'plan room', 'floor plan', 'plans', 'drawings']) {
      const { unmount } = render(
        <>
          <FindAnythingButton />
          <CommandBar />
        </>,
      );
      fireEvent.click(screen.getByRole('button', { name: /find anything/i }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
        target: { value: query },
      });
      expect(screen.getByText('Plan room')).toBeInTheDocument();
      unmount();
    }
  });

  it('navigates to the in-hand engagement\'s plan room when chosen', async () => {
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    await openPaletteAndType('plan room');

    fireEvent.click(screen.getByText('Plan room').closest('button')!);

    expect(mockPush).toHaveBeenCalledWith('/doc/eng-1/plans');
  });

  it('carries the help doorway every registry entry owes', () => {
    // surface-key-parity.test.ts can only audit ALL_STUDIO_SURFACES, which
    // this row deliberately sits outside of; the same contract is pinned here
    // so staying out of that list is not a way out of the audit.
    expect(PLAN_ROOM_SURFACE.help?.surfaceKey).toBe(DOCUMENT_SURFACE_KEYS.plans);
    expect(PLAN_ROOM_SURFACE.help?.blurb.trim().length).toBeGreaterThan(0);
    expect(PLAN_ROOM_SURFACE.help?.blurb).not.toContain('\n');
  });
});

// ============================================================================
// F21 (A2-L3) — closing ⌘K restores focus to whatever opened it.
// ============================================================================
describe('F21 — ⌘K restores focus to the opener on close', () => {
  it('returns focus to the control that opened it after Esc', async () => {
    render(
      <>
        <FindAnythingButton />
        <CommandBar />
      </>,
    );
    const opener = screen.getByRole('button', { name: /find anything/i });
    opener.focus();
    fireEvent.click(opener);

    const input = await screen.findByRole('textbox', { name: 'Find anything' });
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command bar' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('yields to a modal the chosen row opened instead of pulling focus out of it', async () => {
    render(
      <>
        <FindAnythingButton />
        <CommandBar />
      </>,
    );
    const opener = screen.getByRole('button', { name: /find anything/i });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Find anything' })).toHaveFocus(),
    );

    // A chosen ledger row closes the palette and opens a sheet in the same
    // handler, so the sheet is already mounted and focused when the restore
    // frame runs.
    const sheet = document.createElement('div');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    const insideSheet = document.createElement('button');
    sheet.appendChild(insideSheet);
    document.body.appendChild(sheet);

    fireEvent.keyDown(window, { key: 'Escape' });
    insideSheet.focus();

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Command bar' }),
      ).not.toBeInTheDocument(),
    );
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(insideSheet).toHaveFocus();
    expect(opener).not.toHaveFocus();
    sheet.remove();
  });
});

// ============================================================================
// A3-L3 — ⌘K becomes a printed doorway (F04, F13, F17, F29/F48/F50/F82, F37).
// ============================================================================

/** A live folder row: the Desk's own shape, with the need line ⌘K reads. */
function folder(over: Record<string, unknown>, needText?: string) {
  return { row: deskRow(over), ...(needText ? { need: { text: needText } } : {}) };
}

function openPalette() {
  render(
    <>
      <FindAnythingButton />
      <CommandBar />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: /find anything/i }));
  return screen.getByRole('dialog', { name: 'Command bar' });
}

describe('F04 — the empty query leads with Where the work stands', () => {
  const studio = {
    folders: [
      folder(
        {
          engagement_id: 'eng-okonkwo',
          project_id: 'proj-okonkwo',
          client_name: 'Okonkwo',
          title: 'Okonkwo kitchen',
          active_section: 'install',
        },
        'punch list open',
      ),
      folder({
        engagement_id: 'eng-vandersteen',
        project_id: 'proj-vandersteen',
        client_name: 'Vandersteen',
        title: 'Vandersteen residence',
        active_section: 'project',
      }),
    ],
    chips: [
      {
        row: deskRow({
          engagement_id: 'eng-byrne',
          engagement_kind: 'proposal',
          project_id: null,
          client_name: 'Byrne',
          title: 'The Byrne remodel',
          active_section: 'proposal',
        }),
        text: 'sent Aug 19',
      },
    ],
  };

  it('prints the group first, with one row per live stage', () => {
    mockDeskData.mockReturnValue(studio as never);

    const dialog = openPalette();

    expect(screen.getByText('Where the work stands')).toBeInTheDocument();
    expect(screen.getByText('In install · 1')).toBeInTheDocument();
    expect(screen.getByText('Okonkwo kitchen · punch list open')).toBeInTheDocument();
    expect(screen.getByText('In procurement · 1')).toBeInTheDocument();
    expect(screen.getByText('Out for signature · 1')).toBeInTheDocument();
    // No document sits in the other four stages, so no row claims one.
    expect(screen.queryByText(/^In discovery/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^In care/)).not.toBeInTheDocument();

    // It is the FIRST group — it stands above "Rooms & ledgers".
    const text = dialog.textContent ?? '';
    expect(text.indexOf('Where the work stands')).toBeLessThan(
      text.indexOf('Rooms & ledgers'),
    );
  });

  it('opens that job from its stage row', () => {
    mockDeskData.mockReturnValue(studio as never);

    openPalette();
    fireEvent.click(screen.getByText('In install · 1').closest('button')!);

    expect(mockPush).toHaveBeenCalledWith('/doc/eng-okonkwo');
  });

  it('filters the same group when a stage word is typed, instead of No match', () => {
    mockDeskData.mockReturnValue(studio as never);

    openPalette();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'install' },
    });

    expect(screen.getByText('Where the work stands')).toBeInTheDocument();
    expect(screen.getByText('In install · 1')).toBeInTheDocument();
    expect(screen.queryByText('In procurement · 1')).not.toBeInTheDocument();
    expect(screen.queryByText('No match')).not.toBeInTheDocument();
  });

  it('filters to the proposal stage on "proposal"', () => {
    mockDeskData.mockReturnValue(studio as never);

    openPalette();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'proposal' },
    });

    expect(screen.getByText('Out for signature · 1')).toBeInTheDocument();
    expect(screen.queryByText('No match')).not.toBeInTheDocument();
  });

  it('counts every live document, not only the ones that derived a need or a motion', () => {
    // `folders` and `chips` are the two DERIVED populations: a document with
    // neither lands in neither, and chips are capped at MAX_MOTION_CHIPS.
    // Counting the studio's stages off them printed an undercount.
    mockDeskData.mockReturnValue({
      folders: [],
      chips: [],
      live: [
        deskRow({ engagement_id: 'eng-a', active_section: 'project' }),
        deskRow({ engagement_id: 'eng-b', active_section: 'project' }),
        deskRow({ engagement_id: 'eng-c', active_section: 'care' }),
      ],
    } as never);

    openPalette();

    expect(screen.getByText('Where the work stands')).toBeInTheDocument();
    expect(screen.getByText('In procurement · 2')).toBeInTheDocument();
    expect(screen.getByText('In care · 1')).toBeInTheDocument();
  });
});

describe('F39/F65 — a stage phrase opens the palette already typed', () => {
  it('pre-types the stage the doorway asked for', () => {
    mockDeskData.mockReturnValue({
      folders: [],
      chips: [],
      live: [
        deskRow({ engagement_id: 'eng-okonkwo', title: 'Okonkwo kitchen', active_section: 'install' }),
        deskRow({ engagement_id: 'eng-v', title: 'Vandersteen residence', active_section: 'project' }),
      ],
    } as never);
    render(<CommandBar />);

    fireEvent(
      window,
      new CustomEvent('document:open-command-bar', { detail: { query: 'install' } }),
    );

    expect(screen.getByRole('textbox', { name: 'Find anything' })).toHaveValue('install');
    expect(screen.getByText('Where the work stands')).toBeInTheDocument();
    expect(screen.getByText('In install · 1')).toBeInTheDocument();
    expect(screen.queryByText('In procurement · 1')).not.toBeInTheDocument();
  });

  it('opens empty when the doorway named no stage', () => {
    render(<CommandBar />);

    fireEvent(window, new CustomEvent('document:open-command-bar'));

    expect(screen.getByRole('textbox', { name: 'Find anything' })).toHaveValue('');
  });
});

describe('F29/F48/F50/F82 — This surface carries all four document surfaces', () => {
  it('prints four rows with a project document in hand', () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();

    expect(screen.getByText('This surface')).toBeInTheDocument();
    for (const label of ['Plan room', 'Spec book', 'Boards', 'Call sheet']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('this project · the current set')).toHaveLength(1);
    expect(screen.getByText('this project · by room')).toBeInTheDocument();
    expect(screen.getByText('this project · the boards')).toBeInTheDocument();
    expect(screen.getByText('this project · who is on the job')).toBeInTheDocument();
  });

  it('prints none of the four without a document in hand', () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({ folders: [], chips: [] });

    openPalette();

    expect(screen.queryByText('This surface')).not.toBeInTheDocument();
    for (const label of ['Plan room', 'Spec book', 'Boards', 'Call sheet']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('walks into the spec book of the document in hand', () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();
    fireEvent.click(screen.getByText('Spec book').closest('button')!);

    expect(mockPush).toHaveBeenCalledWith('/doc/proj-1/spec-book');
  });

  // B1-L4/F62 — one Boards door, one name. The row used to read `Mood boards`
  // and open the most recent board (or the document) because the boards had no
  // index route below 1440; it now names the page that exists.
  it('opens the boards page of the document in hand, labelled Boards', () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();

    expect(screen.getByText('Boards')).toBeInTheDocument();
    expect(screen.queryByText('Mood boards')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Boards').closest('button')!);
    expect(mockPush).toHaveBeenCalledWith('/doc/eng-1/boards');
  });

  it('offers one boards door for a typed `board`, not three', () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'board' },
    });

    expect(screen.getAllByText('Boards')).toHaveLength(1);
    expect(screen.queryByText('Drafting Room')).not.toBeInTheDocument();
    expect(screen.queryByText('Mood boards')).not.toBeInTheDocument();
  });

  it('pairs each surface with the most recent document from the Desk', () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({
      folders: [
        {
          row: deskRow({
            engagement_id: 'eng-v',
            project_id: 'proj-v',
            client_name: 'Vandersteen',
            title: 'Vandersteen residence',
          }),
        },
      ],
      chips: [],
    } as never);

    openPalette();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'spec book' },
    });

    expect(screen.getByText('Spec book · Vandersteen')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Spec book · Vandersteen').closest('button')!);
    expect(mockPush).toHaveBeenCalledWith('/doc/proj-v/spec-book');
  });

  it('walks a paired call sheet to the document it names instead of firing into nothing', () => {
    // The roster sheet is mounted on /doc/[id] and nowhere else, so from the
    // Desk the event has no listener: the row has to travel first, carrying
    // its intent in the pending flag the document reads on arrival.
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({
      folders: [
        {
          row: deskRow({
            engagement_id: 'eng-v',
            project_id: 'proj-v',
            client_name: 'Vandersteen',
            title: 'Vandersteen residence',
          }),
        },
      ],
      chips: [],
    } as never);
    const dispatched: Event[] = [];
    const listener = (event: Event) => dispatched.push(event);
    window.addEventListener('document:open-call-sheet', listener);

    openPalette();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'roster' },
    });
    fireEvent.click(screen.getByText('Call sheet · Vandersteen').closest('button')!);
    window.removeEventListener('document:open-call-sheet', listener);

    expect(dispatched).toHaveLength(0);
    expect(mockPush).toHaveBeenCalledWith('/doc/eng-v');
    expect(callSheetPending.value).toBe(true);
    callSheetPending.value = false;
  });

  it('opens the roster in place when the document it names is already in hand', () => {
    mockCallSheetFlag = true;
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);
    const dispatched: Event[] = [];
    const listener = (event: Event) => dispatched.push(event);
    window.addEventListener('document:open-call-sheet', listener);

    openPalette();
    fireEvent.click(screen.getByText('Call sheet').closest('button')!);
    window.removeEventListener('document:open-call-sheet', listener);

    expect(dispatched).toHaveLength(1);
    expect(callSheetPending.value).toBe(false);
  });
});

describe('D4\' — ⌘K offers a Start a board… command', () => {
  it('prints it in This surface with a project document in hand', () => {
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();

    expect(screen.getByText('Start a board…')).toBeInTheDocument();
    expect(screen.getByText('Ellsworth · new mood board')).toBeInTheDocument();
  });

  it('routes to the project’s Boards page and sets the pending flag so the picker opens there', () => {
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();
    fireEvent.click(screen.getByText('Start a board…').closest('button')!);

    expect(mockPush).toHaveBeenCalledWith('/doc/proj-1/boards');
    expect(startBoardPending.value).toBe(true);
  });

  it('is reachable by typing "start a board" or "new board"', () => {
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'new board' },
    });

    expect(screen.getByText('Start a board…')).toBeInTheDocument();
  });

  it('pairs with the most recent project when off any document', () => {
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({
      folders: [
        {
          row: deskRow({
            engagement_id: 'eng-v',
            project_id: 'proj-v',
            client_name: 'Vandersteen',
            title: 'Vandersteen residence',
          }),
        },
      ],
      chips: [],
    } as never);

    openPalette();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find anything' }), {
      target: { value: 'start a board' },
    });

    expect(screen.getByText('Start a board…')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start a board…').closest('button')!);
    expect(mockPush).toHaveBeenCalledWith('/doc/proj-v/boards');
  });

  it('does not offer it without any project context at all', () => {
    mockPathname.mockReturnValue('/desk');
    mockDeskData.mockReturnValue({ folders: [], chips: [] });

    openPalette();

    expect(screen.queryByText('Start a board…')).not.toBeInTheDocument();
  });
});

describe('F37 / F13 / F17 — the order, the titles, and the renamed room', () => {
  it('stands Rooms & ledgers above Begin', () => {
    const dialog = openPalette();
    const text = dialog.textContent ?? '';

    expect(text.indexOf('Rooms & ledgers')).toBeGreaterThan(-1);
    expect(text.indexOf('Rooms & ledgers')).toBeLessThan(text.indexOf('Begin'));
  });

  it('prints a recent row by its full title, not its family tab', () => {
    window.localStorage.setItem(
      'patina:recent-documents-in-hand',
      JSON.stringify([
        { id: 'eng-9', title: 'Aspen guest house', subtitle: 'Aspen' },
      ]),
    );

    openPalette();

    expect(screen.getByText('Aspen guest house')).toBeInTheDocument();
  });

  it('names the scans, and the words "The Rooms" appear nowhere', () => {
    const dialog = openPalette();

    expect(screen.getByText('The Scans')).toBeInTheDocument();
    expect(screen.getByText('measured rooms, from the field')).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('The Rooms');
  });
});

describe('F08 — the ⌘K invoice door names its scope', () => {
  it('reads "Draw an invoice · {Project}"', () => {
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] } as never);

    openPalette();

    expect(screen.getByText('Draw an invoice · Ellsworth')).toBeInTheDocument();
  });
});
