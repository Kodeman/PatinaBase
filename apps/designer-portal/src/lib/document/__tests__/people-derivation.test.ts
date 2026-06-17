import {
  deriveNurtureQueue,
  deriveRelationshipLine,
  deriveStatusDot,
  roleLabel,
  sortJourney,
  type DirectoryPerson,
  type JourneyEvent,
} from '../people-derivation';

const NOW = new Date('2026-06-16T12:00:00Z');

function iso(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
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
  it('a hesitating proposal reads due', () => {
    const line = deriveRelationshipLine(mkPerson({ status_raw: 'proposal' }), NOW);
    expect(line.due).toBe(true);
    expect(line.text).toMatch(/hesitating/);
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
