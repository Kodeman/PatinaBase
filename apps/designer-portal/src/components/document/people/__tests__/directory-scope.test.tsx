import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DirectoryView } from '../views/directory-view';
import { DEFAULT_CONTACT_SCOPE } from '../directory/scope-lens';
import { DIRECTORY_ROLES } from '@/lib/document/directory-roles';
import type { PeopleViewProps } from '../types';

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: jest.fn() }));
const mockUseFeatureFlag = useFeatureFlag as jest.Mock;

// The MarginNote teach line reports through the wayfinding emitter — mocked
// so this spec never loads posthog (same posture as margin-note.test.tsx).
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { wayfinding: { marginNote: jest.fn() } },
}));

// Captures the filters DirectoryView actually passes through to
// usePeopleDirectory — this is the whole point of the spec below: the U6/Wave
// 4 ruling ("BROWSE surfaces get the lens") only holds if the query itself is
// scoped, not just the ScopeLens toggle's visual state.
const mockUsePeopleDirectory = jest.fn(() => ({ data: [], isLoading: false }));

jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: (...args: unknown[]) => mockUsePeopleDirectory(...args),
  useStudioContacts: jest.fn(() => ({ data: [], isLoading: false })),
  useArchiveStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRestoreStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // The real predicate (00281's FIELD_ROSTER_ROLES) — reimplemented rather than
  // requireActual so this spec stays a pure unit test of DirectoryView's chip
  // wiring, not a transitive test of every hook module @patina/supabase re-exports.
  isFieldRosterRole: (role: string | null | undefined) =>
    !!role && ['gc', 'sub', 'installer', 'receiver'].includes(role),
}));

beforeEach(() => {
  window.localStorage.clear();
  mockUsePeopleDirectory.mockClear();
});

const NAV: PeopleViewProps = {
  openPerson: jest.fn(),
  openThread: jest.fn(),
  goView: jest.fn(),
  notify: jest.fn(),
};

function renderDirectory(overrides: Partial<Parameters<typeof DirectoryView>[0]> = {}) {
  return render(
    <DirectoryView
      {...NAV}
      role="all"
      onRoleChange={jest.fn()}
      makerLens="roster"
      onMakerLens={jest.fn()}
      search=""
      onAddPerson={jest.fn()}
      organizationId="org-1"
      scope="mine"
      onScopeChange={jest.fn()}
      {...overrides}
    />,
  );
}

const LEGACY_CHIPS = ['All', 'Clients', 'Leads', 'Makers', 'Field', 'Team'];
const CALL_SHEET_CHIPS = [
  'All',
  'Field',
  'Clients',
  'Leads',
  'Makers',
  'Team',
  'GCs',
  'Subs',
  'Installers',
  'Receivers',
  'Companies',
];

describe('DirectoryView — role chip set, flag off', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue({ value: false, isLoading: false });
  });

  it('renders exactly the pre-Wave-2 chip set', () => {
    renderDirectory();
    for (const label of LEGACY_CHIPS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    for (const label of ['GCs', 'Subs', 'Installers', 'Receivers', 'Companies']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('never mounts the ScopeLens', () => {
    renderDirectory();
    expect(screen.queryByRole('button', { name: 'mine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'studio' })).not.toBeInTheDocument();
  });
});

describe('DirectoryView — role chip set, flag on', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: false });
  });

  it('renders the Call Sheet Wave 2 chip set, including the field-kind singles and Companies', () => {
    renderDirectory();
    for (const label of CALL_SHEET_CHIPS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('the lens reflects MINE when the Room passes it (a controlled prop, not its own default)', () => {
    renderDirectory({ scope: 'mine' });
    expect(screen.getByRole('button', { name: 'mine' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'studio' })).not.toHaveAttribute('aria-current');
  });

  it('the lens reflects STUDIO when the Room passes it', () => {
    renderDirectory({ scope: 'studio' });
    expect(screen.getByRole('button', { name: 'studio' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'mine' })).not.toHaveAttribute('aria-current');
  });
});

describe('DirectoryView — U6 (Wave 4): STUDIO is the default lens', () => {
  it("scope-lens.tsx's DEFAULT_CONTACT_SCOPE — the Room's single source of truth — is 'studio'", () => {
    expect(DEFAULT_CONTACT_SCOPE).toBe('studio');
  });
});

describe('DirectoryView — U6 (Wave 4): the lens actually filters the query', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: false });
  });

  it('STUDIO (the default) passes no scope filter — the unfiltered, RLS-admitted read', () => {
    renderDirectory({ scope: 'studio' });
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({
      role: 'all',
      scope: undefined,
    });
  });

  it('toggling to MINE passes scope: "mine" through to the query', () => {
    renderDirectory({ scope: 'mine' });
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({
      role: 'all',
      scope: 'mine',
    });
  });

  it('MINE composes with a role chip other than "all"', () => {
    renderDirectory({ scope: 'mine', role: 'client' });
    expect(mockUsePeopleDirectory).toHaveBeenCalledWith({
      role: 'client',
      scope: 'mine',
    });
  });
});

describe('DirectoryView — the STUDIO-lens teach line (R94)', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue({ value: true, isLoading: false });
  });

  it('shows the teach line on first landing in STUDIO scope, with an underlined review link', () => {
    renderDirectory({ scope: 'studio' });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent("The whole studio’s book, not just yours.");
    const link = screen.getByRole('button', { name: 'review what seeded' });
    expect(link).toHaveClass('underline');
  });

  it('never shows the teach line in MINE scope', () => {
    renderDirectory({ scope: 'mine' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('never shows the teach line with the flag off, even in STUDIO scope', () => {
    mockUseFeatureFlag.mockReturnValue({ value: false, isLoading: false });
    renderDirectory({ scope: 'studio' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('recedes for good — marked seen in localStorage — the first time "review what seeded" fires', async () => {
    renderDirectory({ scope: 'studio' });
    expect(window.localStorage.getItem('patina:margin-note:rolodex-studio-lens')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'review what seeded' }));
    });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('patina:margin-note:rolodex-studio-lens')).not.toBeNull();
  });

  it('never renders once the note has already been seen, on a later mount', () => {
    window.localStorage.setItem('patina:margin-note:rolodex-studio-lens', String(Date.now()));
    renderDirectory({ scope: 'studio' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('People Room — the legacy ?role= param map stays pinned', () => {
  it('keeps every pre-Wave-2 role value, in its original order, before the new company value', () => {
    const legacy: readonly string[] = [
      'all',
      'field',
      'client',
      'lead',
      'maker',
      'team',
      'gc',
      'sub',
      'installer',
      'receiver',
    ];
    expect(DIRECTORY_ROLES.slice(0, legacy.length)).toEqual(legacy);
  });

  it('adds Call Sheet Wave 2\'s "company" additively, after every legacy value', () => {
    expect(DIRECTORY_ROLES[DIRECTORY_ROLES.length - 1]).toBe('company');
    expect(DIRECTORY_ROLES).toHaveLength(11);
  });
});
