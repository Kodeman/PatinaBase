import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectRosterRow, StudioContact } from '@patina/supabase';
import { RolodexPicker } from '../rolodex-picker';

const addPartyMutate = jest.fn();
const addContactMutate = jest.fn();
/** CR5-1 — what `project_recorded_studio()` answers for this job. */
const recordedStudio = { current: 'org-1' as string | null };
const useStudioContacts = jest.fn();
const useProjectRoster = jest.fn();
const refetchRoster = jest.fn();

jest.mock('@patina/supabase', () => ({
  useAddProjectParty: () => ({ mutateAsync: addPartyMutate, isPending: false }),
  useAddStudioContact: () => ({ mutateAsync: addContactMutate, isPending: false }),
  useOrganizations: () => ({
    data: [{ id: 'org-1', type: 'design_studio' }],
    isLoading: false,
  }),
  useStudioContacts: (...args: unknown[]) => useStudioContacts(...args),
  useProjectRoster: (...args: unknown[]) => useProjectRoster(...args),
  // CR5-1: the stamp mints into the studio the JOB records, not the one
  // holding the book, so the picker reads that resolver.
  useProjectRecordedStudio: () => ({ data: recordedStudio.current }),
  useStudioContactHistory: () => ({
    data: {
      'contact-1': {
        projectCount: 3,
        lastProjectName: 'Ellsworth',
        lastAt: '2025-11-21T17:00:00Z',
      },
    },
  }),
  // The three words at the pick come from the directory, keyed on the rolodex
  // card (v4). One read for the page of hits.
  usePeopleDirectory: () => ({
    data: [
      {
        person_id: 'contact-1',
        reach_state: 'on_paper',
        consent_status: 'opted_out',
        paper_state: 'lapsed',
        contact_rule_summary: 'Never text. Do not use: mobile, after_hours.',
      },
      // QA-R6-1: the view reports the FACT for a lender firm that has filed
      // nothing — `not_on_file` — because the lender never owed the studio
      // paper in the first place. Whether it PRINTS is the display rule.
      {
        person_id: 'bank-1',
        reach_state: 'on_paper',
        consent_status: 'not_asked',
        paper_state: 'not_on_file',
        contact_rule_summary: null,
      },
    ],
  }),
  // CR-5: the RULE ROW is what the mini row's clause is composed from —
  // `contact_rule_summary` is the mechanical list in schema words and must not
  // reach a face.
  useContactRules: () => ({
    data: [
      {
        id: 'rule-1',
        subject_type: 'person',
        subject_id: 'contact-1',
        channels_allowed: ['email'],
        channels_forbidden: ['sms', 'mobile'],
        route_to_person_id: null,
        contact_hours: null,
        escalation_by_class: {},
        reason: 'Email only. No cell for work.',
        set_by: null,
        set_at: '2026-01-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
  }),
}));

const ROSA: StudioContact = {
  id: 'contact-1',
  organization_id: 'org-1',
  entity_kind: 'person',
  company_id: null,
  contact_kind: 'sub',
  full_name: 'Rosa Martínez',
  company_name: 'Martínez Tile Works',
  email: 'rosa@martineztile.co',
  phone: '(513) 555-0148',
  phone_e164: '+15135550148',
  specialties: ['tile'],
  vendor_id: null,
  profile_id: null,
  created_by: null,
  notes: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/** A lender firm — R-A/R-N's own population. It owes the studio no paper. */
const BANK: StudioContact = {
  ...ROSA,
  id: 'bank-1',
  entity_kind: 'company',
  contact_kind: 'lender',
  full_name: null,
  company_name: 'Great Northern Bank',
  email: null,
  phone: null,
  phone_e164: null,
  specialties: [],
};

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'proj-1',
};

beforeEach(() => {
  recordedStudio.current = 'org-1';
  addPartyMutate.mockReset().mockResolvedValue({});
  addContactMutate.mockReset().mockResolvedValue({ id: 'new-contact' });
  props.onClose.mockReset();
  useStudioContacts.mockReset();
  useStudioContacts.mockReturnValue({ data: [ROSA], isLoading: false });
  refetchRoster.mockReset();
  useProjectRoster.mockReset();
  useProjectRoster.mockReturnValue({ data: [], refetch: refetchRoster });
});

describe('RolodexPicker — pre-scoped kinds', () => {
  it('renders only the kinds it was scoped to, plus All', () => {
    render(<RolodexPicker {...props} scopeKinds={['sub']} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subcontractor' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'General Contractor' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photographer' })).not.toBeInTheDocument();
  });

  it('falls back to the full vocabulary when nothing is scoped', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.getByRole('button', { name: 'General Contractor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Photographer' })).toBeInTheDocument();
    // A project's client is set when the project is opened, never picked here.
    expect(screen.queryByRole('button', { name: 'Client' })).not.toBeInTheDocument();
  });
});

describe('RolodexPicker — the hits and their history', () => {
  it('renders one history line — repeat count and dates, never a verdict (PR-i)', () => {
    render(<RolodexPicker {...props} />);
    expect(
      screen.getByText('Worked 3 prior projects, Ellsworth, 2025.'),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/worked out|recommend|avoid/i);
  });

  it('carries the words that travel, and the rule as a sentence (SPEC §5.7 #4)', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.getByText('On paper')).toBeInTheDocument();
    expect(screen.getByText('Opted out')).toBeInTheDocument();
    expect(screen.getByText('Lapsed')).toBeInTheDocument();
    expect(screen.getByText('Email only. No cell for work.')).toBeInTheDocument();
  });

  /**
   * QA-R6-1 (BLOCKING) — SPEC §3.8 / §5.1 #18 and R-A / R-N: a lender, an
   * inspector or an authority carries NO paper word at all, on any surface,
   * and "Not on file" is the forbidden word above all — it names an
   * obligation that was never the studio's to collect. The mini row was
   * handed the view's raw `paper_state` and printed it unconditionally, so
   * Great Northern Bank and City of Minneapolis, CPED Inspections both wore
   * "Not on file" in this picker.
   */
  it('prints no paper word for a lender firm, on any surface (QA-R6-1)', () => {
    useStudioContacts.mockReturnValue({ data: [BANK], isLoading: false });
    render(<RolodexPicker {...props} />);
    expect(screen.getByText('Great Northern Bank')).toBeInTheDocument();
    expect(screen.queryByText('Not on file')).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-state-family="paper"]'),
    ).not.toBeInTheDocument();
  });

  it('a single click adds the contact as a party carrying its rolodex id', async () => {
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Rosa Martínez/ }));
    await waitFor(() => expect(addPartyMutate).toHaveBeenCalled());
    expect(addPartyMutate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      partyKind: 'sub',
      displayName: 'Rosa Martínez',
      companyName: 'Martínez Tile Works',
      trade: 'tile',
      phone: '(513) 555-0148',
      email: 'rosa@martineztile.co',
      studioContactId: 'contact-1',
    });
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(refetchRoster).toHaveBeenCalledTimes(1);
  });

  it('does not add a rolodex contact already represented on the roster', async () => {
    useProjectRoster.mockReturnValue({
      data: [
        {
          roster_id: 'party-1',
          source: 'party',
          project_id: 'proj-1',
          kind: 'sub',
          display_name: 'Rosa Martínez',
          company_name: 'Martínez Tile Works',
          email: 'rosa@martineztile.co',
          phone: '(513) 555-0148',
          trade: 'tile',
          job_title: null,
          staff_role: null,
          studio_contact_id: 'contact-1',
          profile_id: null,
          show_to_client: false,
          has_active_field_link: false,
          sms_consent_status: 'not_asked',
          updated_at: null,
        } satisfies ProjectRosterRow,
      ],
      refetch: refetchRoster,
    });
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Rosa Martínez/ }));

    expect(
      await screen.findByText('Rosa Martínez is already on the call sheet.'),
    ).toBeInTheDocument();
    expect(addPartyMutate).not.toHaveBeenCalled();
    expect(refetchRoster).not.toHaveBeenCalled();
  });
});

/**
 * CR9-2 — THE WAY OUT IS ALWAYS VISIBLE; THE SENTENCE IS THE EMPTY SEARCH'S.
 *
 * "Add someone new" sits under the hits on every frame. The sentence beside it
 * — "No one by that name in the rolodex." — was ungated, so it printed directly
 * beneath the people the search had just found.
 */
describe('RolodexPicker — the fallback is always visible', () => {
  it('shows the way out even when the rolodex has hits, and no empty sentence', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.getByRole('button', { name: /Rosa Martínez/ })).toBeInTheDocument();
    expect(
      screen.queryByText('– No one by that name in the rolodex.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add someone new' })).toBeInTheDocument();
  });

  it('shows it on an empty rolodex too', () => {
    useStudioContacts.mockReturnValue({ data: [], isLoading: false });
    render(<RolodexPicker {...props} />);
    expect(screen.getByText('– No one by that name in the rolodex.')).toBeInTheDocument();
  });

  it('unfolds the inline add form in the SAME sheet', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add someone new' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toBeInTheDocument();
    // Still one sheet — the hits are still on it.
    expect(screen.getByRole('button', { name: /Rosa Martínez/ })).toBeInTheDocument();
  });
});

describe('RolodexPicker — the stamp', () => {
  it('is ON by default', () => {
    render(<RolodexPicker {...props} startInAdd />);
    const stamp = screen.getByRole('checkbox', { name: /Save to the studio rolodex/ });
    expect(stamp).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('so the next project starts with them')).toBeInTheDocument();
  });

  it('ON: writes the rolodex card first, then the party carrying its id', async () => {
    render(<RolodexPicker {...props} scopeKinds={['sub']} startInAdd />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Hector Salas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the call sheet' }));

    await waitFor(() => expect(addPartyMutate).toHaveBeenCalled());
    expect(addContactMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        entityKind: 'person',
        contactKind: 'sub',
        fullName: 'Hector Salas',
      }),
    );
    expect(addPartyMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Hector Salas',
        partyKind: 'sub',
        studioContactId: 'new-contact',
      }),
    );
  });

  it('OFF: adds the party only — nothing touches the studio rolodex', async () => {
    render(<RolodexPicker {...props} scopeKinds={['sub']} startInAdd />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Hector Salas' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Save to the studio rolodex/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to the call sheet' }));

    await waitFor(() => expect(addPartyMutate).toHaveBeenCalled());
    expect(addContactMutate).not.toHaveBeenCalled();
    expect(addPartyMutate).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Hector Salas', studioContactId: null }),
    );
  });

  /**
   * CR5-1 (w2 r5) — the stamp minted into the studio holding the BOOK while
   * `assert_project_party_cards()` checks the seat's card against the studio
   * the JOB records. On a studio-less project (five of eight locally) the card
   * INSERT succeeded and the seat's stamp raised
   * `party_card_project_has_no_studio`, leaving a card nothing points at — and
   * a retry minted another.
   */
  it('offers no stamp where the job records no studio, and mints no card', async () => {
    recordedStudio.current = null;
    render(<RolodexPicker {...props} scopeKinds={['sub']} startInAdd />);
    expect(
      screen.queryByRole('checkbox', { name: /Save to the studio rolodex/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /This job isn’t attached to a studio yet, so nobody can be saved to the book from here\./,
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Hector Salas' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to the call sheet' }));
    await waitFor(() => expect(addPartyMutate).toHaveBeenCalled());
    expect(addContactMutate).not.toHaveBeenCalled();
    expect(addPartyMutate).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Hector Salas', studioContactId: null }),
    );
  });

  it('refuses a nameless add, in words, without calling anything', () => {
    render(<RolodexPicker {...props} startInAdd />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to the call sheet' }));
    expect(screen.getByText('A name, at least.')).toBeInTheDocument();
    expect(addPartyMutate).not.toHaveBeenCalled();
    expect(addContactMutate).not.toHaveBeenCalled();
  });
});
