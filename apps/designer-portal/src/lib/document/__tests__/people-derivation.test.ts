import {
  deriveNurtureQueue,
  deriveRelationshipJourney,
  deriveRelationshipLine,
  deriveStatusDot,
  isNurtureDue,
  roleLabel,
  sortJourney,
  type DirectoryPerson,
  type JourneyEvent,
  type JourneyInputs,
} from '../people-derivation';

const NOW = new Date('2026-06-16T12:00:00Z');

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
}

function asMsHelper(isoStr: string): number {
  return Date.parse(isoStr);
}

function mkPerson(partial: Partial<DirectoryPerson>): DirectoryPerson {
  return {
    person_id: 'x',
    role: 'client',
    display_name: 'Pat Doe',
    email: null,
    phone: null,
    profile_id: null,
    project_id: null,
    designer_id: 'd1',
    status_raw: 'active',
    last_touch_at: iso(2),
    meta: {},
    // 00420's appended column — 'mine' by default so every pre-Wave-4 case
    // below is unaffected; the Wave 4 describe block overrides it explicitly.
    scope: 'mine',
    ...partial,
  };
}

describe('deriveStatusDot (R57)', () => {
  it('active client → active', () => {
    expect(deriveStatusDot(mkPerson({ status_raw: 'active' }), NOW)).toBe('active');
  });

  it('proposal client → warm', () => {
    expect(deriveStatusDot(mkPerson({ status_raw: 'proposal' }), NOW)).toBe('warm');
  });

  it('past client quiet 8 months → due (Joan Marsh)', () => {
    expect(
      deriveStatusDot(mkPerson({ status_raw: 'completed', last_touch_at: iso(245) }), NOW),
    ).toBe('due');
  });

  it('past client quiet ~6.5 months → warm (drifting, not yet due)', () => {
    expect(
      deriveStatusDot(mkPerson({ status_raw: 'completed', last_touch_at: iso(200) }), NOW),
    ).toBe('warm');
  });

  it('recently-finished client → cool', () => {
    expect(
      deriveStatusDot(mkPerson({ status_raw: 'completed', last_touch_at: iso(10) }), NOW),
    ).toBe('cool');
  });

  it('maker in the founding circle → warm; otherwise cool', () => {
    expect(
      deriveStatusDot(mkPerson({ role: 'maker', meta: { founding_circle: true }, last_touch_at: iso(400) }), NOW),
    ).toBe('warm');
    expect(
      deriveStatusDot(mkPerson({ role: 'maker', meta: {}, last_touch_at: iso(400) }), NOW),
    ).toBe('cool');
  });

  it('gc and team read active', () => {
    expect(deriveStatusDot(mkPerson({ role: 'gc' }), NOW)).toBe('active');
    expect(deriveStatusDot(mkPerson({ role: 'team' }), NOW)).toBe('active');
  });

  it('new lead → due; contacted lead → warm', () => {
    expect(deriveStatusDot(mkPerson({ role: 'lead', status_raw: 'new' }), NOW)).toBe('due');
    expect(deriveStatusDot(mkPerson({ role: 'lead', status_raw: 'contacted' }), NOW)).toBe('warm');
  });
});

describe('deriveRelationshipLine (R57)', () => {
  // J7: status_raw='proposal' means "linked to at least one proposal, draft
  // or sent" (set_document_client, 00225) — meta.has_sent_proposal (00478)
  // is the only honest signal that a real send happened.
  it('a drafted-but-never-sent proposal reads honestly, not due', () => {
    const line = deriveRelationshipLine(
      mkPerson({ status_raw: 'proposal', meta: { has_sent_proposal: false } }),
      NOW,
    );
    expect(line.due).toBe(false);
    expect(line.text).toBe('Direction drafted · not yet sent');
  });

  it('an undefined has_sent_proposal (missing signal) fails closed to not-due', () => {
    const line = deriveRelationshipLine(mkPerson({ status_raw: 'proposal', meta: {} }), NOW);
    expect(line.due).toBe(false);
    expect(line.text).toBe('Direction drafted · not yet sent');
  });

  it('a hesitating proposal reads due once it was actually sent', () => {
    const line = deriveRelationshipLine(
      mkPerson({ status_raw: 'proposal', meta: { has_sent_proposal: true } }),
      NOW,
    );
    expect(line.due).toBe(true);
    expect(line.text).toMatch(/hesitating/);
  });

  it('isNurtureDue only flags a proposal-stage client once it was actually sent', () => {
    expect(
      isNurtureDue(mkPerson({ status_raw: 'proposal', meta: { has_sent_proposal: true } }), NOW),
    ).toBe(true);
    expect(
      isNurtureDue(mkPerson({ status_raw: 'proposal', meta: { has_sent_proposal: false } }), NOW),
    ).toBe(false);
    expect(isNurtureDue(mkPerson({ status_raw: 'proposal', meta: {} }), NOW)).toBe(false);
    // A designer_clients.status of 'lead' (a client relationship still at the
    // lead stage, distinct from role='lead') is unaffected — still due.
    expect(isNurtureDue(mkPerson({ status_raw: 'lead' }), NOW)).toBe(true);
  });

  it('a dormant past client says time to reconnect', () => {
    const line = deriveRelationshipLine(
      mkPerson({ status_raw: 'completed', last_touch_at: iso(245) }),
      NOW,
    );
    expect(line.due).toBe(true);
    expect(line.text).toMatch(/reconnect/);
  });

  it('a new lead asks for a 24-hour response', () => {
    const line = deriveRelationshipLine(
      mkPerson({ role: 'lead', status_raw: 'new', meta: { project_type: 'full_room' } }),
      NOW,
    );
    expect(line.text).toMatch(/respond within 24 hours/);
  });
});

describe('deriveNurtureQueue (R58)', () => {
  it('floats due ties above warm ones and drops cool ties', () => {
    const people = [
      mkPerson({ person_id: 'cool', status_raw: 'completed', last_touch_at: iso(10) }), // cool → dropped
      mkPerson({ person_id: 'warm', status_raw: 'active', last_touch_at: iso(2) }), // active → warm band
      mkPerson({ person_id: 'due', status_raw: 'completed', last_touch_at: iso(245) }), // due
    ];
    const queue = deriveNurtureQueue(people, NOW);
    expect(queue.map((e) => e.person.person_id)).toEqual(['due', 'warm']);
    expect(queue[0]!.due).toBe(true);
    expect(queue[1]!.due).toBe(false);
  });

  it('ranks higher-trust dormant clients first within the due band', () => {
    const people = [
      mkPerson({ person_id: 'low', status_raw: 'completed', last_touch_at: iso(245), meta: { total_revenue: 0 } }),
      mkPerson({ person_id: 'high', status_raw: 'completed', last_touch_at: iso(245), meta: { total_revenue: 5_000_000, total_projects: 3 } }),
    ];
    const queue = deriveNurtureQueue(people, NOW);
    expect(queue[0]!.person.person_id).toBe('high');
  });

  it('J7 — a merely-drafted proposal is not due and carries the honest reason; a sent one is', () => {
    const people = [
      mkPerson({ person_id: 'drafted', status_raw: 'proposal', meta: { has_sent_proposal: false } }),
      mkPerson({ person_id: 'sent', status_raw: 'proposal', meta: { has_sent_proposal: true } }),
    ];
    const queue = deriveNurtureQueue(people, NOW);
    const drafted = queue.find((e) => e.person.person_id === 'drafted')!;
    const sent = queue.find((e) => e.person.person_id === 'sent')!;
    expect(drafted.due).toBe(false);
    expect(drafted.reason).toBe('Direction drafted · not yet sent');
    expect(sent.due).toBe(true);
    expect(sent.reason).not.toMatch(/^Direction drafted/);
  });
});

describe('deriveRelationshipJourney (R51)', () => {
  const person = mkPerson({ person_id: 'p1', display_name: 'Sarah Whitfield' });

  it('an empty relationship weaves an empty journey (no fabrication)', () => {
    expect(deriveRelationshipJourney({ person }, NOW)).toEqual([]);
    expect(
      deriveRelationshipJourney(
        { person, proposals: [], projects: [], decisions: [], threads: [], touchpoints: [], reviews: [] },
        NOW,
      ),
    ).toEqual([]);
  });

  it('weaves the whole relationship, oldest → newest', () => {
    const inputs: JourneyInputs = {
      person,
      proposals: [
        {
          id: 'pr1',
          title: 'Aspen Loft',
          status: 'accepted',
          created_at: iso(100),
          sent_at: iso(95),
          signed_at: iso(90),
          total_cents: 2_510_000,
        },
      ],
      projects: [{ id: 'pj1', name: 'Aspen Loft Refresh', status: 'active', kickoff_date: iso(88) }],
      decisions: [
        { id: 'd1', title: 'Rug selection', status: 'responded', created_at: iso(50), resolved_at: iso(45), chosen_label: 'Tasara wool' },
      ],
      threads: [{ id: 't1', subject: 'install timing', message_count: 15, last_message_at: iso(2) }],
      touchpoints: [{ id: 'tp1', touchpoint_type: 'check_in', status: 'sent', reason: 'Weekly Pulse sent', created_at: iso(20) }],
      reviews: [{ id: 'rv1', rating: 5, review_text: 'finally feels like home', created_at: iso(1) }],
    };
    const j = deriveRelationshipJourney(inputs, NOW);
    // 3 proposal events + 1 project + 1 decision + 1 thread + 1 touchpoint + 1 review
    expect(j).toHaveLength(8);
    // sorted oldest → newest
    const ts = j.map((e) => e.sortAt);
    expect([...ts]).toEqual([...ts].sort((a, b) => a - b));
    // first is the inquiry (proposal created), last is the review
    expect(j[0]!.type).toBe('inquiry');
    expect(j[j.length - 1]!.type).toBe('review');
  });

  it('a signed proposal carries the dollar amount and deep-links to its document', () => {
    const j = deriveRelationshipJourney(
      {
        person,
        proposals: [{ id: 'pr9', title: 'Loft', status: 'accepted', created_at: iso(30), sent_at: iso(25), signed_at: iso(20), total_cents: 2_510_000 }],
      },
      NOW,
    );
    const signed = j.find((e) => e.label === 'Signed');
    expect(signed).toBeDefined();
    expect(signed!.text).toMatch(/\$25,100/);
    expect(signed!.href).toBe('/doc/pr9');
  });

  it('an unsigned proposal contributes inquiry + sent but no signed event', () => {
    const j = deriveRelationshipJourney(
      { person, proposals: [{ id: 'pr2', title: 'Kitchen', status: 'sent', created_at: iso(10), sent_at: iso(8), signed_at: null }] },
      NOW,
    );
    expect(j.map((e) => e.label)).toEqual(['Inquiry', 'Proposal']);
  });

  it('a resolved decision names the chosen option; an open one says awaiting', () => {
    const resolved = deriveRelationshipJourney(
      { person, decisions: [{ id: 'd1', title: 'Rug', status: 'responded', created_at: iso(20), resolved_at: iso(15), chosen_label: 'Tasara' }] },
      NOW,
    )[0]!;
    expect(resolved.type).toBe('decision');
    expect(resolved.text).toMatch(/chose Tasara/);
    expect(resolved.sortAt).toBe(asMsHelper(iso(15)));

    const open = deriveRelationshipJourney(
      { person, decisions: [{ id: 'd2', title: 'Sconce', status: 'pending', created_at: iso(5), resolved_at: null, chosen_label: null }] },
      NOW,
    )[0]!;
    expect(open.text).toMatch(/awaiting/);
    expect(open.sortAt).toBe(asMsHelper(iso(5)));
  });

  it('a completed project reads as care; an active one stays a project', () => {
    const j = deriveRelationshipJourney(
      {
        person,
        projects: [
          { id: 'a', name: 'Active', status: 'active', created_at: iso(40) },
          { id: 'c', name: 'Done', status: 'completed', created_at: iso(200), completed_at: iso(150) },
        ],
      },
      NOW,
    );
    expect(j.filter((e) => e.type === 'project')).toHaveLength(2); // both opened
    const care = j.find((e) => e.type === 'care');
    expect(care).toBeDefined();
    expect(care!.text).toMatch(/complete/);
  });

  it('a sparse maker/GC journey (project link only) is short and honest', () => {
    const maker = mkPerson({ person_id: 'm1', role: 'maker', display_name: 'Woodward & Sons' });
    const j = deriveRelationshipJourney(
      { person: maker, projects: [{ id: 'pj', name: 'Aspen', status: 'active', kickoff_date: iso(60) }] },
      NOW,
    );
    expect(j).toHaveLength(1);
    expect(j[0]!.type).toBe('project');
    expect(j[0]!.href).toBe('/doc/pj');
  });

  it('drops events with no real timestamp instead of inventing one', () => {
    const j = deriveRelationshipJourney(
      {
        person,
        proposals: [{ id: 'pr', title: 'X', status: 'draft', created_at: null, sent_at: null, signed_at: null }],
        threads: [{ id: 't', subject: 'hi', message_count: 3, last_message_at: null }],
        reviews: [{ id: 'r', rating: 5, review_text: 'great', created_at: 'not-a-date' }],
      },
      NOW,
    );
    expect(j).toEqual([]);
  });

  it('a thread carries its message count and a people deep-link', () => {
    const j = deriveRelationshipJourney(
      { person, threads: [{ id: 'th7', subject: 'rug', message_count: 15, last_message_at: iso(2) }] },
      NOW,
    );
    expect(j[0]!.text).toMatch(/15 messages/);
    expect(j[0]!.href).toBe('/people?thread=th7');
  });

  it('a review snippet is quoted, starred, and truncated when long', () => {
    const long = 'a'.repeat(120);
    const j = deriveRelationshipJourney(
      { person, reviews: [{ id: 'r', rating: 5, review_text: long, created_at: iso(1) }] },
      NOW,
    );
    expect(j[0]!.text).toMatch(/^★★★★★ “a+…”$/);
  });
});

describe('Wave 4 hardening — the 00419/00420 roster-widening roles', () => {
  it('roleLabel maps the allied-professional kinds and the rolodex contact branch', () => {
    expect(roleLabel('architect')).toBe('Architect');
    expect(roleLabel('photographer')).toBe('Photographer');
    expect(roleLabel('stager')).toBe('Stager');
    expect(roleLabel('contact')).toBe('Contact');
  });

  it('deriveStatusDot reads a neutral (cool) dot for every widening role — no fabricated signal', () => {
    for (const role of ['architect', 'photographer', 'stager', 'contact'] as const) {
      expect(deriveStatusDot(mkPerson({ role }), NOW)).toBe('cool');
    }
  });

  it('deriveRelationshipLine never reads "due" for a widening role', () => {
    for (const role of ['architect', 'photographer', 'stager', 'contact'] as const) {
      expect(deriveRelationshipLine(mkPerson({ role }), NOW).due).toBe(false);
    }
  });

  it('architect/photographer/stager read "Role · project", or the bare role with no project on file', () => {
    expect(
      deriveRelationshipLine(mkPerson({ role: 'architect', meta: { project_name: 'Ellsworth' } }), NOW).text,
    ).toBe('Architect · Ellsworth');
    expect(deriveRelationshipLine(mkPerson({ role: 'stager' }), NOW).text).toBe('Stager');
  });

  it('a contact row reads its contact_kind + specialties, falling back to a bare "Contact"', () => {
    expect(
      deriveRelationshipLine(
        mkPerson({ role: 'contact', meta: { contact_kind: 'vendor', specialties: ['lighting', 'hardware'] } }),
        NOW,
      ).text,
    ).toBe('Vendor · Lighting, Hardware');
    expect(deriveRelationshipLine(mkPerson({ role: 'contact', meta: {} }), NOW).text).toBe('Contact');
  });

  it('a foreign-scope (STUDIO) row never reads due, and suffixes the mono STUDIO marker', () => {
    const mine = deriveRelationshipLine(
      mkPerson({ role: 'lead', status_raw: 'new', scope: 'mine', meta: { project_type: 'kitchen' } }),
      NOW,
    );
    expect(mine.due).toBe(true);
    expect(mine.text).toBe('New lead · kitchen · respond within 24 hours');

    const studio = deriveRelationshipLine(
      mkPerson({ role: 'lead', status_raw: 'new', scope: 'studio', meta: { project_type: 'kitchen' } }),
      NOW,
    );
    expect(studio.due).toBe(false);
    expect(studio.text).toBe('Lead · kitchen · STUDIO');
  });
});

describe('contract helpers', () => {
  it('roleLabel maps every role', () => {
    expect(roleLabel('client')).toBe('Client');
    expect(roleLabel('gc')).toBe('GC');
    expect(roleLabel('team')).toBe('Team');
  });

  it('sortJourney orders oldest → newest', () => {
    const evs: JourneyEvent[] = [
      { type: 'review', label: 'Review', text: 'b', at: iso(1), sortAt: NOW.getTime() - 86_400_000 },
      { type: 'inquiry', label: 'Inquiry', text: 'a', at: iso(100), sortAt: NOW.getTime() - 100 * 86_400_000 },
    ];
    expect(sortJourney(evs).map((e) => e.text)).toEqual(['a', 'b']);
  });
});
