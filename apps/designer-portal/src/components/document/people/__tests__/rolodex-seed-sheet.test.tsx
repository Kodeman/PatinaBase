import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StudioContact } from '@patina/supabase';
import { RolodexSeedSheet } from '../directory/rolodex-seed-sheet';

const archiveMutateAsync = jest.fn();
const restoreMutateAsync = jest.fn();
const updateContactMutateAsync = jest.fn();

const CONTACTS: StudioContact[] = [
  {
    id: 'person-1',
    organization_id: 'org-1',
    entity_kind: 'person',
    company_id: null,
    contact_kind: 'sub',
    full_name: 'Rosa Martínez',
    company_name: null,
    email: null,
    phone: null,
    phone_e164: null,
    specialties: ['tile'],
    vendor_id: null,
    profile_id: null,
    created_by: null,
    notes: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'company-1',
    organization_id: 'org-1',
    entity_kind: 'company',
    company_id: null,
    contact_kind: 'vendor',
    full_name: null,
    company_name: 'Hale Brothers Builders',
    email: null,
    phone: null,
    phone_e164: null,
    specialties: [],
    vendor_id: null,
    profile_id: null,
    created_by: null,
    notes: null,
    archived_at: '2026-02-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useStudioContacts: jest.fn(() => ({ data: CONTACTS, isLoading: false })),
  useArchiveStudioContact: () => ({ mutateAsync: archiveMutateAsync, isPending: false }),
  useRestoreStudioContact: () => ({ mutateAsync: restoreMutateAsync, isPending: false }),
  // F3-R1-07 — the sheet now nests AddPersonSheet's edit mode; stub just
  // enough of its own hook surface for it to mount.
  useUpdateStudioContact: () => ({ mutateAsync: updateContactMutateAsync, isPending: false }),
  useStudioIdentity: () => ({ data: null, isLoading: false }),
  useAddClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFindOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSaveVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'designer-1' } }),
}));

jest.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: [] }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  archiveMutateAsync.mockReset();
  restoreMutateAsync.mockReset();
  updateContactMutateAsync.mockReset();
  archiveMutateAsync.mockResolvedValue(CONTACTS[0]);
  restoreMutateAsync.mockResolvedValue(CONTACTS[1]);
  updateContactMutateAsync.mockResolvedValue(CONTACTS[0]);
});

describe('RolodexSeedSheet — archive/restore', () => {
  it('a live row calls the archive hook with its id', async () => {
    render(
      <RolodexSeedSheet open onClose={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(archiveMutateAsync).toHaveBeenCalledWith({ id: 'person-1' });
    expect(restoreMutateAsync).not.toHaveBeenCalled();
  });

  it('an archived row calls the restore hook with its id', async () => {
    render(
      <RolodexSeedSheet open onClose={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(restoreMutateAsync).toHaveBeenCalledWith({ id: 'company-1' });
    expect(archiveMutateAsync).not.toHaveBeenCalled();
  });

  it('an admin-gate rejection surfaces as an inline band, not a thrown alert', async () => {
    archiveMutateAsync.mockRejectedValueOnce(
      new Error('new row violates row-level security policy'),
    );

    render(
      <RolodexSeedSheet open onClose={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(screen.getByText('Ask an owner or admin to archive this.')).toBeInTheDocument(),
    );
  });
});

describe('RolodexSeedSheet — Edit opens the card editor (F3-R1-07)', () => {
  it('shows Edit only on a live row, and opens AddPersonSheet prefilled from that card', () => {
    renderWithClient(
      <RolodexSeedSheet open onClose={jest.fn()} organizationId="org-1" />,
    );

    // The archived company card gets no Edit door — makers/archived cards
    // stay read-only.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByText('Edit Rosa Martínez')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Rosa Martínez');
  });

  it('saves through useUpdateStudioContact and closes the editor', async () => {
    renderWithClient(
      <RolodexSeedSheet open onClose={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone (optional)'), {
      target: { value: '5559876543' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateContactMutateAsync).toHaveBeenCalledWith({
      id: 'person-1',
      organizationId: 'org-1',
      phone: '5559876543',
    }));
    await waitFor(() =>
      expect(screen.queryByText('Edit Rosa Martínez')).not.toBeInTheDocument(),
    );
  });

  // F3-R2-11 — a save via this door acknowledges itself instead of silently
  // landing back on the review list.
  it('shows the save confirmation inline after closing the editor', async () => {
    renderWithClient(
      <RolodexSeedSheet open onClose={jest.fn()} organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone (optional)'), {
      target: { value: '5559876543' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByText(/Rosa Martínez.*saved/)).toBeInTheDocument(),
    );
  });
});

describe('RolodexSeedSheet — DONE closes', () => {
  it('the scored DONE word closes the sheet', () => {
    const onClose = jest.fn();
    render(<RolodexSeedSheet open onClose={onClose} organizationId="org-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RolodexSeedSheet — closed', () => {
  it('renders nothing when not open', () => {
    const { container } = render(
      <RolodexSeedSheet open={false} onClose={jest.fn()} organizationId="org-1" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
