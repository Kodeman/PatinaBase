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
  useDeskEngagements: () => ({ data: mockDeskData() }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: null, signOut: jest.fn() }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

// Trap 2 (patina-testing): command-bar.tsx → ./overlays/post-sheet →
// @/lib/help-system/use-sheet-surface-key → @patina/help-system's barrel →
// HelpArticle → @portabletext/react, which throws a raw ESM SyntaxError
// under Jest. Mock the direct relative importers instead of fighting
// transformIgnorePatterns — none of their real behavior is under test here.
jest.mock('./overlays/post-sheet', () => ({ openPost: jest.fn() }));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

import { CommandBar, openCommandBar } from './command-bar';
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
  mockPathname.mockReturnValue('/desk');
  mockDeskData.mockReturnValue({ folders: [], chips: [] });
  mockPush.mockClear();
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

    expect(screen.queryByText('The plan room')).not.toBeInTheDocument();
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
      expect(screen.getByText('The plan room')).toBeInTheDocument();
      unmount();
    }
  });

  it('navigates to the in-hand engagement\'s plan room when chosen', async () => {
    mockPathname.mockReturnValue('/doc/eng-1');
    mockDeskData.mockReturnValue({ folders: [{ row: deskRow() }], chips: [] });

    await openPaletteAndType('plan room');

    fireEvent.click(screen.getByText('The plan room').closest('button')!);

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
