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
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: () => ({ data: undefined }),
  useRecentBoards: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-desk-engagements', () => ({
  useDeskEngagements: () => ({ data: undefined }),
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
