/**
 * J7 — the person profile's Nurture card must read the same honest
 * has_sent_proposal signal deriveRelationshipLine/isNurtureDue read, rather
 * than reimplementing "proposal sent" off bare status_raw a third time. See
 * apps/designer-portal/src/lib/document/people-derivation.ts.
 */
import { render, screen } from '@testing-library/react';
import { PersonProfile } from '../views/person-profile';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockPersonData: Record<string, unknown> | null = null;

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
}));

jest.mock('@/hooks/use-person-documents', () => ({
  usePersonDocuments: () => ({ data: [] }),
}));

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
});
