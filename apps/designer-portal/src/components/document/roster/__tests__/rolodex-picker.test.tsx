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
/** W3/P2 — the batch act behind "Add N to the roster". */
const bringForwardMutate = jest.fn();
let consentRecords: unknown[] = [];
let firmDocuments: unknown[] = [];
let expiryNotices: unknown[] = [];

/**
 * The directory rows the picker reads its words — and, since F1, the FIRM'S
 * OWN NAME — off. Mutable so a test can hand the row a `meta.company_name` the
 * affiliation model resolves while the card's legacy `company_name` is null,
 * which is the shape of every carded human on the local book.
 */
const DEFAULT_DIRECTORY: unknown[] = [
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
];
let directoryRows: unknown[] = [...DEFAULT_DIRECTORY];

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
  useStudioContactHistory: (...args: unknown[]) =>
    useStudioContactHistory(...args),
  // ── W3/P2: what travels, read once for the page ───────────────────────
  useBringForward: () => ({ mutateAsync: bringForwardMutate, isPending: false }),
  useChannelConsentRecords: () => ({ data: consentRecords }),
  useComplianceDocumentsFor: () => ({ data: firmDocuments }),
  useComplianceNotices: () => ({ data: expiryNotices }),
  indexComplianceNotices: (rows: Array<{ document_id: string }> | undefined) =>
    new Map((rows ?? []).map((row) => [row.document_id, row])),
  COMPLIANCE_DOC_TYPE_LABELS: {
    coi_gl: 'COI, general liability',
  },
  // The three words at the pick come from the directory, keyed on the rolodex
  // card (v4). One read for the page of hits.
  usePeopleDirectory: () => ({ data: directoryRows }),
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
  merged_into: null,
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

/**
 * QA-3 / MAJOR-6 — the hook now carries EVERY prior job, newest first, and the
 * search reads all of them. MAJOR-5 — the OPEN job is excluded from the
 * rollup, so the sheet can never name the job it is adding to.
 */
const DEFAULT_HISTORY: Record<string, unknown> = {
  'contact-1': {
    projectCount: 3,
    lastProjectName: 'Ellsworth',
    projectNames: ['Ellsworth', 'Lindqvist kitchen'],
    lastAt: '2025-11-21T17:00:00Z',
    lastClosedYear: '2025',
  },
};
let contactHistory: Record<string, unknown> = { ...DEFAULT_HISTORY };
const useStudioContactHistory = jest.fn(() => ({ data: contactHistory }));

const props = {
  open: true,
  onClose: jest.fn(),
  projectId: 'proj-1',
};

beforeEach(() => {
  contactHistory = { ...DEFAULT_HISTORY };
  useStudioContactHistory.mockClear();
  recordedStudio.current = 'org-1';
  addPartyMutate.mockReset().mockResolvedValue({});
  addContactMutate.mockReset().mockResolvedValue({ id: 'new-contact' });
  props.onClose.mockReset();
  useStudioContacts.mockReset();
  useStudioContacts.mockReturnValue({ data: [ROSA], isLoading: false });
  refetchRoster.mockReset();
  bringForwardMutate.mockReset().mockResolvedValue({ added: [], refused: [] });
  consentRecords = [];
  firmDocuments = [];
  expiryNotices = [];
  directoryRows = [...DEFAULT_DIRECTORY];
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
      screen.getByText('Worked 3 prior projects, Ellsworth, closed 2025.'),
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Rosa Martínez on their own' }),
    );
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
    fireEvent.click(
      screen.getByRole('button', { name: 'Add Rosa Martínez on their own' }),
    );

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

/**
 * BRING FORWARD (SPEC §5.7, CRM-24, Leah task 5).
 *
 * The travel list, the multi-select, one confirm, and the consequence sentence
 * that says who arrives carrying a refusal.
 */
describe('RolodexPicker — bring forward', () => {
  const PETE: StudioContact = {
    ...ROSA,
    id: 'contact-2',
    full_name: 'Pete Rusk',
    company_name: 'Rusk Mechanical',
    company_id: 'firm-rusk',
    email: 'pete@ruskmechanical.co',
    phone: '(612) 555-0112',
    phone_e164: '+16125550112',
    specialties: ['plumbing'],
  };

  it('names what travels and what stays behind (SPEC §5.7 #5)', () => {
    render(<RolodexPicker {...props} />);
    expect(screen.getByText('What travels')).toBeInTheDocument();
    expect(screen.getByText('consent by channel value')).toBeInTheDocument();
    expect(screen.getByText('What stays behind')).toBeInTheDocument();
    expect(screen.getByText('prior pricing')).toBeInTheDocument();
  });

  it('counts the pick, and names the prior job every hit shares', () => {
    render(<RolodexPicker {...props} />);
    expect(
      document.querySelector('[data-pick-count]')?.textContent,
    ).toBe('0 of 1 from the Ellsworth selected');
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    expect(
      document.querySelector('[data-pick-count]')?.textContent,
    ).toBe('1 of 1 from the Ellsworth selected');
  });

  it('ticks and un-ticks, and the act counts in words', () => {
    useStudioContacts.mockReturnValue({ data: [ROSA, PETE], isLoading: false });
    render(<RolodexPicker {...props} />);
    expect(
      screen.getByRole('button', { name: 'Add to the roster' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Pete Rusk/ }));
    expect(
      screen.getByRole('button', { name: 'Add two to the roster' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Pete Rusk/ }));
    expect(
      screen.getByRole('button', { name: 'Add one to the roster' }),
    ).toBeInTheDocument();
  });

  it('Put back clears the pick without writing anything', () => {
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));
    expect(
      screen.getByRole('button', { name: 'Add to the roster' }),
    ).toBeInTheDocument();
    expect(bringForwardMutate).not.toHaveBeenCalled();
  });

  it('says who arrives opted out, in the consequence sentence (SPEC §5.7 #7)', () => {
    render(<RolodexPicker {...props} projectName="Okonkwo residence" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    expect(
      document.querySelector('[data-bring-forward-consequence]')?.textContent,
    ).toBe(
      'Adds one seat to the Okonkwo residence. Rosa Martínez arrives opted out of texting.',
    );
  });

  it('carries the refusal onto the row itself (direction §5.2 Birth rule)', () => {
    consentRecords = [
      {
        channel_value: '+15135550148',
        opt_out_source: 'inbound_stop',
        opt_out_at: '2025-12-03',
      },
    ];
    render(<RolodexPicker {...props} />);
    expect(
      document.querySelector('[data-carried-consent]')?.textContent,
    ).toBe('Opted out by text, 3 Dec 2025.');
  });

  it('prints the sweep’s expiry sentence on the mini row (00630)', () => {
    useStudioContacts.mockReturnValue({
      data: [{ ...ROSA, company_id: 'firm-tile' }],
      isLoading: false,
    });
    firmDocuments = [
      {
        id: 'doc-1',
        holder_id: 'firm-tile',
        doc_type: 'coi_gl',
        doc_label: null,
        expires_on: '2026-10-06',
        blocks: ['site_access'],
        superseded_by: null,
      },
    ];
    expiryNotices = [
      { id: 'n-1', document_id: 'doc-1', state: 'lapses_soon', noticed_at: '2026-09-13' },
    ];
    render(<RolodexPicker {...props} />);
    expect(
      document.querySelector('[data-expiry-notice]')?.textContent,
    ).toBe('Martínez Tile Works’s insurance lapses on 6 October 2026.');
  });

  /**
   * F1 — the firm the SPEC names, not the person the legacy column falls back
   * to. `studio_contacts.company_name` is null on every card the affiliation
   * model (00592) linked, so `company_name ?? contactName(c)` printed the
   * person: the mini row lost its firm segment entirely and the consequence
   * sentence read "Dana Kowalski's insurance lapsed…" where SPEC §5.7 #7 fixes
   * "Northgate Electric's insurance lapsed…". `people_directory`'s own
   * `meta.company_name` join is the Directory's answer and now the picker's.
   */
  it('names the FIRM from the directory join, not the person (SPEC §5.7 #4, #7)', () => {
    useStudioContacts.mockReturnValue({
      data: [{ ...ROSA, company_name: null, company_id: 'firm-tile' }],
      isLoading: false,
    });
    directoryRows = [
      {
        person_id: 'contact-1',
        reach_state: 'on_paper',
        consent_status: 'not_asked',
        paper_state: 'lapsed',
        contact_rule_summary: null,
        meta: { company_id: 'firm-tile', company_name: 'Martínez Tile Works' },
      },
    ];
    firmDocuments = [
      {
        id: 'doc-1',
        holder_id: 'firm-tile',
        doc_type: 'coi_gl',
        doc_label: null,
        expires_on: '2026-03-31',
        blocks: ['site_access'],
        superseded_by: null,
      },
    ];
    expiryNotices = [
      { id: 'n-1', document_id: 'doc-1', state: 'lapsed', noticed_at: '2026-09-13' },
    ];
    render(<RolodexPicker {...props} projectName="Okonkwo residence" />);

    // the mini row's meta line carries the firm between the kind and the trade
    expect(
      document.querySelector('[data-party-mini-meta]')?.textContent,
    ).toBe('Subcontractor · Martínez Tile Works · Tile');

    // the row's own expiry clause names the firm, not Rosa
    expect(
      document.querySelector('[data-expiry-notice]')?.textContent,
    ).toBe('Martínez Tile Works’s insurance lapsed 31 March 2026.');

    // and so does the consequence sentence, which is the SPEC's fixed wording
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    const consequence = document.querySelector(
      '[data-bring-forward-consequence]',
    )?.textContent;
    expect(consequence).toContain(
      'Martínez Tile Works’s insurance lapsed 31 March 2026.',
    );
    expect(consequence).not.toContain('Rosa Martínez’s insurance');
  });

  it('seats every ticked row in ONE confirm, carrying the card', async () => {
    useStudioContacts.mockReturnValue({ data: [ROSA, PETE], isLoading: false });
    bringForwardMutate.mockResolvedValue({
      added: [
        { studioContactId: 'contact-1', seatId: 's1', name: 'Rosa Martínez' },
        { studioContactId: 'contact-2', seatId: 's2', name: 'Pete Rusk' },
      ],
      refused: [],
    });
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Pete Rusk/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add two to the roster' }));
    await waitFor(() => expect(bringForwardMutate).toHaveBeenCalled());
    const call = bringForwardMutate.mock.calls[0][0];
    expect(call.projectId).toBe('proj-1');
    expect(call.picks).toEqual([
      {
        studioContactId: 'contact-1',
        partyKind: 'sub',
        displayName: 'Rosa Martínez',
        trade: 'tile',
        companyId: null,
        companyName: 'Martínez Tile Works',
        phone: '(513) 555-0148',
        email: 'rosa@martineztile.co',
      },
      {
        studioContactId: 'contact-2',
        partyKind: 'sub',
        displayName: 'Pete Rusk',
        trade: 'plumbing',
        companyId: 'firm-rusk',
        companyName: 'Rusk Mechanical',
        phone: '(612) 555-0112',
        email: 'pete@ruskmechanical.co',
      },
    ]);
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('refuses the whole pick when somebody is already on the sheet', async () => {
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
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one to the roster' }));
    expect(
      await screen.findByText('Rosa Martínez is already on the call sheet.'),
    ).toBeInTheDocument();
    expect(bringForwardMutate).not.toHaveBeenCalled();
  });

  it('keeps the refused rows ticked and says which did not go on', async () => {
    bringForwardMutate.mockResolvedValue({
      added: [],
      refused: [
        {
          studioContactId: 'contact-1',
          name: 'Rosa Martínez',
          reason: 'party_card_merged_away',
        },
      ],
    });
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one to the roster' }));
    // M2R-3: the refusal goes through `writeErrorMessage`, so 00629's bare
    // token is a sentence and never the token itself (SPEC §8 #3).
    const banner = await screen.findByText(/Rosa Martínez did not go on/);
    expect(banner.textContent).toBe(
      'Rosa Martínez did not go on the call sheet. That card has been folded into another one. Open the card that survived and add them from there.',
    );
    expect(banner.textContent).not.toContain('party_card_merged_away');
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

/**
 * SPEC §5.7 #3 — the search field's own value is "Lindqvist", a prior JOB. A
 * job name lives on nobody's card, so the search reads the history line the
 * row already prints.
 */
describe('RolodexPicker — searching a prior job', () => {
  const ELSEWHERE: StudioContact = {
    ...ROSA,
    id: 'contact-3',
    full_name: 'Nobody Relevant',
    company_name: 'Another Firm',
    email: 'nobody@another.example',
  };

  it('finds the crew of the job the studio typed', () => {
    useStudioContacts.mockReturnValue({
      data: [ROSA, ELSEWHERE],
      isLoading: false,
    });
    render(<RolodexPicker {...props} />);
    fireEvent.change(screen.getByLabelText('Search the rolodex'), {
      target: { value: 'Ellsworth' },
    });
    expect(screen.getByText('Rosa Martínez')).toBeInTheDocument();
    expect(screen.queryByText('Nobody Relevant')).not.toBeInTheDocument();
  });

  it('still finds a person by their own name and their firm', () => {
    useStudioContacts.mockReturnValue({
      data: [ROSA, ELSEWHERE],
      isLoading: false,
    });
    render(<RolodexPicker {...props} />);
    const field = screen.getByLabelText('Search the rolodex');
    fireEvent.change(field, { target: { value: 'Martínez Tile' } });
    expect(screen.getByText('Rosa Martínez')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'Nobody' } });
    expect(screen.getByText('Nobody Relevant')).toBeInTheDocument();
    expect(screen.queryByText('Rosa Martínez')).not.toBeInTheDocument();
  });

  it('asks the rolodex for the kind only — the name search is the room’s', () => {
    render(<RolodexPicker {...props} />);
    fireEvent.change(screen.getByLabelText('Search the rolodex'), {
      target: { value: 'Lindqvist' },
    });
    for (const call of useStudioContacts.mock.calls) {
      expect(call[1]).not.toHaveProperty('search');
    }
  });

  /**
   * QA-3 / MAJOR-6 — a repeat sub is the population bring forward exists for,
   * and matching only the card's MOST RECENT job was exactly the population it
   * could not find. Rosa worked the Lindqvist kitchen and has been seated
   * since (`lastProjectName` is Ellsworth).
   */
  it('finds a card by ANY prior job, not only its latest one', () => {
    useStudioContacts.mockReturnValue({
      data: [ROSA, ELSEWHERE],
      isLoading: false,
    });
    render(<RolodexPicker {...props} />);
    fireEvent.change(screen.getByLabelText('Search the rolodex'), {
      target: { value: 'Lindqvist' },
    });
    expect(screen.getByText('Rosa Martínez')).toBeInTheDocument();
    expect(screen.queryByText('Nobody Relevant')).not.toBeInTheDocument();
  });

  /** MAJOR-5 — a PRIOR job is one that is not the job being added to. */
  it('leaves the OPEN job out of the history rollup', () => {
    render(<RolodexPicker {...props} />);
    for (const call of useStudioContactHistory.mock.calls) {
      expect(call[1]).toMatchObject({ excludeProjectId: 'proj-1' });
    }
  });

  /**
   * MAJOR-5 — a row with NO prior job is its own answer. Filtering those out
   * before the uniqueness test let one carded person name the whole page:
   * "4 of 5 from the Lindqvist kitchen selected" over four rows never on it.
   */
  it('names no shared job when some rows have never been on one', () => {
    useStudioContacts.mockReturnValue({
      data: [ROSA, ELSEWHERE],
      isLoading: false,
    });
    render(<RolodexPicker {...props} />);
    expect(document.querySelector('[data-pick-count]')?.textContent).toBe(
      '0 of 2 selected',
    );
  });

  /**
   * MAJOR-2 — the count, the act label, the consequence sentence and the
   * insert must name the same people. Ticking a row and then narrowing the
   * search left "1 of 1 … selected" over "Add one to the roster" for somebody
   * the studio could no longer see, and an insert that wrote nothing.
   */
  it('un-ticks a card the search has taken off the page', () => {
    useStudioContacts.mockReturnValue({
      data: [ROSA, ELSEWHERE],
      isLoading: false,
    });
    render(<RolodexPicker {...props} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Rosa Martínez/ }));
    expect(
      screen.getByRole('button', { name: 'Add one to the roster' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search the rolodex'), {
      target: { value: 'Nobody' },
    });
    expect(
      screen.getByRole('button', { name: 'Add to the roster' }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-pick-count]')?.textContent).toBe(
      '0 of 1 selected',
    );
  });
});
