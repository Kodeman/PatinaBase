import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { StudioContact } from '@patina/supabase';
import { RolodexSeedSheet } from '../directory/rolodex-seed-sheet';

const archiveMutateAsync = jest.fn();
const restoreMutateAsync = jest.fn();

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
  useStudioContacts: jest.fn(() => ({ data: CONTACTS, isLoading: false })),
  useArchiveStudioContact: () => ({ mutateAsync: archiveMutateAsync, isPending: false }),
  useRestoreStudioContact: () => ({ mutateAsync: restoreMutateAsync, isPending: false }),
}));

beforeEach(() => {
  archiveMutateAsync.mockReset();
  restoreMutateAsync.mockReset();
  archiveMutateAsync.mockResolvedValue(CONTACTS[0]);
  restoreMutateAsync.mockResolvedValue(CONTACTS[1]);
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
