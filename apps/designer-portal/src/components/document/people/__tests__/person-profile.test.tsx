/**
 * J7 — the person profile's Nurture card must read the same issuance evidence
 * (deriveIssuanceState: paper → sent → draft) deriveRelationshipLine and
 * isNurtureDue read, rather than reimplementing "proposal sent" off bare
 * status_raw a third time. See
 * apps/designer-portal/src/lib/document/people-derivation.ts.
 *
 * F3 also lives here: the client branch's "Edit details" door (opens the
 * existing HouseholdSheet standalone) and the studio-contact/gc/trade
 * branches' "Edit" door (opens AddPersonSheet's edit mode), including the
 * archived-card hide.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StudioContact } from '@patina/supabase';
import { PersonProfile } from '../views/person-profile';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockPersonData: Record<string, unknown> | null = null;
let mockStudioContact: StudioContact | null = null;

jest.mock('@patina/supabase', () => ({
  usePerson: () => ({ data: mockPersonData, isLoading: false }),
  useClient: () => ({ data: null }),
  useClientProjects: () => ({ data: [] }),
  useProposals: () => ({ data: [] }),
  useClientDecisions: () => ({ data: [] }),
  useThreads: () => ({ data: [] }),
  useNurtureTouchpoints: () => ({ data: [] }),
  useClientReviews: () => ({ data: [] }),
  useStartDirectThread: () => ({ mutate: jest.fn() }),
  useStyles: () => ({ data: [] }),
  // F3 — HouseholdSheet ("Edit details") and AddPersonSheet's edit mode
  // ("Edit"), both now reachable from this component's tree.
  useDesignerClientForClientUser: () => ({ data: undefined }),
  useUpdateClientContact: () => ({ mutate: jest.fn(), isPending: false }),
  useStudioContact: () => ({ data: mockStudioContact }),
  useUpdateStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFindOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSaveVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStudioIdentity: () => ({ data: null, isLoading: false }),
}));

jest.mock('@/hooks/use-person-documents', () => ({
  usePersonDocuments: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => null,
}));

jest.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'designer-1' } }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function studioContact(over: Partial<StudioContact> = {}): StudioContact {
  return {
    id: 'contact-1',
    organization_id: 'org-1',
    entity_kind: 'person',
    company_id: null,
    contact_kind: 'other',
    full_name: 'Priya Raman',
    company_name: null,
    email: 'priya@example.com',
    phone: '5551234567',
    phone_e164: '+15551234567',
    specialties: [],
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

// The client-role path under test never renders MakerProfile, but
// person-profile.tsx imports it eagerly at module scope — its own import
// chain (command-bar → post-sheet → @patina/help-system →
// @portabletext/react) ships ESM Jest doesn't transform. Stub it out rather
// than pull that unrelated chain into a client-profile test.
jest.mock('../profile/maker-profile', () => ({
  MakerProfile: () => null,
}));

function basePerson(overrides: Record<string, unknown>) {
  return {
    person_id: 'client-1',
    role: 'client',
    display_name: 'Harper Vale',
    email: 'harper@example.com',
    phone: null,
    profile_id: 'profile-1',
    project_id: null,
    designer_id: 'designer-1',
    status_raw: 'proposal',
    last_touch_at: new Date().toISOString(),
    meta: {},
    scope: 'mine',
    ...overrides,
  };
}

describe('PersonProfile — Nurture card (J7)', () => {
  it('reads a merely-drafted, never-sent proposal honestly, not as an overdue nudge', () => {
    mockPersonData = basePerson({ meta: { has_sent_proposal: false } });
    render(
      <PersonProfile
        personId="client-1"
        role="client"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Still drafting — nothing has gone to them yet.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Proposal out.*nudge or a call may be overdue/),
    ).not.toBeInTheDocument();
  });

  it('keeps the old overdue-nudge copy once the proposal was actually sent', () => {
    mockPersonData = basePerson({ meta: { has_sent_proposal: true } });
    render(
      <PersonProfile
        personId="client-1"
        role="client"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Proposal out — a nudge or a call may be overdue.'),
    ).toBeInTheDocument();
  });

  it('a missing has_sent_proposal signal fails closed to the honest draft copy', () => {
    mockPersonData = basePerson({ meta: {} });
    render(
      <PersonProfile
        personId="client-1"
        role="client"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Still drafting — nothing has gone to them yet.'),
    ).toBeInTheDocument();
  });

  it('names a paper issuance for what it is — neither a send nor a draft', () => {
    mockPersonData = basePerson({ meta: { issued_on_paper: true } });
    render(
      <PersonProfile
        personId="client-1"
        role="client"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Handed over on paper — waiting on the signed copy to record.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Proposal out — a nudge or a call may be overdue.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Still drafting — nothing has gone to them yet.'),
    ).not.toBeInTheDocument();
  });
});

describe('PersonProfile — client "Edit details" opens the household sheet standalone (F3)', () => {
  it('opens HouseholdSheet for a captured client', () => {
    mockPersonData = basePerson({ role: 'client', meta: {} });
    renderWithClient(
      <PersonProfile
        personId="client-1"
        role="client"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getAllByText('The household').length).toBeGreaterThan(0);
  });

  it('never offers Edit details for a bare lead — its personId is a leads.id, not a designer_clients.id', () => {
    mockPersonData = basePerson({ role: 'lead', meta: {} });
    renderWithClient(
      <PersonProfile
        personId="lead-1"
        role="lead"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});

describe('PersonProfile — rolodex "Edit" on a studio-contact-backed profile (F3)', () => {
  it('shows Edit for a pure rolodex card (role contact) and opens AddPersonSheet’s edit mode', () => {
    mockPersonData = basePerson({
      person_id: 'contact-1',
      role: 'contact',
      display_name: 'Priya Raman',
      meta: {},
    });
    mockStudioContact = studioContact({ id: 'contact-1', full_name: 'Priya Raman' });
    renderWithClient(
      <PersonProfile
        personId="contact-1"
        role="contact"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Edit Priya Raman')).toBeInTheDocument();
  });

  it('hides Edit when the backing card is archived', () => {
    mockPersonData = basePerson({
      person_id: 'contact-1',
      role: 'contact',
      display_name: 'Priya Raman',
      meta: {},
    });
    mockStudioContact = studioContact({
      id: 'contact-1',
      archived_at: '2026-01-02T00:00:00Z',
    });
    renderWithClient(
      <PersonProfile
        personId="contact-1"
        role="contact"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('offers "Edit rolodex card" (not the bare "Edit") for a network/team party folded into the rolodex via meta.studio_contact_id — the head still shows the party row, not this card (F3-R1-05)', () => {
    mockPersonData = basePerson({
      person_id: 'party-1',
      role: 'architect',
      display_name: 'Dana Wu',
      meta: { studio_contact_id: 'contact-2' },
    });
    mockStudioContact = studioContact({ id: 'contact-2', full_name: 'Dana Wu' });
    renderWithClient(
      <PersonProfile
        personId="party-1"
        role="architect"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit rolodex card' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('hides Edit for a party never folded into the rolodex', () => {
    mockPersonData = basePerson({
      person_id: 'party-1',
      role: 'architect',
      display_name: 'Dana Wu',
      meta: {},
    });
    mockStudioContact = null;
    renderWithClient(
      <PersonProfile
        personId="party-1"
        role="architect"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  // F3-R2-13 — a background refetch (or someone archiving the card) must
  // never unmount an open edit sheet out from under the designer without
  // explanation.
  it('closes an open edit sheet with an explanation instead of silently vanishing when the card is archived mid-edit', () => {
    mockPersonData = basePerson({
      person_id: 'contact-1',
      role: 'contact',
      display_name: 'Priya Raman',
      meta: {},
    });
    mockStudioContact = studioContact({ id: 'contact-1', full_name: 'Priya Raman' });
    const notify = jest.fn();
    const { rerender } = renderWithClient(
      <PersonProfile
        personId="contact-1"
        role="contact"
        onBack={jest.fn()}
        openThread={jest.fn()}
        openPerson={jest.fn()}
        goView={jest.fn()}
        notify={notify}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Edit Priya Raman')).toBeInTheDocument();

    // The card gets archived mid-edit (another tab, or someone else).
    mockStudioContact = studioContact({
      id: 'contact-1',
      full_name: 'Priya Raman',
      archived_at: '2026-01-02T00:00:00Z',
    });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <PersonProfile
          personId="contact-1"
          role="contact"
          onBack={jest.fn()}
          openThread={jest.fn()}
          openPerson={jest.fn()}
          goView={jest.fn()}
          notify={notify}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByText('Edit Priya Raman')).not.toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('reopen it to try again'),
    );
  });
});
