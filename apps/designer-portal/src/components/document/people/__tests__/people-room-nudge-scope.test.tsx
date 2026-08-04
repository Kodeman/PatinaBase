/**
 * W5 (Call Sheet nudge leak fix) — the Engine nudge on the People Room
 * (PeopleCompactSelector / PeopleDesktopRail's `nudge` prop) is a personal
 * relationship-action surface, same posture as NurtureView (see
 * nurture-view-scope.test.tsx): "studio visibility ≠ shared nurture queues."
 * Post-00420, `usePeopleDirectory({ role: 'all' })` reads studio-wide, so
 * feeding the nudge from that same read let it surface a studio-mate's
 * dormant tie, not just the signed-in designer's own. This spec pins that
 * the Room queries `usePeopleDirectory` TWICE — once unscoped (browse count
 * + ?person= deep-link resolution) and once with `scope: 'mine'` — and that
 * the nudge fed to the rail is derived from the MINE-scoped read, not the
 * studio-wide one. It fails if the nudge feed ever loses its mine pin.
 */
import { render } from '@testing-library/react';
import { PeopleRoom } from '../people-room';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

type DirectoryRow = {
  person_id: string;
  role: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  last_touch_at: string | null;
  scope: 'mine' | 'studio';
};

// A studio-mate's badly-dormant tie — present ONLY in the unscoped (studio)
// read, absent from the mine-scoped one. If the nudge ever regresses to
// reading the unscoped result, this row is the one that would leak through.
const STUDIO_MATE_DORMANT: DirectoryRow = {
  person_id: 'studio-mate-client',
  role: 'client',
  display_name: 'Studio-Mate Client',
  email: null,
  phone: null,
  last_touch_at: '2020-01-01T00:00:00.000Z',
  scope: 'studio',
};

const mockUsePeopleDirectory = jest.fn((filters?: { role?: string; scope?: string }) => {
  if (filters?.scope === 'mine') {
    // The signed-in designer has nothing dormant of their own.
    return { data: [] as DirectoryRow[], isLoading: false };
  }
  return { data: [STUDIO_MATE_DORMANT], isLoading: false };
});

jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: (...args: unknown[]) =>
    mockUsePeopleDirectory(...(args as [{ role?: string; scope?: string }?])),
  useOrganizations: () => ({ data: [] }),
  isFieldRosterRole: (role: string | null | undefined) =>
    !!role && ['gc', 'sub', 'installer', 'receiver'].includes(role),
}));

jest.mock('@/lib/help-system/use-document-surface', () => ({
  useDocumentSurface: jest.fn(),
}));

jest.mock('../../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
}));

jest.mock('../../rooms/room-shell', () => ({
  RoomShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../views/directory-view', () => ({
  DirectoryView: () => <div data-testid="directory-view" />,
}));
jest.mock('../views/person-profile', () => ({
  PersonProfile: () => <div data-testid="person-profile" />,
}));
jest.mock('../party-profile-sheet', () => ({
  PartyProfileSheet: () => <div data-testid="party-profile-sheet" />,
}));
jest.mock('../views/threads-view', () => ({
  ThreadsView: () => <div data-testid="threads-view" />,
}));
jest.mock('../views/nurture-view', () => ({
  NurtureView: () => <div data-testid="nurture-view" />,
}));
jest.mock('../views/reviews-view', () => ({
  ReviewsView: () => <div data-testid="reviews-view" />,
}));
jest.mock('../views/portfolio-view', () => ({
  PortfolioView: () => <div data-testid="portfolio-view" />,
}));
jest.mock('../views/outreach-view', () => ({
  OutreachView: () => <div data-testid="outreach-view" />,
}));
jest.mock('../profile/your-eye', () => ({
  YourEyePanel: () => <div data-testid="your-eye-panel" />,
}));
jest.mock('../directory/ask-bar', () => ({
  AskBar: () => <div data-testid="ask-bar" />,
  routePeopleAsk: jest.fn(() => null),
}));
jest.mock('../directory/add-person-sheet', () => ({
  AddPersonSheet: () => <div data-testid="add-person-sheet" />,
}));

let capturedNudge: unknown;
jest.mock('../view-shell', () => {
  const actual = jest.requireActual('../view-shell');
  return {
    ...actual,
    PeopleCompactSelector: (props: { nudge: unknown }) => {
      capturedNudge = props.nudge;
      return <div data-testid="people-compact-selector" />;
    },
    PeopleDesktopRail: (props: { nudge: unknown }) => {
      capturedNudge = props.nudge;
      return <div data-testid="people-desktop-rail" />;
    },
  };
});

describe('PeopleRoom — Engine nudge stays MINE-scoped', () => {
  beforeEach(() => {
    mockUsePeopleDirectory.mockClear();
    capturedNudge = undefined;
  });

  it('queries usePeopleDirectory both unscoped (browse/deep-link) and scope:"mine" (nudge)', () => {
    render(<PeopleRoom />);

    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({ role: 'all' });
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({
      role: 'all',
      scope: 'mine',
    });
  });

  it('never surfaces a studio-mate-only dormant tie as the nudge', () => {
    render(<PeopleRoom />);

    // The studio-mate's dormant tie only exists in the unscoped read; the
    // mine-scoped read (feeding the nudge) is empty, so the nudge must be
    // null — never "Studio-Mate Client".
    expect(capturedNudge).toBeNull();
  });
});
