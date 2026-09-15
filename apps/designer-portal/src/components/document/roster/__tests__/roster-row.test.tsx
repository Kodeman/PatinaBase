/**
 * One Call Sheet row, against the Okonkwo fixture (SPEC §5.4).
 *
 * What this spec holds: the words a folded row prints, the clauses it prints in
 * WORDS rather than as badges, the `tel:` sibling, the unfold's `aria-controls`
 * pair, and the act that replaced Remove — Close this seat, two steps, with a
 * reason, and a hard delete that is HELD the moment the seat carries anything.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RosterRow } from '../roster-row';
import type { CallSheetRow } from '@/lib/document/roster-derivation';

const updateMutate = jest.fn();
const closeMutate = jest.fn();
const removeMutate = jest.fn();
const createLinkMutate = jest.fn();
const sendSmsMutate = jest.fn();
let consentResolution: unknown = { verdict: null, record: null };
let complianceDocs: unknown[] = [];
let complianceNotices: unknown[] = [];
const setBidMutate = jest.fn();
let projectsData: unknown[] = [];

/** QA-R13-1: the row resolves the job a consent record NAMES, so the sheet's
 *  own project name is never substituted into R-Q's sentence. */
jest.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ data: projectsData }),
}));

jest.mock('@patina/supabase', () => ({
  useUpdateProjectParty: () => ({ mutateAsync: updateMutate, isPending: false }),
  useCloseProjectPartySeat: () => ({ mutateAsync: closeMutate, isPending: false }),
  useRemoveProjectParty: () => ({ mutateAsync: removeMutate, isPending: false }),
  useCreateFieldLink: () => ({ mutateAsync: createLinkMutate, isPending: false }),
  useSendPartySms: () => ({ mutateAsync: sendSmsMutate, isPending: false }),
  useChannelConsent: () => ({ data: consentResolution }),
  useComplianceDocuments: () => ({ data: complianceDocs }),
  // r11 MAJOR-1 — the row reads BOTH holders (the person's own card and their
  // firm), because that is what the paper WORD reduces over.
  useComplianceDocumentsFor: (ids: string[]) => ({
    data: ids.length > 0 ? complianceDocs : [],
  }),
  // W3/P2 — the Bidding band's facts and the nightly expiry notice.
  useSetPartyBid: () => ({ mutateAsync: setBidMutate, isPending: false }),
  useComplianceNotices: () => ({ data: complianceNotices }),
  indexComplianceNotices: (rows: Array<{ document_id: string }> | undefined) =>
    new Map((rows ?? []).map((row) => [row.document_id, row])),
  ALL_SEAT_BID_OUTCOMES: [
    'asked',
    'quoted',
    'selected',
    'declined',
    'no_response',
    'withdrawn',
  ],
  SEAT_BID_OUTCOME_ACTS: {
    asked: 'Asked for a price',
    quoted: 'They quoted',
    selected: 'Selected',
    declined: 'They declined',
    no_response: 'No response',
    withdrawn: 'They withdrew',
  },
  // MAJOR-3: the consequence sentence names a destination, so it reads the
  // STATE map, not the act map.
  SEAT_BID_OUTCOME_LABELS: {
    asked: 'Bidding',
    quoted: 'Bidding',
    selected: 'Awarded',
    declined: 'Declined',
    no_response: 'No response',
    withdrawn: 'Off the job',
  },
  // MAJOR-1 / MAJOR-7: the bid follows its COLUMNS, not the band.
  // r8 BLOCKING-1: the face reads the same answer the write does.
  bidStageOutcome: (
    previous: { bidOutcome: string | null; stage: string | null },
    next: string | null | undefined,
  ) => {
    const stages: Record<string, string> = {
      asked: 'invited',
      quoted: 'bidding',
      selected: 'awarded',
      declined: 'declined',
      no_response: 'no_response',
      withdrawn: 'off_job',
    };
    const outcome = next ?? null;
    const moved = outcome !== (previous.bidOutcome ?? null);
    const pastTheBid = [
      'mobilized',
      'active',
      'closeout',
      'warranty',
      'retired',
    ].includes(previous.stage ?? '');
    const writes = !!outcome && moved && (!pastTheBid || outcome === 'withdrawn');
    return {
      outcome,
      moved,
      pastTheBid,
      stage: writes ? stages[outcome as string] : null,
    };
  },
  seatCarriesBid: (bid: Record<string, unknown> | null | undefined) =>
    !!bid &&
    [
      'bidDueAt',
      'bidOutcome',
      'bidValidUntil',
      'bidQuotedByPersonId',
      'bidAmountCents',
      'bidAskedAt',
      'bidQuotedAt',
      'bidSelectedAt',
    ].some((key) => bid[key] != null),
  fieldLinkUrl: (token: string) => `https://client.patina.cloud/field/${token}`,
  AUTHORITY_SCOPE_LABELS: {
    money: 'Signs money',
    change_order: 'Approves change orders',
    selections: 'Selections',
    site_access: 'Controls site access',
    key: 'Holds a key',
  },
  // CR8-1: the REAL table — this is the company card's Type column head, and
  // the row's clause must NOT speak it.
  COMPLIANCE_DOC_TYPE_LABELS: {
    coi_gl: 'COI, general liability',
    coi_wc: 'COI, workers compensation',
  },
  SEAT_DELETE_REFUSAL_SENTENCES: {
    consent:
      'This number has a texting record behind it. Close the seat instead — the record stays either way, and the seat is how you can still see it.',
    bid: 'This seat carries a bid. Close it instead, so the bid history stays on the job.',
    waiver:
      'This seat carries paperwork the studio holds. Close it instead, so the paper keeps its place.',
    unknown: 'Close this seat instead of removing it.',
  },
  seatDeleteRefusal: (facts: {
    hasConsentRecord: boolean;
    hasBid: boolean;
    hasComplianceDocument: boolean;
  }) =>
    facts.hasConsentRecord
      ? 'consent'
      : facts.hasBid
        ? 'bid'
        : facts.hasComplianceDocument
          ? 'waiver'
          : null,
}));

function seatRow(over: Partial<CallSheetRow> = {}): CallSheetRow {
  return {
    key: 'seat:seat-dana',
    seatId: 'seat-dana',
    personId: 'card-dana',
    profileId: null,
    source: 'seat',
    name: 'Dana Kowalski',
    partyKind: 'sub',
    trade: 'electrical',
    companyName: 'Northgate Electric',
    companyId: 'northgate',
    meta: 'Sub · electrical',
    phone: '(612) 555-0111',
    email: 'dana@northgateelectric.com',
    phoneE164: '+16125550111',
    reach: 'field_link',
    stage: 'active',
    consent: 'granted',
    paper: 'lapsed',
    ruleSummary: null,
    onSiteFrom: '2026-10-12',
    onSiteTo: '2027-08-13',
    warrantyUntil: null,
    offJobAt: null,
    offJobReason: null,
    showToClient: false,
    projectId: 'okonkwo',
    ...over,
  };
}

const ul = (node: React.ReactElement) => render(<ul>{node}</ul>);

beforeEach(() => {
  updateMutate.mockReset().mockResolvedValue({});
  closeMutate.mockReset().mockResolvedValue({});
  removeMutate.mockReset().mockResolvedValue({});
  createLinkMutate.mockReset().mockResolvedValue({ id: 'l-1', token: 'tok' });
  sendSmsMutate.mockReset().mockResolvedValue({});
  consentResolution = { verdict: null, record: null };
  complianceDocs = [];
});

describe('RosterRow — folded', () => {
  it('prints the name, the kind and trade, the firm and the window', () => {
    ul(<RosterRow row={seatRow()} band="this_week" expanded={false} onToggle={jest.fn()} />);
    expect(screen.getByText('Dana Kowalski')).toBeInTheDocument();
    expect(screen.getByText('Sub · electrical')).toBeInTheDocument();
    expect(screen.getByText(/Northgate Electric/)).toBeInTheDocument();
    expect(screen.getByText('12 Oct 2026 to 13 Aug 2027')).toBeInTheDocument();
  });

  it('prints two words on the folded row — reach and stage', () => {
    const { container } = ul(
      <RosterRow row={seatRow()} band="this_week" expanded={false} onToggle={jest.fn()} />,
    );
    const words = Array.from(container.querySelectorAll('[data-state-word]')).map((el) =>
      el.getAttribute('data-state-family'),
    );
    expect(words).toEqual(['reach', 'stage']);
    expect(screen.getByText('Field link')).toBeInTheDocument();
    expect(screen.getByText('On the job')).toBeInTheDocument();
  });

  /**
   * CR3-2 — the row fell back to `row.ruleSummary` (`contact_rule_summary()`)
   * whenever the rule row had not arrived, and that column prints raw
   * `channel_kind` tokens, which SPEC §8 #3 bars from any face. The rules are
   * a separate query from the roster, so this painted on every cold load.
   */
  it('prints no rule clause — and no schema word — while the rule row is unread', () => {
    const { container } = ul(
      <RosterRow
        row={seatRow({
          ruleSummary:
            'Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office. Write Rosa Delgado instead.',
        })}
        band="this_week"
        expanded={false}
        onToggle={jest.fn()}
      />,
    );
    expect(container.querySelector('[data-contact-rule]')).toBeNull();
    for (const token of ['after_hours', 'ap_email', 'dispatch', 'portal_311']) {
      expect(container.textContent).not.toContain(token);
    }
  });

  it('makes the phone a sibling target, never a link inside the button', () => {
    const { container } = ul(
      <RosterRow row={seatRow()} band="this_week" expanded={false} onToggle={jest.fn()} />,
    );
    const tel = container.querySelector('a[data-tel-link]');
    expect(tel).toHaveAttribute('href', 'tel:+16125550111');
    expect(tel?.closest('button')).toBeNull();
  });

  /**
   * CR8-1 — SPEC §5.4 #7 fixes this string as "…Northgate Electric's insurance
   * lapsed 31 March 2026." The row used to speak the company card's Type
   * column head ("COI, general liability") because it read
   * `COMPLIANCE_DOC_TYPE_LABELS` straight into a sentence.
   */
  it('prints the held clause in words with a terracotta leading rule (PR-h)', () => {
    complianceDocs = [
      {
        id: 'doc-1',
        doc_type: 'coi_gl',
        doc_label: null,
        expires_on: '2026-03-31',
        blocks: ['site_access', 'payment', 'draw'],
      },
    ];
    const { container } = ul(
      <RosterRow row={seatRow()} band="this_week" expanded={false} onToggle={jest.fn()} />,
    );
    const clause = container.querySelector('[data-held-clause]');
    expect(clause).toHaveTextContent(
      'Site access held. Northgate Electric’s insurance lapsed 31 March 2026.',
    );
    expect(clause?.textContent).not.toContain('COI');
    expect(clause?.className).toContain('border-[var(--color-terracotta-ink)]');
  });

  /**
   * CR8-5 — direction §3.8: an inspector's or a lender's paper word prints on
   * NO surface. Every other surface gated it; this row was the one that did
   * not, and the seat's own `party_kind` cannot answer, because
   * `project_parties_party_kind_check` is not widened yet (a declared W3 gap)
   * and Ray Thao is stored `other`. The CARD's kind answers.
   */
  describe('CR8-5 — the paper word is owed before it is printed', () => {
    it('prints no paper word for an inspector, off the card kind', () => {
      render(
        <RosterRow
          row={seatRow({
            key: 'seat:ray',
            seatId: 'seat-ray',
            personId: 'card-ray',
            name: 'Ray Thao',
            partyKind: 'other',
            companyName: 'City of Minneapolis, CPED Inspections',
            paper: 'not_on_file',
          })}
          band="this_week"
          expanded
          onToggle={jest.fn()}
          contactKind="inspector"
        />,
        { wrapper: ({ children }) => <ul>{children}</ul> },
      );
      expect(screen.queryByText('Not on file')).toBeNull();
    });

    it('still prints it for a sub, and falls back to the seat kind', () => {
      render(
        <RosterRow
          row={seatRow({ paper: 'not_on_file' })}
          band="this_week"
          expanded
          onToggle={jest.fn()}
        />,
        { wrapper: ({ children }) => <ul>{children}</ul> },
      );
      expect(screen.getByText('Not on file')).toBeInTheDocument();
    });
  });

  it('prints an opted-out note on the COLLAPSED row (R-T)', () => {
    consentResolution = {
      verdict: 'opted_out',
      record: {
        status: 'opted_out',
        opt_out_source: 'inbound_sms',
        opt_out_at: '2025-12-03',
        source: null,
        consented_at: null,
      },
    };
    const { container } = ul(
      <RosterRow
        row={seatRow({ name: 'Pete Rusk', consent: 'opted_out', paper: null })}
        band="later"
        expanded={false}
        onToggle={jest.fn()}
        projectName="Lindqvist kitchen"
      />,
    );
    expect(container.querySelector('[data-opted-out-note]')).toHaveTextContent(
      'Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.',
    );
  });

  it('prints the authority phrase as plain text, never a state word', () => {
    const { container } = ul(
      <RosterRow
        row={seatRow({ name: 'Chidi Okonkwo', partyKind: 'client_rep', paper: null })}
        band="clientSide"
        expanded={false}
        onToggle={jest.fn()}
        authority={[
          {
            id: 'a1',
            engagement_id: 'seat-dana',
            scope: 'money',
            threshold_cents: 250000,
            prepares_only: false,
            copy_to: [],
            source_clause: null,
            granted_by: null,
            effective_from: '2026-08-01',
            effective_to: null,
            created_at: '',
            updated_at: '',
          },
        ]}
      />,
    );
    const phrase = screen.getByText('Signs money to $2,500.');
    expect(phrase).toBeInTheDocument();
    expect(phrase.getAttribute('data-state-word')).toBeNull();
    expect(container.querySelectorAll('[data-state-family="stage"]')).toHaveLength(1);
  });

  /**
   * r15 MAJOR-1 — a closed seat says so on the Client side too. The Client
   * band is assembled before the window rule, so a `client_rep` seat the
   * studio closed used to print its money authority with no closing date
   * anywhere on the row.
   */
  it('prints the off-job clause on a closed client-side seat, beside its authority', () => {
    ul(
      <RosterRow
        row={seatRow({
          name: 'Dale Whitcomb',
          partyKind: 'client_rep',
          paper: null,
          stage: 'off_job',
          offJobAt: '2026-09-15',
          offJobReason: 'Moved out of state.',
        })}
        band="clientSide"
        expanded={false}
        onToggle={jest.fn()}
      />,
    );
    expect(
      screen.getByText('Off the job 15 Sep 2026. Moved out of state.'),
    ).toBeInTheDocument();
  });

  /**
   * R-BR (r17) — THE STATE THE WRITE-SIDE FIX PREVENTS.
   *
   * Since r15 the closing date prints off the row's own record at every band,
   * so a seat carrying a stale `offJobAt` while standing in the Bidding band
   * states a false fact about whether the person is on the job. `useSetPartyBid`
   * now clears `off_job_at` / `off_job_reason` when a correction moves the
   * stage away from a withdrawal; this is what the row would say if it did
   * not.
   */
  it('would print a closing date on a bidding row that kept a stale off-job date (R-BR)', () => {
    ul(
      <RosterRow
        row={seatRow({
          name: 'Northgate Electric',
          stage: 'bidding',
          offJobAt: '2026-09-15',
          offJobReason: null,
        })}
        band="bidding"
        expanded={false}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByText('Off the job 15 Sep 2026.')).toBeInTheDocument();
  });

  it('pairs aria-expanded with aria-controls on the unfold (SPEC §7 #5)', () => {
    ul(<RosterRow row={seatRow()} band="this_week" expanded={false} onToggle={jest.fn()} />);
    const toggle = screen.getByRole('button', { name: /Dana Kowalski/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeInTheDocument();
  });
});

describe('RosterRow — unfolded', () => {
  const open = (over: Partial<CallSheetRow> = {}) =>
    ul(
      <RosterRow
        row={seatRow(over)}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        projectName="Okonkwo residence"
      />,
    );

  it('shows the phone, the email, and the consent and paper words', () => {
    const { container } = open();
    expect(screen.getByText('dana@northgateelectric.com')).toBeInTheDocument();
    const families = Array.from(container.querySelectorAll('[data-state-word]')).map((el) =>
      el.getAttribute('data-state-family'),
    );
    expect(families).toEqual(expect.arrayContaining(['consent', 'paper']));
  });

  it('prints the consent sentence with its source and date (R-Q)', () => {
    consentResolution = {
      verdict: 'granted',
      record: {
        status: 'granted',
        source: 'written',
        consented_at: '2025-05-02',
        opt_out_source: null,
        opt_out_at: null,
      },
    };
    const { container } = open();
    expect(container.querySelector('[data-consent-sentence]')).toHaveTextContent(
      'Written consent, 2 May 2025, on the Okonkwo residence.',
    );
  });

  /**
   * QA-R13-1 — ONE RECORD, ONE ORIGIN JOB, WHATEVER SURFACE READS IT.
   *
   * Pete Rusk's opt-out was recorded on the Lindqvist kitchen and carried
   * forward. The Directory printed "…on the Lindqvist kitchen." off the
   * record's own `origin_project_id`; this row printed "…on the Okonkwo
   * residence." because it substituted the sheet's own project name into R-Q's
   * template for every record it read.
   */
  it('names the job the RECORD names, not the sheet it is read on (QA-R13-1)', () => {
    projectsData = [{ id: 'proj-lindqvist', name: 'Lindqvist kitchen' }];
    consentResolution = {
      verdict: 'opted_out',
      record: {
        status: 'opted_out',
        source: null,
        consented_at: null,
        opt_out_source: 'inbound_sms',
        opt_out_at: '2025-12-03',
        origin_project_id: 'proj-lindqvist',
      },
    };
    const { container } = open();
    expect(container.querySelector('[data-consent-sentence]')).toHaveTextContent(
      'Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.',
    );
  });

  /** …and a record whose origin job cannot be resolved names no job at all,
   *  rather than claiming the one in hand. */
  it('names no job when the record\u2019s origin cannot be resolved (QA-R13-1)', () => {
    projectsData = [];
    consentResolution = {
      verdict: 'opted_out',
      record: {
        status: 'opted_out',
        source: null,
        consented_at: null,
        opt_out_source: 'inbound_sms',
        opt_out_at: '2025-12-03',
        origin_project_id: 'proj-lindqvist',
      },
    };
    const { container } = open();
    const sentence = container.querySelector('[data-consent-sentence]');
    expect(sentence).toHaveTextContent('Opted out by text, 3 Dec 2025.');
    expect(sentence?.textContent).not.toContain('Okonkwo');
  });

  /**
   * CR-7 — direction §5.5 and SPEC §7 #4 ask a gated act for a VISIBLE
   * consequence sentence beside it. This one was `sr-only`, so a sighted
   * designer saw a dead Text button with nothing beside it.
   */
  it('the Text act prints its held reason where a sighted reader can see it', () => {
    const { container } = open({ consent: 'not_asked' });
    const text = screen.getByRole('button', { name: /^Text$/ });
    expect(text).toHaveAttribute('aria-disabled', 'true');
    const describedBy = text.getAttribute('aria-describedby');
    const reason = document.getElementById(describedBy as string);
    expect(reason).toHaveTextContent(
      'Texting opens once they have said yes on the record and a number is on file.',
    );
    expect(reason).not.toHaveClass('sr-only');
    expect(container.querySelector('.sr-only')).not.toBe(reason);
  });

  it('offers the four acts, and never the word Remove', () => {
    const { container } = open();
    expect(screen.getByRole('button', { name: /^Text$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy field link/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show to client/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close this seat/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bRemove\b/);
  });

  it('closes a seat in two steps, with a reason, through closeSeat', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Close this seat/ }));
    expect(closeMutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Why it closed'), {
      target: { value: 'The slab program went to Stonehaven.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Close the seat/ }));
    expect(closeMutate).toHaveBeenCalledWith({
      id: 'seat-dana',
      projectId: 'okonkwo',
      reason: 'The slab program went to Stonehaven.',
    });
    expect(removeMutate).not.toHaveBeenCalled();
  });

  it('holds the hard delete while the seat carries a record, and says why', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Close this seat/ }));
    const mistake = screen.getByRole('button', { name: /Added by mistake/ });
    expect(mistake).toHaveAttribute('aria-disabled', 'true');
    const describedBy = mistake.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      /texting record behind it/,
    );
    fireEvent.click(mistake);
    expect(removeMutate).not.toHaveBeenCalled();
  });

  it('lets a mistaken add go when the seat carries nothing', () => {
    ul(
      <RosterRow
        row={seatRow({ consent: 'not_asked', paper: 'not_on_file', stage: 'active' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Close this seat/ }));
    const mistake = screen.getByRole('button', { name: /Added by mistake/ });
    expect(mistake).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(mistake);
    expect(removeMutate).toHaveBeenCalledWith({ id: 'seat-dana', projectId: 'okonkwo' });
  });

  it('mints a field link that ends with the job, not on a 90-day clock', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    open();
    fireEvent.click(screen.getByRole('button', { name: /Copy field link/ }));
    await screen.findByText(/Ends with the job, 13 August 2027/);
    // CR-2: through the END of the last day, the same instant the person
    // card's Mint access sends — a bare date is midnight, which on the last
    // day is already behind `now()` and drops the RPC to its ninety-day term.
    expect(createLinkMutate).toHaveBeenCalledWith({
      partyId: 'seat-dana',
      projectId: 'okonkwo',
      expiresAt: '2027-08-13T23:59:59Z',
    });
  });

  // CR-2 — the warranty outlives the window, and the RPC dates the token from
  // `max(on_site_to, warranty_until)`. The row used to name `on_site_to`
  // alone: "Ends with the job, 15 October 2025" under a token live to
  // November 2026.
  it('states the WARRANTY date when the warranty outlives the window', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    ul(
      <RosterRow
        row={seatRow({ onSiteTo: '2025-10-15', warrantyUntil: '2026-11-21' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy field link/ }));
    await screen.findByText(/Ends with the job, 21 November 2026/);
    expect(createLinkMutate).toHaveBeenCalledWith({
      partyId: 'seat-dana',
      projectId: 'okonkwo',
      expiresAt: '2026-11-21T23:59:59Z',
    });
  });

  // CR-2 — both dates behind us: the RPC falls to its ninety-day term, so the
  // row says that rather than naming a closed window as if it were the door.
  it('says ninety days when the window and the warranty have both closed', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
    ul(
      <RosterRow
        row={seatRow({ onSiteFrom: '2025-05-05', onSiteTo: '2025-10-15', warrantyUntil: null })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy field link/ }));
    await screen.findByText(/ninety days from today/);
    expect(createLinkMutate).toHaveBeenCalledWith({
      partyId: 'seat-dana',
      projectId: 'okonkwo',
      expiresAt: undefined,
    });
  });

  it('holds Text until the record says yes', () => {
    ul(
      <RosterRow
        row={seatRow({ consent: 'not_asked' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /^Text$/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  /**
   * CR3-9 — THE RULE OUTRANKS THE GRANT (C7). The row gated on consent and the
   * phone alone, so a person carrying BOTH a recorded grant and a "Never text"
   * rule got a live Text act and a live Send — and there was no server backstop
   * behind it either.
   */
  it('holds Text on a recorded grant when the studio’s rule says never text', () => {
    const { container } = ul(
      <RosterRow
        row={seatRow({ consent: 'granted' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        rule={
          {
            id: 'rule-1',
            subject_type: 'person',
            subject_id: 'card-dana',
            channels_allowed: ['office'],
            channels_forbidden: ['sms'],
            route_to_person_id: null,
            contact_hours: null,
            escalation_by_class: {},
            reason: 'Never text. Office phone only.',
            set_by: null,
            set_at: '2026-10-06T00:00:00Z',
            created_at: '',
            updated_at: '',
          } as never
        }
      />,
    );
    const act = screen.getByRole('button', { name: /^Text$/ });
    expect(act).toHaveAttribute('aria-disabled', 'true');
    const reason = container.querySelector(
      `#${act.getAttribute('aria-describedby')}`,
    );
    expect(reason).toHaveTextContent(
      'The studio’s rule for Dana Kowalski says never text. Change the rule on their card first.',
    );
  });

  /**
   * QA-R9-1 — the same sentence, on the row, told a do-not-contact block it was
   * merely a texting preference. Frank Bauer's rule shuts every direct channel
   * and routes the contact; the row now says so and names the door.
   */
  it('names a do-not-contact block and its route, not “never text”', () => {
    const { container } = ul(
      <RosterRow
        row={seatRow({ consent: 'granted' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        routeTo={{ name: 'Rosa Delgado', email: null, officePhone: null }}
        rule={
          {
            id: 'rule-frank',
            subject_type: 'person',
            subject_id: 'card-dana',
            channels_allowed: [],
            channels_forbidden: ['sms', 'mobile', 'office', 'email'],
            route_to_person_id: 'card-rosa',
            contact_hours: null,
            escalation_by_class: {},
            reason: 'No direct contact, at his request.',
            set_by: null,
            set_at: '2026-10-06T00:00:00Z',
            created_at: '',
            updated_at: '',
          } as never
        }
      />,
    );
    const act = screen.getByRole('button', { name: /^Text$/ });
    expect(act).toHaveAttribute('aria-disabled', 'true');
    const reason = container.querySelector(
      `#${act.getAttribute('aria-describedby')}`,
    );
    expect(reason).toHaveTextContent(
      'The studio’s rule for Dana Kowalski says do not contact directly. Write Rosa Delgado instead. Change the rule on their card first.',
    );
  });

  it('leaves Text open for a rule that bars only the email', () => {
    ul(
      <RosterRow
        row={seatRow({ consent: 'granted' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        rule={
          {
            id: 'rule-2',
            subject_type: 'person',
            subject_id: 'card-dana',
            channels_allowed: [],
            channels_forbidden: ['email'],
            route_to_person_id: null,
            contact_hours: null,
            escalation_by_class: {},
            reason: 'Text only. The email on file bounces.',
            set_by: null,
            set_at: '2026-10-12T00:00:00Z',
            created_at: '',
            updated_at: '',
          } as never
        }
      />,
    );
    expect(
      screen.getByRole('button', { name: /^Text$/ }),
    ).not.toHaveAttribute('aria-disabled');
  });
});

/**
 * THE BIDDING BAND (direction §3.4, R-R, 00631).
 *
 * A price nobody has answered is not a body on the site: the outcome is a
 * STAGE word, and recording a losing answer moves the seat out of every crew
 * band. The dates print at both widths, folded or not (C28).
 */
describe('RosterRow — the Bidding band', () => {
  const bidSeat = (over: Partial<CallSheetRow> = {}) =>
    seatRow({
      key: 'seat:seat-rivera',
      seatId: 'seat-rivera',
      name: 'Rivera Finishes',
      partyKind: 'sub',
      trade: 'paint',
      stage: 'no_response',
      meta: 'Sub · paint',
      ...over,
    });

  const BID = {
    seatId: 'seat-rivera',
    bidDueAt: '2026-10-05',
    bidOutcome: null,
    bidValidUntil: '2026-11-04',
    bidQuotedByPersonId: 'card-tom',
    bidAmountCents: null,
    // 00631's three dated events (r1 M-6).
    bidAskedAt: null,
    bidQuotedAt: null,
    bidSelectedAt: null,
  };

  /** A seat carrying nothing at all — MAJOR-7's negative control. */
  const NO_BID = {
    seatId: 'seat-rivera',
    bidDueAt: null,
    bidOutcome: null,
    bidValidUntil: null,
    bidQuotedByPersonId: null,
    bidAmountCents: null,
    bidAskedAt: null,
    bidQuotedAt: null,
    bidSelectedAt: null,
  };

  const PEOPLE = [{ id: 'card-tom', name: 'Tom Marrow' }];
  /** The same book after the studio pressed "Put this card away" on Tom. */
  const PEOPLE_TOM_PUT_AWAY = [
    // RosterGroups hands the row this book sorted by name, archived included.
    { id: 'card-rosa', name: 'Rosa Delgado' },
    { id: 'card-tom', name: 'Tom Marrow', archived: true },
  ];

  /**
   * r13 MAJOR-1 — AN ARCHIVED ESTIMATOR ERASED A RECORDED FACT FROM TWO FACES.
   *
   * W3 shipped 00631's estimator field and the standing "Put this card away"
   * door in one wave. Resolved against the archived-excluded rolodex, pressing
   * that door dropped "Priced by Tom Marrow." off every Call Sheet row whose
   * seat records him, with nothing said, while
   * `project_parties.bid_quoted_by_person_id` still names him.
   */
  it('keeps the estimator on the face after their card is put away', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded={false}
        onToggle={jest.fn()}
        bid={BID}
        bidPeople={PEOPLE_TOM_PUT_AWAY}
      />,
    );
    expect(document.querySelector('[data-bid-note]')?.textContent).toBe(
      'Due 5 October 2026. Holds until 4 November 2026. ' +
        'Priced by Tom Marrow, whose card is put away.',
    );
  });

  /**
   * r13 MAJOR-1, the second face: a controlled <select> whose value names no
   * <option> renders at `selectedIndex = -1` — blank, over a record that names
   * somebody. The archived card is offered as the STANDING value and marked;
   * it is not offered as a fresh pick to anyone else.
   */
  it('renders the put-away estimator as the standing pick, marked', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={BID}
        bidPeople={PEOPLE_TOM_PUT_AWAY}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    const select = screen.getByLabelText('Who priced it') as HTMLSelectElement;
    expect(select.value).toBe('card-tom');
    expect(select.selectedIndex).toBeGreaterThan(-1);
    expect(
      Array.from(select.options).map((o) => o.textContent),
    ).toEqual(['Nobody named', 'Rosa Delgado', 'Tom Marrow (card put away)']);
  });

  /** The negative control: a put-away card nobody recorded is not offered. */
  it('does not offer a put-away card as a fresh pick', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={{ ...BID, bidQuotedByPersonId: null }}
        bidPeople={PEOPLE_TOM_PUT_AWAY}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    const select = screen.getByLabelText('Who priced it') as HTMLSelectElement;
    expect(
      Array.from(select.options).map((o) => o.textContent),
    ).toEqual(['Nobody named', 'Rosa Delgado']);
  });

  it('prints the bid note on the COLLAPSED row (R-R / C28)', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded={false}
        onToggle={jest.fn()}
        bid={BID}
        bidPeople={PEOPLE}
      />,
    );
    expect(document.querySelector('[data-bid-note]')?.textContent).toBe(
      'Due 5 October 2026. Holds until 4 November 2026. Priced by Tom Marrow.',
    );
  });

  it('prints the three dated events SPEC §5.4 #9 and R-R require (r1 M-6)', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded={false}
        onToggle={jest.fn()}
        bid={{
          ...BID,
          bidAskedAt: '2026-09-28',
          bidQuotedAt: '2026-10-02',
          bidSelectedAt: '2026-10-09',
        }}
        bidPeople={PEOPLE}
      />,
    );
    const note = document.querySelector('[data-bid-note]')?.textContent ?? '';
    // SPEC §5.4 #9, verbatim and adjacent
    expect(note).toContain('Asked 28 September 2026. Due 5 October 2026.');
    // R-R, verbatim and adjacent
    expect(note).toContain('Quoted 2 October 2026. Selected 9 October 2026.');
  });

  it('prints nothing where 00631 refused to guess a date', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded={false}
        onToggle={jest.fn()}
        bid={NO_BID}
        bidPeople={PEOPLE}
      />,
    );
    expect(document.querySelector('[data-bid-note]')).not.toBeInTheDocument();
  });

  /**
   * MAJOR-7 — "Selected" and "They withdrew" were one-way doors: both band the
   * seat out of Bidding (`awarded` by window, `off_job` to Done) and no other
   * surface offers these fields, so a mis-picked line in a six-option select
   * could not be corrected from anywhere in the portal.
   */
  it('offers the editor to any seat that CARRIES a bid, in any band', () => {
    const { rerender } = render(
      <RosterRow
        row={bidSeat()}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        bid={NO_BID}
        bidPeople={PEOPLE}
      />,
    );
    expect(document.querySelector('[data-bid-editor]')).not.toBeInTheDocument();
    rerender(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={NO_BID}
        bidPeople={PEOPLE}
      />,
    );
    expect(document.querySelector('[data-bid-editor]')).toBeInTheDocument();
    // an awarded seat, banded by its window, keeps its bid door
    rerender(
      <RosterRow
        row={bidSeat()}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        bid={BID}
        bidPeople={PEOPLE}
      />,
    );
    expect(document.querySelector('[data-bid-editor]')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change what came back' }),
    ).toBeInTheDocument();
    // a seat off the job through "They withdrew" keeps it too
    rerender(
      <RosterRow
        row={bidSeat()}
        band="done"
        expanded
        onToggle={jest.fn()}
        bid={{ ...BID, bidOutcome: 'withdrawn' }}
        bidPeople={PEOPLE}
      />,
    );
    expect(document.querySelector('[data-bid-editor]')).toBeInTheDocument();
  });

  /**
   * r7 MAJOR-4 — a refusal is an ALERT. It used to go through the row's polite
   * `role="status"` announcer, the same voice that says the bid was written.
   */
  it('prints a refused bid in the row’s own alert line, not the announcer', async () => {
    const onAnnounce = jest.fn();
    setBidMutate.mockRejectedValueOnce(
      new Error('party_bid_quoted_by_not_a_person'),
    );
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={NO_BID}
        bidPeople={PEOPLE}
        onAnnounce={onAnnounce}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Write the bid' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Write the bid' })[0],
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/price the work/);
    expect(onAnnounce).not.toHaveBeenCalled();
  });

  it('writes every fact, and moves the stage with the outcome', async () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={NO_BID}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Write the bid' }));
    fireEvent.change(screen.getByLabelText('How it came back'), {
      target: { value: 'declined' },
    });
    fireEvent.change(screen.getByLabelText('The studio asked'), {
      target: { value: '2026-09-28' },
    });
    fireEvent.change(screen.getByLabelText('The answer was owed'), {
      target: { value: '2026-10-05' },
    });
    fireEvent.change(screen.getByLabelText('The number came back'), {
      target: { value: '2026-10-02' },
    });
    fireEvent.change(screen.getByLabelText('The studio chose them'), {
      target: { value: '2026-10-09' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Write the bid' })[0],
    );
    await waitFor(() => expect(setBidMutate).toHaveBeenCalled());
    expect(setBidMutate).toHaveBeenCalledWith({
      id: 'seat-rivera',
      projectId: 'okonkwo',
      // r7 BLOCKING-1: the seat as it stood, so the hook can tell recording an
      // outcome from correcting a field on a seat whose outcome has not moved.
      // r19 major-1: and the date it already carries, so "They withdrew" can
      // write one where none stands without moving one that does.
      previous: { bidOutcome: null, stage: 'no_response', offJobAt: null },
      patch: {
        bidAskedAt: '2026-09-28',
        bidDueAt: '2026-10-05',
        bidQuotedAt: '2026-10-02',
        bidSelectedAt: '2026-10-09',
        bidOutcome: 'declined',
        bidValidUntil: null,
        bidQuotedByPersonId: null,
      },
    });
  });

  it('offers the outcomes as acts, never as schema words', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={BID}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    const options = Array.from(
      (screen.getByLabelText('How it came back') as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(options).toEqual([
      'Nothing recorded yet',
      'Asked for a price',
      'They quoted',
      'Selected',
      'They declined',
      'No response',
      'They withdrew',
    ]);
    expect(document.body.textContent).not.toMatch(/no_response|off_job|bid_outcome/);
  });

  it('says a losing bidder never reads as crew, before the press', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={BID}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    fireEvent.change(screen.getByLabelText('How it came back'), {
      target: { value: 'declined' },
    });
    // MAJOR-3: a DESTINATION, not an act — never "…moves them to they declined."
    expect(
      screen.getByText(
        'Recording this moves Rivera Finishes to Declined. A bidder who did not win never reads as crew.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * r8 BLOCKING-1 — the sentence promised a move on two presses that make
   * none. `useSetPartyBid` writes `stage` only when the outcome CHANGED and
   * the seat is not already past the bid, and `bidNote` never prints the
   * outcome word, so a false promise left no readable trace either.
   */
  it('claims no move on an ordinary correction, where none is written', () => {
    render(
      <RosterRow
        // the seat as it stands: on site, with an outcome already recorded
        row={bidSeat({ stage: 'active' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        bid={{ ...BID, bidOutcome: 'selected' }}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    // the editor seeds the draft from the seat's own outcome, so the studio
    // correcting "Who priced it" re-sends it unchanged
    expect(
      (screen.getByLabelText('How it came back') as HTMLSelectElement).value,
    ).toBe('selected');
    fireEvent.change(screen.getByLabelText('Who priced it'), {
      target: { value: 'card-tom' },
    });
    const sentence = document.querySelector('[data-bid-editor]')?.textContent ?? '';
    expect(sentence).not.toMatch(/moves Rivera Finishes to/);
    expect(
      screen.getByText(
        'The outcome is unchanged, so nothing moves. This records the dates and who priced it.',
      ),
    ).toBeInTheDocument();
  });

  it('says the stage stays where it is on a seat already past the bidding', () => {
    render(
      <RosterRow
        row={bidSeat({ stage: 'active' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        bid={{ ...BID, bidOutcome: 'selected' }}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    fireEvent.change(screen.getByLabelText('How it came back'), {
      target: { value: 'declined' },
    });
    const sentence = document.querySelector('[data-bid-editor]')?.textContent ?? '';
    expect(sentence).not.toMatch(/moves Rivera Finishes to/);
    expect(sentence).not.toMatch(/never reads as crew/);
    expect(
      screen.getByText(
        'This seat is past the bidding, so its stage stays where it is. Recording this writes what came back, and nothing else.',
      ),
    ).toBeInTheDocument();
  });

  it('still promises the move where the write makes one', () => {
    render(
      <RosterRow
        // withdrawn reaches past the bid, so the seat does move
        row={bidSeat({ stage: 'active' })}
        band="this_week"
        expanded
        onToggle={jest.fn()}
        bid={{ ...BID, bidOutcome: 'selected' }}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    fireEvent.change(screen.getByLabelText('How it came back'), {
      target: { value: 'withdrawn' },
    });
    expect(
      screen.getByText(
        'Recording this moves Rivera Finishes to Off the job. A bidder who did not win never reads as crew.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * r9 MAJOR-1 — THE FOURTH PRESS. "Nothing recorded yet" is the select's
   * first option and the editor seeds the draft from the seat's own outcome,
   * so clearing a recorded one is a single click. The write DROPS
   * `bid_outcome` and writes no stage, and r8's sentence still described
   * recording one.
   */
  it('says what clearing a recorded outcome takes away, and what stays', async () => {
    render(
      <RosterRow
        row={bidSeat({ stage: 'awarded' })}
        band="later"
        expanded
        onToggle={jest.fn()}
        bid={{ ...BID, bidOutcome: 'selected' }}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    fireEvent.change(screen.getByLabelText('How it came back'), {
      target: { value: '' },
    });
    const sentence = document.querySelector('[data-bid-editor]')?.textContent ?? '';
    expect(sentence).not.toMatch(/moves them out of the bidding band/);
    expect(
      screen.getByText(
        'Clearing the outcome takes Selected off Rivera Finishes\u2019s record. The seat stays at Awarded.',
      ),
    ).toBeInTheDocument();

    // and the press does exactly that: the outcome goes, the stage does not move
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Write the bid' })[0],
    );
    await waitFor(() => expect(setBidMutate).toHaveBeenCalled());
    expect(setBidMutate.mock.calls[0][0].patch.bidOutcome).toBeNull();
    // r19 major-1 — the seat as it stands now carries its own off-the-job
    // date, so the hook can date a withdrawal without moving one the studio
    // already wrote.
    expect(setBidMutate.mock.calls[0][0].previous).toEqual({
      bidOutcome: 'selected',
      stage: 'awarded',
      offJobAt: null,
    });
  });

  it('keeps the bidding-band sentence where no outcome was ever recorded', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={NO_BID}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Write the bid' }));
    expect(
      screen.getByText(
        'The outcome is what moves them out of the bidding band. Nothing else on this row does.',
      ),
    ).toBeInTheDocument();
  });

  it('names only PEOPLE as the estimator (00631’s guard)', () => {
    render(
      <RosterRow
        row={bidSeat()}
        band="bidding"
        expanded
        onToggle={jest.fn()}
        bid={BID}
        bidPeople={PEOPLE}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Change what came back' }),
    );
    const options = Array.from(
      (screen.getByLabelText('Who priced it') as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(options).toEqual(['Nobody named', 'Tom Marrow']);
  });
});

/**
 * THE EXPIRY NOTICE (00630) — the sweep's own sentence, before the paper
 * actually lapses. No leading rule: nothing is held yet.
 */
describe('RosterRow — the expiry notice', () => {
  const soonSeat = () => seatRow({ paper: 'lapses_soon' });

  it('prints the notice where the sweep wrote one', () => {
    complianceNotices = [
      { id: 'n-1', document_id: 'doc-1', state: 'lapses_soon', noticed_at: '2026-09-13' },
    ];
    complianceDocs = [
      {
        id: 'doc-1',
        holder_id: 'northgate',
        doc_type: 'coi_gl',
        doc_label: null,
        expires_on: '2026-10-06',
        blocks: ['site_access'],
        superseded_by: null,
      },
    ];
    render(
      <RosterRow row={soonSeat()} band="this_week" expanded={false} onToggle={jest.fn()} />,
    );
    expect(document.querySelector('[data-expiry-notice]')?.textContent).toBe(
      'Northgate Electric’s insurance lapses on 6 October 2026.',
    );
  });

  it('says nothing where the sweep has not spoken', () => {
    complianceNotices = [];
    complianceDocs = [
      {
        id: 'doc-1',
        holder_id: 'northgate',
        doc_type: 'coi_gl',
        doc_label: null,
        expires_on: '2026-10-06',
        blocks: ['site_access'],
        superseded_by: null,
      },
    ];
    render(
      <RosterRow row={soonSeat()} band="this_week" expanded={false} onToggle={jest.fn()} />,
    );
    expect(document.querySelector('[data-expiry-notice]')).not.toBeInTheDocument();
  });
});

/**
 * r11 MAJOR-1 — THE ROW'S SENTENCES READ THE SAME HOLDERS THE WORD DOES.
 *
 * `people_directory_seats.paper_state` is
 * identity_paper_state(studio_contact_id, COALESCE(seat's firm, card's firm))
 * (R-BA / R-BJ), so the word reduces worst-first over the person's OWN
 * documents and their firm's. The row's clauses read only `row.companyId`, so
 * a sole proprietor seated with no firm card printed `Lapsed` with no sentence
 * at all, and a person-held lapse under a firm card named the firm's paper.
 * Not reachable on the shipped fixture (its one person-held document expires
 * 2029-05-01 and carries no notice), which is why it is pinned here.
 */
describe('RosterRow — a person-held paper', () => {
  it('prints the held clause for a sole proprietor with no firm card', () => {
    complianceDocs = [
      {
        id: 'doc-own',
        holder_id: 'card-dana',
        doc_type: 'license',
        doc_label: null,
        expires_on: '2026-03-31',
        blocks: ['site_access'],
        superseded_by: null,
      },
    ];
    const { container } = ul(
      <RosterRow
        row={seatRow({ companyId: null, companyName: null })}
        band="this_week"
        expanded={false}
        onToggle={jest.fn()}
      />,
    );
    expect(container.querySelector('[data-held-clause]')).toHaveTextContent(
      'Site access held. Dana Kowalski’s licence lapsed 31 March 2026.',
    );
  });

  it('names the PERSON, not the firm, when the lapsed paper is their own', () => {
    complianceDocs = [
      {
        id: 'doc-own',
        holder_id: 'card-dana',
        doc_type: 'license',
        doc_label: null,
        expires_on: '2026-03-31',
        blocks: ['site_access'],
        superseded_by: null,
      },
    ];
    const { container } = ul(
      <RosterRow row={seatRow()} band="this_week" expanded={false} onToggle={jest.fn()} />,
    );
    const clause = container.querySelector('[data-held-clause]');
    expect(clause?.textContent).toContain('Dana Kowalski’s licence');
    expect(clause?.textContent).not.toContain('Northgate Electric');
  });

  it('prints the expiry notice for a person-held paper, named to the person', () => {
    complianceNotices = [
      { id: 'n-own', document_id: 'doc-own', state: 'lapses_soon', noticed_at: '2026-09-13' },
    ];
    complianceDocs = [
      {
        id: 'doc-own',
        holder_id: 'card-dana',
        doc_type: 'license',
        doc_label: null,
        expires_on: '2026-10-06',
        blocks: ['site_access'],
        superseded_by: null,
      },
    ];
    render(
      <RosterRow
        row={seatRow({ paper: 'lapses_soon', companyId: null, companyName: null })}
        band="this_week"
        expanded={false}
        onToggle={jest.fn()}
      />,
    );
    expect(document.querySelector('[data-expiry-notice]')?.textContent).toBe(
      'Dana Kowalski’s licence lapses on 6 October 2026.',
    );
  });
});
