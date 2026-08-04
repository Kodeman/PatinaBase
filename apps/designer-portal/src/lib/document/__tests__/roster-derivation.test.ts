import type { ProjectRosterRow } from '@patina/supabase';
import {
  groupRoster,
  kickoffRetired,
  reachState,
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
