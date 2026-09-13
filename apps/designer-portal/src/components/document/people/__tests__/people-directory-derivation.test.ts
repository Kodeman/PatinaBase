/**
 * The Directory's pure read models (W2b) — one list of two entry types.
 *
 * These are the facts the row renders and decides nothing about: which chip an
 * entry falls under, whether a paper word is owed at all, what the head counts,
 * what the ask bar matches, and which two cards share a phone.
 */

import type { PeopleDirectoryRow } from '@patina/supabase';
import {
  DIRECTORY_DUPLICATE_SENTENCE,
  contactRuleBlocks,
  directoryBandOf,
  directoryChipAdmits,
  directoryDuplicatePairs,
  directoryEntryCounts,
  directoryEntryKind,
  directoryEntryMatches,
  directoryHeadLine,
  entryOwesPaperWord,
  entryPaperWord,
  firmIdentityLine,
  personIdentityLine,
  splitRoutedClause,
} from '@/lib/document/people-derivation';

function row(over: Partial<PeopleDirectoryRow> = {}): PeopleDirectoryRow {
  return {
    person_id: 'p1',
    role: 'contact',
    display_name: 'Dana Kowalski',
    email: 'dana@northgateelectric.com',
    phone: '(612) 555-0111',
    profile_id: null,
    project_id: null,
    designer_id: null,
    status_raw: 'active',
    last_touch_at: null,
    meta: {
      entity_kind: 'person',
      contact_kind: 'sub',
      company_name: 'Northgate Electric',
      company_id: 'firm-northgate',
      specialties: ['electrical'],
    },
    scope: 'studio',
    reach_state: 'field_link',
    consent_status: 'granted',
    paper_state: 'lapsed',
    contact_rule_summary: null,
    seat_count: 1,
    ...over,
  } as PeopleDirectoryRow;
}

describe('circles and squares', () => {
  it('tells a firm from a human by entity_kind, and counts CARDS not rows', () => {
    const rows = [
      row(),
      row({ person_id: 'p2', display_name: 'Tom Marrow' }),
      row({
        person_id: 'firm-northgate',
        display_name: 'Northgate Electric',
        meta: { entity_kind: 'company', contact_kind: 'sub' },
      }),
    ];
    expect(directoryEntryKind(rows[0])).toBe('person');
    expect(directoryEntryKind(rows[2])).toBe('firm');
    expect(directoryEntryCounts(rows)).toEqual({ people: 2, firms: 1 });
    expect(directoryHeadLine({ people: 29, firms: 22 })).toBe('29 people · 22 firms');
  });

  it('says one person and one firm in the singular', () => {
    expect(directoryHeadLine({ people: 1, firms: 1 })).toBe('1 person · 1 firm');
  });
});

describe('the six chips', () => {
  it('sorts a card into the band its kind names', () => {
    expect(directoryBandOf(row())).toBe('crew');
    expect(directoryBandOf(row({ meta: { contact_kind: 'client' } }))).toBe('clients');
    expect(directoryBandOf(row({ meta: { contact_kind: 'team' } }))).toBe('studio');
    expect(directoryBandOf(row({ meta: { contact_kind: 'vendor' } }))).toBe('makers');
    expect(
      directoryBandOf(row({ meta: { entity_kind: 'company', contact_kind: 'gc' } })),
    ).toBe('firms');
  });

  it('PR-g — a firm appears under Everyone and under the band of its crew', () => {
    const firm = row({
      person_id: 'firm-northgate',
      meta: { entity_kind: 'company', contact_kind: 'sub' },
    });
    expect(directoryChipAdmits('everyone', firm, 'crew')).toBe(true);
    expect(directoryChipAdmits('firms', firm, 'crew')).toBe(true);
    expect(directoryChipAdmits('crew', firm, 'crew')).toBe(true);
    expect(directoryChipAdmits('clients', firm, 'crew')).toBe(false);
  });

  it('a person never answers the Firms chip', () => {
    expect(directoryChipAdmits('firms', row())).toBe(false);
  });
});

describe('R-A — who owes the studio paper', () => {
  it.each(['lender', 'inspector'])('%s prints no paper word at all', (kind) => {
    const entry = row({ meta: { contact_kind: kind }, paper_state: 'not_on_file' });
    expect(entryOwesPaperWord(entry)).toBe(false);
    expect(entryPaperWord(entry)).toBeNull();
  });

  it('a sub prints the word the view reported', () => {
    expect(entryPaperWord(row())).toBe('lapsed');
  });
});

describe('the ask bar', () => {
  it('matches a name, a firm, a trade, an email and phone DIGITS', () => {
    const dana = row();
    expect(directoryEntryMatches(dana, 'kowalski')).toBe(true);
    expect(directoryEntryMatches(dana, 'northgate')).toBe(true);
    expect(directoryEntryMatches(dana, 'electrical')).toBe(true);
    expect(directoryEntryMatches(dana, 'dana@northgate')).toBe(true);
    expect(directoryEntryMatches(dana, '0111')).toBe(true);
  });

  it('needs four digits before a number is a number', () => {
    expect(directoryEntryMatches(row(), '011')).toBe(false);
  });

  it('an empty ask narrows nothing', () => {
    expect(directoryEntryMatches(row(), '   ')).toBe(true);
  });
});

describe('the row lines', () => {
  it('a person reads firm then trade', () => {
    expect(personIdentityLine(row())).toBe('Northgate Electric · electrical');
  });

  it('a firm counts its crew and its open jobs', () => {
    const firm = row({
      display_name: 'Marrow & Sons',
      meta: { entity_kind: 'company', contact_kind: 'gc' },
    });
    expect(firmIdentityLine(firm, { crew: 3, jobs: 2 })).toBe(
      'General Contractor · 3 on the crew · 2 open jobs',
    );
    expect(firmIdentityLine(firm, { crew: 1, jobs: 1 })).toContain('1 open job');
  });
});

describe('the rule clause', () => {
  it('only a forbidding rule takes the leading rule', () => {
    expect(contactRuleBlocks('Never text. Use: email.')).toBe(true);
    expect(contactRuleBlocks('Use: mobile. Hours: weekdays.')).toBe(false);
    expect(contactRuleBlocks(null)).toBe(false);
  });

  it('R-L — the routed clause is lifted out so it can carry a channel', () => {
    const { rest, routedName } = splitRoutedClause(
      'Never text. Write Rosa Delgado instead. Hours: weekdays.',
    );
    expect(routedName).toBe('Rosa Delgado');
    expect(rest).toBe('Never text. Hours: weekdays.');
  });

  it('leaves a rule with no route alone', () => {
    expect(splitRoutedClause('Never text.')).toEqual({
      rest: 'Never text.',
      routedName: null,
    });
  });
});

describe('the duplicate band', () => {
  it('names two cards that share a phone, and claims nothing more', () => {
    const pairs = directoryDuplicatePairs([
      row({ person_id: 'a', display_name: 'Adaeze Okonkwo', phone: '(612) 555-0104' }),
      row({ person_id: 'c', display_name: 'Chidi Okonkwo', phone: '6125550104' }),
      row({ person_id: 'd', display_name: 'Dana Kowalski' }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((p) => p.display_name)).toEqual([
      'Adaeze Okonkwo',
      'Chidi Okonkwo',
    ]);
    expect(DIRECTORY_DUPLICATE_SENTENCE).toBe('These two cards share a phone.');
  });

  it('never pairs two firms, and never pairs on a short number', () => {
    expect(
      directoryDuplicatePairs([
        row({ person_id: 'f1', phone: '555', meta: { entity_kind: 'company' } }),
        row({ person_id: 'f2', phone: '555', meta: { entity_kind: 'company' } }),
      ]),
    ).toHaveLength(0);
  });
});
