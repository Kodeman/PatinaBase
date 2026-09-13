/**
 * The Call Sheet's derivation, against the Okonkwo fixture (SPEC §3).
 *
 * Pure: no React, no hooks, no clock. `today` is 2026-10-20 and "this week" is
 * 19 to 25 October 2026, exactly as the fixture says.
 */

import type { PeopleDirectorySeat, ProjectRosterRow } from '@patina/supabase';
import {
  authorityPhrase,
  callSheetProjection,
  callSheetVitals,
  callSheetVitalsLine,
  fieldLinkExpirySentence,
  heldClause,
  rosterLongDate,
  rosterShortDate,
  seatProfileRole,
  seatWindowText,
  siteAccessSummaryLine,
  wayInSentence,
} from '../roster-derivation';

const TODAY = '2026-10-20';

/** The band rule, injected exactly as `rosterBandFor` states it, so this spec
 *  never imports the hooks barrel. */
const BID_STAGES = ['prospect', 'invited', 'bidding', 'declined', 'no_response'];
const DONE_STAGES = ['closeout', 'warranty', 'off_job', 'retired'];
function bandFor(
  seat: { stage: string | null; on_site_from: string | null; on_site_to: string | null },
  today: string,
) {
  const stage = seat.stage ?? '';
  if (DONE_STAGES.includes(stage)) return 'done' as const;
  if (BID_STAGES.includes(stage)) return 'bidding' as const;
  if (seat.on_site_from && seat.on_site_from > today) return 'later' as const;
  return 'this_week' as const;
}

const labels = {
  kindLabel: (kind: string | null | undefined) => (kind ?? '').toUpperCase(),
  tradeLabel: (_kind: string | null | undefined, trade: string | null | undefined) =>
    trade ?? '',
  teamMeta: (row: ProjectRosterRow) => row.staff_role ?? '',
};

function seat(over: Partial<PeopleDirectorySeat>): PeopleDirectorySeat {
  return {
    identity_key: 'k',
    person_id: 'card-1',
    seat_id: 'seat-1',
    project_id: 'okonkwo',
    project_name: 'Okonkwo residence',
    project_status: 'active',
    designer_id: null,
    party_kind: 'sub',
    display_name: 'Someone',
    trade: null,
    stage: 'active',
    on_site_from: null,
    on_site_to: null,
    site_access_mode: null,
    contracted_through: null,
    company_id: null,
    company_name: null,
    warranty_until: null,
    warranty_contact_person_id: null,
    off_job_at: null,
    off_job_reason: null,
    show_to_client: false,
    studio_contact_id: null,
    phone_e164: null,
    consent_status: null,
    reach_state: 'on_paper',
    paper_state: null,
    contact_rule_summary: null,
    updated_at: null,
    scope: 'studio',
    ...over,
  };
}

function rosterRow(over: Partial<ProjectRosterRow>): ProjectRosterRow {
  return {
    roster_id: 'seat-1',
    source: 'party',
    project_id: 'okonkwo',
    kind: 'sub',
    display_name: 'Someone',
    company_name: null,
    email: null,
    phone: null,
    trade: null,
    job_title: null,
    staff_role: null,
    studio_contact_id: null,
    profile_id: null,
    show_to_client: false,
    has_active_field_link: false,
    sms_consent_status: null,
    updated_at: null,
    ...over,
  };
}

const SEATS: PeopleDirectorySeat[] = [
  // Client side — the household, whatever its window says.
  seat({
    seat_id: 'seat-adaeze',
    person_id: 'card-adaeze',
    party_kind: 'client',
    display_name: 'Adaeze Okonkwo',
    reach_state: 'account',
    consent_status: 'granted',
    on_site_from: '2026-08-01',
    on_site_to: '2027-09-30',
  }),
  seat({
    seat_id: 'seat-chidi',
    person_id: 'card-chidi',
    party_kind: 'client_rep',
    display_name: 'Chidi Okonkwo',
    reach_state: 'on_paper',
    consent_status: 'not_asked',
  }),
  // On the job, this week.
  seat({
    seat_id: 'seat-dana',
    person_id: 'card-dana',
    party_kind: 'sub',
    display_name: 'Dana Kowalski',
    trade: 'electrical',
    company_id: 'northgate',
    company_name: 'Northgate Electric',
    stage: 'active',
    on_site_from: '2026-10-12',
    on_site_to: '2027-08-13',
    reach_state: 'field_link',
    consent_status: 'granted',
    paper_state: 'lapsed',
  }),
  // On the job, later.
  seat({
    seat_id: 'seat-pete',
    person_id: 'card-pete',
    party_kind: 'sub',
    display_name: 'Pete Rusk',
    trade: 'plumbing',
    stage: 'awarded',
    on_site_from: '2026-11-09',
    on_site_to: '2027-04-24',
    reach_state: 'on_paper',
    consent_status: 'opted_out',
  }),
  // Bidding, apart from the crew bands.
  seat({
    seat_id: 'seat-rivera',
    person_id: null,
    party_kind: 'sub',
    display_name: 'Rivera Finishes',
    trade: 'paint',
    stage: 'no_response',
    reach_state: 'on_paper',
  }),
  // Done.
  seat({
    seat_id: 'seat-granite',
    person_id: null,
    party_kind: 'sub',
    display_name: 'Granite North',
    stage: 'off_job',
    off_job_at: '2026-10-02',
    off_job_reason: 'The slab program went to Stonehaven Tile Gallery.',
    reach_state: 'on_paper',
  }),
];

const ROSTER: ProjectRosterRow[] = [
  rosterRow({
    roster_id: 'team-priya',
    source: 'team',
    kind: 'team',
    display_name: 'Priya Natarajan',
    staff_role: 'Lead designer',
    profile_id: 'profile-priya',
  }),
  rosterRow({
    roster_id: 'seat-dana',
    display_name: 'Dana Kowalski',
    phone: '(612) 555-0111',
    email: 'dana@northgateelectric.com',
  }),
];

function project() {
  return callSheetProjection(ROSTER, SEATS, {
    client: { name: null, profileId: null, projectId: 'okonkwo' },
    today: TODAY,
    labels,
    bandFor,
  });
}

describe('callSheetProjection — six bands', () => {
  const p = project();

  it('puts the studio login on the studio side, never in a window band', () => {
    expect(p.bands.studioSide.map((r) => r.name)).toEqual(['Priya Natarajan']);
    expect(p.bands.studioSide[0].source).toBe('team');
  });

  it('puts the household on the client side whatever its window says', () => {
    expect(p.bands.clientSide.map((r) => r.name)).toEqual([
      'Adaeze Okonkwo',
      'Chidi Okonkwo',
    ]);
  });

  it('bands a live window this week and a future window later', () => {
    expect(p.bands.this_week.map((r) => r.name)).toEqual(['Dana Kowalski']);
    expect(p.bands.later.map((r) => r.name)).toEqual(['Pete Rusk']);
  });

  it('keeps bidding and done apart from the crew', () => {
    expect(p.bands.bidding.map((r) => r.name)).toEqual(['Rivera Finishes']);
    expect(p.bands.done.map((r) => r.name)).toEqual(['Granite North']);
  });

  it('joins the seat to v_project_roster for a dialable phone and an email', () => {
    const dana = p.bands.this_week[0];
    expect(dana.phone).toBe('(612) 555-0111');
    expect(dana.email).toBe('dana@northgateelectric.com');
    expect(dana.seatId).toBe('seat-dana');
  });

  it('carries the identity words the seats view reduced', () => {
    const dana = p.bands.this_week[0];
    expect(dana.reach).toBe('field_link');
    expect(dana.consent).toBe('granted');
    expect(dana.paper).toBe('lapsed');
  });

  it('prepends the document own client when no seat claims them', () => {
    const withClient = callSheetProjection(ROSTER, SEATS, {
      client: { name: 'Karin Lindqvist', profileId: 'profile-karin', projectId: 'okonkwo' },
      today: TODAY,
      labels,
      bandFor,
    });
    expect(withClient.bands.clientSide[0].name).toBe('Karin Lindqvist');
    expect(withClient.bands.clientSide[0].source).toBe('client');
  });

  it('never prints the same client twice', () => {
    const withClient = callSheetProjection(ROSTER, SEATS, {
      client: { name: 'Adaeze Okonkwo', profileId: null, projectId: 'okonkwo' },
      today: TODAY,
      labels,
      bandFor,
    });
    expect(withClient.bands.clientSide.filter((r) => r.name === 'Adaeze Okonkwo')).toHaveLength(
      1,
    );
  });
});

describe('the vitals count the window', () => {
  // CR-9 / SPEC §5.4 #3: ALL FOUR numbers close over ONE population — the
  // studio side, the client side and who is on the job this week. Before the
  // fix only the first was scoped and the other three counted every band,
  // `later`, `bidding` and `done` included, so "2 on paper" read as a dozen.
  // This fixture: studio 2 + client 1 + this week 1 = 4.
  it('counts one population, four ways', () => {
    const p = project();
    expect(
      p.bands.studioSide.length + p.bands.clientSide.length + p.bands.this_week.length,
    ).toBe(4);
    const v = callSheetVitals(p);
    expect(v.onTheJobThisWeek).toBe(4);
    expect(v.textable).toBe(2);
    expect(v.withAccounts).toBe(2);
    expect(v.onPaper).toBe(1);
  });

  it('never counts a band the line does not name', () => {
    const p = project();
    // `later`, `bidding` and `done` carry rows in this fixture and none of
    // them may reach any of the four numbers.
    expect(p.bands.later.length + p.bands.bidding.length + p.bands.done.length).toBeGreaterThan(0);
    expect(callSheetVitals(p).onPaper).toBeLessThan(
      p.rows.filter((r) => r.reach === 'on_paper').length,
    );
  });

  it('prints all four counts in the room own words', () => {
    expect(callSheetVitalsLine(project())).toBe(
      '4 on the job this week · 2 reachable by text · 2 with accounts · 1 on paper',
    );
  });
});

describe('the sentences', () => {
  it('prints a held clause in words, never a badge', () => {
    expect(
      heldClause('Northgate Electric', {
        docLabel: 'insurance',
        expiresOn: '2026-03-31',
        blocks: ['site_access', 'payment', 'draw'],
      }),
    ).toBe('Site access held. Northgate Electric’s insurance lapsed 31 March 2026.');
  });

  it('ends a field link with the job, never with a 90-day clock', () => {
    expect(fieldLinkExpirySentence('2027-08-13')).toBe(
      'Ends with the job, 13 August 2027. Renews when they use it.',
    );
    expect(fieldLinkExpirySentence(null)).toBe(
      'Ends with the job. Renews when they use it.',
    );
  });

  it('folds the site access card to one line (R-U)', () => {
    expect(
      siteAccessSummaryLine({
        keyHolderName: 'Ngozi Eze',
        gateControllerName: 'Luis Ochoa',
        changedAt: '2026-10-16T14:00:00Z',
      }),
    ).toBe('Key held by Ngozi Eze. Luis Ochoa controls the gate. Changed 16 Oct 2026.');
  });

  it('prints the way in with no code, and who to ask (PR-r)', () => {
    const line = wayInSentence('Lockbox, version 3', 'Luis Ochoa');
    expect(line).toBe('Lockbox, version 3. The code is held off Patina; ask Luis Ochoa.');
    expect(line).not.toMatch(/\d{4,}/);
  });

  it('prints authority as plain words, with the threshold in dollars', () => {
    expect(
      authorityPhrase(
        [{ scope: 'money', threshold_cents: 250000, prepares_only: false }],
        { money: 'Signs money' },
      ),
    ).toBe('Signs money to $2,500.');
    expect(
      authorityPhrase([{ scope: 'change_order', threshold_cents: null, prepares_only: true }], {
        change_order: 'Approves change orders',
      }),
    ).toBe('Prepares only.');
    expect(authorityPhrase([], {})).toBe('');
  });

  it('reads a window as written, never a day off', () => {
    expect(seatWindowText('2026-10-12', '2027-08-13')).toBe('12 Oct 2026 to 13 Aug 2027');
    expect(seatWindowText('2026-11-09', null)).toBe('From 9 Nov 2026');
    expect(seatWindowText(null, null)).toBe('');
    expect(rosterLongDate('2026-03-31')).toBe('31 March 2026');
    expect(rosterShortDate('2026-10-16T14:00:00Z')).toBe('16 Oct 2026');
    expect(rosterShortDate(null)).toBe('');
  });
});

describe('seatProfileRole — the chevron only where there is something to open', () => {
  it('admits the directory party branch and nothing else', () => {
    expect(seatProfileRole('sub')).toBe('sub');
    expect(seatProfileRole('gc')).toBe('gc');
    expect(seatProfileRole('client_rep')).toBeNull();
    expect(seatProfileRole(null)).toBeNull();
  });
});
