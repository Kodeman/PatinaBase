import type { ProjectRosterRow } from '@patina/supabase';
import {
  CLIENT_SYNTHETIC_SOURCE,
  flattenRoster,
  groupRoster,
  isSyntheticClientRow,
  kickoffRetired,
  reachState,
  rosterProfileRole,
  syntheticClientRow,
  vitals,
  vitalsInstrumentSuffix,
  vitalsLine,
} from '../roster-derivation';

function row(over: Partial<ProjectRosterRow> = {}): ProjectRosterRow {
  return {
    roster_id: over.roster_id ?? `r-${Math.random().toString(36).slice(2)}`,
    source: 'party',
    project_id: 'proj-1',
    kind: 'other',
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
    sms_consent_status: 'not_asked',
    updated_at: null,
    ...over,
  };
}

const names = (rows: ProjectRosterRow[]) => rows.map((r) => r.display_name);

describe('groupRoster — the three sections (slide 11)', () => {
  it('puts every source=team row on the studio side, whatever its kind says', () => {
    const g = groupRoster([
      row({ source: 'team', kind: 'team', display_name: 'Leah Warner' }),
      // A team row whose kind happens to read 'client' must NOT cross over —
      // the source check wins first.
      row({ source: 'team', kind: 'client', display_name: 'Marcus Webb' }),
    ]);
    expect(names(g.studioSide)).toEqual(['Leah Warner', 'Marcus Webb']);
    expect(g.clientSide).toHaveLength(0);
    expect(g.buildSupply).toHaveLength(0);
  });

  it('splits client / client_rep onto the client side, client first', () => {
    const g = groupRoster([
      row({ kind: 'client_rep', display_name: 'Dana Ellsworth' }),
      row({ kind: 'client', display_name: 'Margaret Ellsworth' }),
    ]);
    expect(names(g.clientSide)).toEqual(['Margaret Ellsworth', 'Dana Ellsworth']);
    expect(g.buildSupply).toHaveLength(0);
  });

  it('orders build & supply architect → gc → sub → vendor → installer → receiver → photographer → stager → other', () => {
    const g = groupRoster([
      row({ kind: 'stager', display_name: 'Stager' }),
      row({ kind: 'other', display_name: 'Other' }),
      row({ kind: 'gc', display_name: 'GC' }),
      row({ kind: 'receiver', display_name: 'Receiver' }),
      row({ kind: 'architect', display_name: 'Architect' }),
      row({ kind: 'photographer', display_name: 'Photographer' }),
      row({ kind: 'vendor', display_name: 'Vendor' }),
      row({ kind: 'installer', display_name: 'Installer' }),
      row({ kind: 'sub', display_name: 'Sub' }),
    ]);
    expect(names(g.buildSupply)).toEqual([
      'Architect',
      'GC',
      'Sub',
      'Vendor',
      'Installer',
      'Receiver',
      'Photographer',
      'Stager',
      'Other',
    ]);
  });

  it('orders subs by trade, blank trades last, then by name', () => {
    const g = groupRoster([
      row({ kind: 'sub', trade: null, display_name: 'No Trade' }),
      row({ kind: 'sub', trade: 'tile', display_name: 'Rosa Martínez' }),
      row({ kind: 'sub', trade: 'electrical', display_name: 'Wire Co' }),
      row({ kind: 'sub', trade: 'tile', display_name: 'Hector Salas' }),
    ]);
    expect(names(g.buildSupply)).toEqual([
      'Wire Co',
      'Hector Salas',
      'Rosa Martínez',
      'No Trade',
    ]);
  });

  it('sorts an unnamed kind after every named one rather than dropping it', () => {
    const g = groupRoster([
      row({ kind: 'inspector', display_name: 'Inspector' }),
      row({ kind: 'other', display_name: 'Other' }),
      row({ kind: 'gc', display_name: 'GC' }),
    ]);
    expect(names(g.buildSupply)).toEqual(['GC', 'Other', 'Inspector']);
  });

  it('returns three empty groups for an empty roster', () => {
    expect(groupRoster([])).toEqual({
      studioSide: [],
      clientSide: [],
      buildSupply: [],
    });
  });
});

// ============================================================================
// THE CLIENT (Wave 5) — v_project_roster has no client branch
// ============================================================================

describe('groupRoster — the synthetic client row', () => {
  const client = {
    name: 'Margaret Ellsworth',
    profileId: 'client-profile-1',
    projectId: 'proj-1',
  };

  it('prepends the document’s client to the client side, ahead of the reps', () => {
    const g = groupRoster(
      [row({ kind: 'client_rep', display_name: 'Dana Ellsworth' })],
      client,
    );
    expect(names(g.clientSide)).toEqual(['Margaret Ellsworth', 'Dana Ellsworth']);
    expect(g.clientSide[0].source).toBe(CLIENT_SYNTHETIC_SOURCE);
    expect(isSyntheticClientRow(g.clientSide[0])).toBe(true);
    expect(g.clientSide[0].profile_id).toBe('client-profile-1');
    expect(g.clientSide[0].roster_id).toBe('client:client-profile-1');
  });

  it('leads even a client-kind party row that is somebody else', () => {
    const g = groupRoster(
      [row({ kind: 'client', display_name: 'Aaron Ellsworth' })],
      client,
    );
    expect(names(g.clientSide)).toEqual(['Margaret Ellsworth', 'Aaron Ellsworth']);
  });

  it('reads ACCOUNT with a profile and ON PAPER without one', () => {
    expect(reachState(groupRoster([], client).clientSide[0])).toBe('account');
    expect(
      reachState(groupRoster([], { ...client, profileId: null }).clientSide[0]),
    ).toBe('on_paper');
  });

  it('keys a profile-less client on their name so the row is still stable', () => {
    const g = groupRoster([], { name: 'Margaret Ellsworth', profileId: null });
    expect(g.clientSide[0].roster_id).toBe('client:Margaret Ellsworth');
  });

  it('adds nothing when the document carries no client name', () => {
    expect(groupRoster([], { name: null }).clientSide).toHaveLength(0);
    expect(groupRoster([], { name: '   ' }).clientSide).toHaveLength(0);
    expect(groupRoster([]).clientSide).toHaveLength(0);
  });

  it('never doubles the client — a party row with the same profile wins', () => {
    const g = groupRoster(
      [
        row({
          kind: 'client',
          display_name: 'M. Ellsworth',
          profile_id: 'client-profile-1',
          phone: '(513) 555-0101',
        }),
      ],
      client,
    );
    expect(names(g.clientSide)).toEqual(['M. Ellsworth']);
    expect(g.clientSide[0].source).toBe('party');
  });

  it('never doubles the client — a party row with the same name (any case) wins', () => {
    const g = groupRoster(
      [row({ kind: 'client', display_name: '  margaret ELLSWORTH ' })],
      { ...client, profileId: null },
    );
    expect(g.clientSide).toHaveLength(1);
    expect(g.clientSide[0].source).toBe('party');
  });

  it('does not dedupe against a client_rep who happens to share the name', () => {
    const g = groupRoster(
      [row({ kind: 'client_rep', display_name: 'Margaret Ellsworth' })],
      client,
    );
    expect(g.clientSide).toHaveLength(2);
  });

  it('leaves the other two groups alone', () => {
    const g = groupRoster(
      [
        row({ source: 'team', kind: 'team', display_name: 'Leah Warner' }),
        row({ kind: 'gc', display_name: 'Danny Ochoa' }),
      ],
      client,
    );
    expect(names(g.studioSide)).toEqual(['Leah Warner']);
    expect(names(g.buildSupply)).toEqual(['Danny Ochoa']);
    expect(names(g.clientSide)).toEqual(['Margaret Ellsworth']);
  });

  it('carries no party affordances — nothing writes to a client_id', () => {
    const synthetic = syntheticClientRow(client)!;
    expect(synthetic.kind).toBe('client');
    expect(synthetic.sms_consent_status).toBeNull();
    expect(synthetic.has_active_field_link).toBe(false);
    expect(synthetic.show_to_client).toBeNull();
    expect(synthetic.studio_contact_id).toBeNull();
    expect(synthetic.project_id).toBe('proj-1');
    expect(syntheticClientRow({ name: '' })).toBeNull();
  });
});

describe('flattenRoster — what the sheet actually shows', () => {
  it('returns every group in sheet order', () => {
    const g = groupRoster(
      [
        row({ kind: 'gc', display_name: 'Danny Ochoa' }),
        row({ source: 'team', kind: 'team', display_name: 'Leah Warner' }),
      ],
      { name: 'Margaret Ellsworth', profileId: 'p-c' },
    );
    expect(names(flattenRoster(g))).toEqual([
      'Leah Warner',
      'Margaret Ellsworth',
      'Danny Ochoa',
    ]);
  });
});

describe('rosterProfileRole — where the chevron can actually go', () => {
  it.each(['gc', 'sub', 'installer', 'receiver', 'architect', 'photographer', 'stager'])(
    'opens a profile for a %s party row',
    (kind) => {
      expect(rosterProfileRole(row({ kind }))).toBe(kind);
    },
  );

  it.each(['vendor', 'client_rep', 'other', 'client', 'inspector'])(
    'has nowhere to go for a %s party row (people_directory excludes it)',
    (kind) => {
      expect(rosterProfileRole(row({ kind }))).toBeNull();
    },
  );

  it('has nowhere to go for a team row or the synthetic client', () => {
    expect(rosterProfileRole(row({ source: 'team', kind: 'gc' }))).toBeNull();
    expect(
      rosterProfileRole(syntheticClientRow({ name: 'Margaret Ellsworth' })!),
    ).toBeNull();
  });

  it('has nowhere to go without a roster id to open', () => {
    expect(rosterProfileRole(row({ kind: 'gc', roster_id: null }))).toBeNull();
  });
});

describe('reachState — the precedence truth table', () => {
  it.each([
    // profile_id, has_active_field_link, expected
    ['p-1', true, 'account'],
    ['p-1', false, 'account'],
    [null, true, 'field_link'],
    [null, false, 'on_paper'],
  ])(
    'profile_id=%s field_link=%s → %s',
    (profileId, hasLink, expected) => {
      expect(
        reachState(
          row({
            profile_id: profileId as string | null,
            has_active_field_link: hasLink as boolean,
          }),
        ),
      ).toBe(expected);
    },
  );

  it('treats a null has_active_field_link as no link', () => {
    expect(reachState(row({ has_active_field_link: null }))).toBe('on_paper');
  });
});

describe('vitals — the counts and the mono strings', () => {
  const roster = [
    // 4 with accounts
    row({ source: 'team', profile_id: 'p-1', sms_consent_status: 'granted' }),
    row({ source: 'team', profile_id: 'p-2', sms_consent_status: 'granted' }),
    row({ profile_id: 'p-3', sms_consent_status: 'granted' }),
    row({ profile_id: 'p-4', sms_consent_status: 'granted' }),
    // 2 more granted, on a field link
    row({ has_active_field_link: true, sms_consent_status: 'granted' }),
    row({ has_active_field_link: true, sms_consent_status: 'granted' }),
    // 2 on paper
    row({ sms_consent_status: 'pending' }),
    row({ sms_consent_status: 'opted_out' }),
  ];

  it('counts total / textable / withAccounts / onPaper', () => {
    expect(vitals(roster)).toEqual({
      total: 8,
      textable: 6,
      withAccounts: 4,
      onPaper: 2,
    });
  });

  it("counts only 'granted' as textable — an invite is not a rail", () => {
    expect(vitals([row({ sms_consent_status: 'pending' })]).textable).toBe(0);
  });

  it('renders the sheet vitals line', () => {
    const sixteen = [
      ...roster,
      ...Array.from({ length: 8 }, () => row({ profile_id: null })),
    ];
    expect(vitalsLine(sixteen)).toBe(
      '16 ON THE JOB · 6 REACHABLE BY TEXT · 4 WITH ACCOUNTS',
    );
  });

  it('renders all three counts at zero rather than going quiet', () => {
    expect(vitalsLine([])).toBe(
      '0 ON THE JOB · 0 REACHABLE BY TEXT · 0 WITH ACCOUNTS',
    );
  });

  it('counts the synthetic client in the total and in WITH ACCOUNTS', () => {
    const shown = flattenRoster(
      groupRoster([row({ profile_id: 'p-1', sms_consent_status: 'granted' })], {
        name: 'Margaret Ellsworth',
        profileId: 'client-profile-1',
      }),
    );
    expect(vitals(shown)).toEqual({
      total: 2,
      textable: 1,
      withAccounts: 2,
      onPaper: 0,
    });
  });

  it('never counts the synthetic client as textable — there is no consent ledger', () => {
    // Even if something upstream handed the row a granted consent, a client
    // has no project_parties row and therefore no SMS rail.
    const synthetic = {
      ...syntheticClientRow({ name: 'Margaret Ellsworth' })!,
      sms_consent_status: 'granted',
    };
    expect(vitals([synthetic]).textable).toBe(0);
    expect(vitals([synthetic]).total).toBe(1);
    expect(vitals([synthetic]).onPaper).toBe(1);
  });

  it('renders the instrument suffix only when someone is on paper', () => {
    expect(vitalsInstrumentSuffix(roster)).toBe('· 2 ON PAPER');
    expect(vitalsInstrumentSuffix([row({ profile_id: 'p-1' })])).toBe('');
    expect(vitalsInstrumentSuffix([])).toBe('');
  });
});

describe('kickoffRetired — the band stops asking at four names', () => {
  it.each([
    [0, false],
    [1, false],
    [3, false],
    [4, true],
    [9, true],
  ])('%i rows → %s', (count, expected) => {
    expect(kickoffRetired(Array.from({ length: count }, () => row()))).toBe(
      expected,
    );
  });
});
