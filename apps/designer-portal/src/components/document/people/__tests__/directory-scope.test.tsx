import { render, screen } from '@testing-library/react';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DirectoryView } from '../views/directory-view';
import { DIRECTORY_ROLES } from '@/lib/document/directory-roles';
import type { PeopleViewProps } from '../types';

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: jest.fn() }));
const mockUseFeatureFlag = useFeatureFlag as jest.Mock;

jest.mock('@patina/supabase', () => ({
  usePeopleDirectory: jest.fn(() => ({ data: [], isLoading: false })),
  useStudioContacts: jest.fn(() => ({ data: [], isLoading: false })),
  useArchiveStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRestoreStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // The real predicate (00281's FIELD_ROSTER_ROLES) — reimplemented rather than
  // requireActual so this spec stays a pure unit test of DirectoryView's chip
  // wiring, not a transitive test of every hook module @patina/supabase re-exports.
  isFieldRosterRole: (role: string | null | undefined) =>
    !!role && ['gc', 'sub', 'installer', 'receiver'].includes(role),
}));

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

  it('mounts the ScopeLens defaulting to MINE', () => {
    renderDirectory({ scope: 'mine' });
    expect(screen.getByRole('button', { name: 'mine' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'studio' })).not.toHaveAttribute('aria-current');
  });

  it('the lens reflects a STUDIO scope when the Room passes one', () => {
    renderDirectory({ scope: 'studio' });
    expect(screen.getByRole('button', { name: 'studio' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'mine' })).not.toHaveAttribute('aria-current');
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
