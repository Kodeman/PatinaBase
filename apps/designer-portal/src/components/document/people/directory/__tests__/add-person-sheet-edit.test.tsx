/**
 * F3 — AddPersonSheet's EDIT mode. Passing `contact` (an existing
 * studio_contacts row) prefills the Name/Company/Trade/Phone/Email fields,
 * hides the kind choice (entity_kind/contact_kind stay locked), renames the
 * submit control to "Save", and calls `useUpdateStudioContact` with only the
 * fields that actually changed.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StudioContact } from '@patina/supabase';
import { AddPersonSheet } from '../add-person-sheet';

const updateMutateAsync = jest.fn();

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'designer-1' } }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useStudioIdentity: () => ({ data: { name: 'Middle West Studio' }, isLoading: false }),
  useUpdateStudioContact: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function contact(over: Partial<StudioContact> = {}): StudioContact {
  return {
    id: 'contact-1',
    organization_id: 'org-1',
    entity_kind: 'person',
    company_id: null,
    contact_kind: 'sub',
    full_name: 'Sal Moretti',
    company_name: 'Moretti Plumbing',
    email: 'sal@morettiplumbing.com',
    phone: '5551234567',
    phone_e164: '+15551234567',
    specialties: ['plumbing'],
    vendor_id: null,
    profile_id: null,
    created_by: 'designer-1',
    notes: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  updateMutateAsync.mockReset();
  updateMutateAsync.mockResolvedValue(contact());
});

describe('AddPersonSheet — edit mode', () => {
  it('prefills Name/Company/Trade/Phone/Email from the record and hides the kind choice', () => {
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={contact()} />,
    );

    expect(screen.getByLabelText('Name')).toHaveValue('Sal Moretti');
    expect(screen.getByLabelText('Company (optional)')).toHaveValue('Moretti Plumbing');
    expect(screen.getByLabelText('Trade (optional)')).toHaveValue('plumbing');
    expect(screen.getByLabelText('Phone (optional)')).toHaveValue('5551234567');
    expect(screen.getByLabelText('Email (optional)')).toHaveValue('sal@morettiplumbing.com');

    expect(screen.queryByText('a client')).not.toBeInTheDocument();
    expect(screen.queryByText('a GC')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('titles the sheet with the card’s own name', () => {
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={contact()} />,
    );
    expect(screen.getByText('Edit Sal Moretti')).toBeInTheDocument();
  });

  it('sends only the changed field on save', async () => {
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={contact()} />,
    );

    fireEvent.change(screen.getByLabelText('Phone (optional)'), {
      target: { value: '5559876543' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      phone: '5559876543',
    });
  });

  it('never sends entityKind or contactKind — those stay locked', async () => {
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={contact()} />,
    );
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Sal R. Moretti' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).not.toHaveProperty('entityKind');
    expect(updateMutateAsync.mock.calls[0][0]).not.toHaveProperty('contactKind');
  });

  it('closes without writing when nothing changed', async () => {
    const onClose = jest.fn();
    renderWithClient(
      <AddPersonSheet open onClose={onClose} contact={contact()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it('reports the save through onSaved, not onAdded', async () => {
    const onSaved = jest.fn();
    const onAdded = jest.fn();
    renderWithClient(
      <AddPersonSheet
        open
        onClose={jest.fn()}
        contact={contact()}
        onAdded={onAdded}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByLabelText('Company (optional)'), {
      target: { value: 'Moretti Plumbing & Heating' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('uses the telemetry key "save-person" (not "add-person") for a rolodex save (F3-R1-11)', () => {
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={contact()} />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'data-action-key',
      'save-person',
    );
  });
});

describe('AddPersonSheet — edit mode, a company card (F3-R1-01 / F3-R1-16)', () => {
  it('labels the field "Company name" and diffs against company_name, not full_name — a no-op save writes nothing', async () => {
    const onClose = jest.fn();
    const companyContact = contact({
      entity_kind: 'company',
      contact_kind: 'vendor',
      full_name: null,
      company_name: 'Moretti Plumbing',
      specialties: [],
    });
    renderWithClient(
      <AddPersonSheet open onClose={onClose} contact={companyContact} />,
    );

    expect(screen.getByLabelText('Company name')).toHaveValue('Moretti Plumbing');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    // The separate "Company (optional)" field folds into the one field above
    // for a company card — it would otherwise duplicate the same value.
    expect(screen.queryByLabelText('Company (optional)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it('sends companyName, never fullName, when the company name changes', async () => {
    const companyContact = contact({
      entity_kind: 'company',
      contact_kind: 'vendor',
      full_name: null,
      company_name: 'Moretti Plumbing',
      specialties: [],
    });
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={companyContact} />,
    );

    fireEvent.change(screen.getByLabelText('Company name'), {
      target: { value: 'Moretti Plumbing & Heating' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      companyName: 'Moretti Plumbing & Heating',
    });
    expect(updateMutateAsync.mock.calls[0][0]).not.toHaveProperty('fullName');
  });
});

describe('AddPersonSheet — edit mode, a profile-holding card (F3-R1-06)', () => {
  it('hides Name/Phone/Email — self-managed on their Patina account — but keeps Trade/Company/Notes studio-editable', () => {
    renderWithClient(
      <AddPersonSheet
        open
        onClose={jest.fn()}
        contact={contact({ profile_id: 'user-1', notes: 'Prefers morning calls' })}
      />,
    );

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phone (optional)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email (optional)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Company (optional)')).toHaveValue('Moretti Plumbing');
    expect(screen.getByLabelText('Trade (optional)')).toHaveValue('plumbing');
    expect(screen.getByLabelText('Notes (optional)')).toHaveValue('Prefers morning calls');
  });

  it('never sends phone or email even if a stray edit slipped through — only trade/company/notes are diffable', async () => {
    renderWithClient(
      <AddPersonSheet
        open
        onClose={jest.fn()}
        contact={contact({ profile_id: 'user-1' })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Prefers morning calls' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      notes: 'Prefers morning calls',
    });
  });
});

describe('AddPersonSheet — edit mode, trade patches one specialty in place (F3-R1-09)', () => {
  it('keeps the rest of a multi-specialty card when only the first trade changes', async () => {
    const multiTrade = contact({ specialties: ['plumbing', 'gas', 'backflow'] });
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={multiTrade} />,
    );

    fireEvent.change(screen.getByLabelText('Trade (optional)'), {
      target: { value: 'hvac' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      specialties: ['hvac', 'gas', 'backflow'],
    });
  });

  it('drops only the first specialty when the trade is cleared, keeping the rest', async () => {
    const multiTrade = contact({ specialties: ['plumbing', 'gas', 'backflow'] });
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={multiTrade} />,
    );

    fireEvent.change(screen.getByLabelText('Trade (optional)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      specialties: ['gas', 'backflow'],
    });
  });
});

describe('AddPersonSheet — edit mode, Notes are editable on every card (F3-R2-06)', () => {
  it('renders and diffs Notes for a plain (non-profile) card alongside Phone/Email', async () => {
    renderWithClient(
      <AddPersonSheet
        open
        onClose={jest.fn()}
        contact={contact({ notes: null })}
      />,
    );

    expect(screen.getByLabelText('Notes (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Phone (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Email (optional)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Calls back fast' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      notes: 'Calls back fast',
    });
  });
});

describe('AddPersonSheet — edit mode, a profile-holder with no full_name on file (F3-R2-07)', () => {
  it('saves an unrelated field without the hidden Name field blocking it, and confirms with a fallback name', async () => {
    const onSaved = jest.fn();
    renderWithClient(
      <AddPersonSheet
        open
        onClose={jest.fn()}
        onSaved={onSaved}
        contact={contact({ profile_id: 'user-1', full_name: null, notes: null })}
      />,
    );

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Prefers texts' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      notes: 'Prefers texts',
    });
    // Falls back to company_name (contactDisplayName) since there's no name to quote.
    expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('Moretti Plumbing'));
  });
});

describe('AddPersonSheet — edit mode, a specialty outside the field-trade vocab (F3-R2-09)', () => {
  it('shows the original value as its own option instead of a blank control', () => {
    renderWithClient(
      <AddPersonSheet
        open
        onClose={jest.fn()}
        contact={contact({ specialties: ['upholstery'] })}
      />,
    );

    expect(screen.getByLabelText('Trade (optional)')).toHaveValue('upholstery');
    expect(screen.getByRole('option', { name: 'upholstery' })).toBeInTheDocument();
  });

  it('keeps the out-of-vocab specialty on an unrelated save', async () => {
    renderWithClient(
      <AddPersonSheet
        open
        onClose={jest.fn()}
        contact={contact({ specialties: ['upholstery'] })}
      />,
    );
    fireEvent.change(screen.getByLabelText('Company (optional)'), {
      target: { value: 'Moretti Home' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).not.toHaveProperty('specialties');
  });
});

describe('AddPersonSheet — edit mode, a company card that also carries profile_id (F3-R2-10)', () => {
  it('still shows and edits Company name — a studio-book fact, not the profile-holder’s identity', async () => {
    const companyWithProfile = contact({
      entity_kind: 'company',
      contact_kind: 'vendor',
      full_name: null,
      company_name: 'Moretti Plumbing',
      profile_id: 'user-1',
      specialties: [],
    });
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} contact={companyWithProfile} />,
    );

    expect(screen.getByLabelText('Company name')).toHaveValue('Moretti Plumbing');

    fireEvent.change(screen.getByLabelText('Company name'), {
      target: { value: 'Moretti Plumbing & Heating' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0]).toEqual({
      id: 'contact-1',
      organizationId: 'org-1',
      companyName: 'Moretti Plumbing & Heating',
    });
  });
});
