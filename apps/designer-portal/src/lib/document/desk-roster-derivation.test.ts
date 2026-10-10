import { pinnedProjectIdsFromRoster, type RosterLine } from './desk-roster-derivation';

function line(engagementId: string, custody: string, projectId?: string | null): RosterLine {
  return { engagementId, custody, projectId } as RosterLine;
}

describe('pinnedProjectIdsFromRoster', () => {
  it('keeps only the jobs holding her pen, in roster order', () => {
    expect(
      pinnedProjectIdsFromRoster([
        line('e1', 'Action with you', 'p1'),
        line('e2', 'With the client', 'p2'),
        line('e3', 'With Ada', 'p3'),
        line('e4', 'With the maker', 'p4'),
        line('e5', 'No current alert', 'p5'),
        line('e6', 'Action with you', 'p6'),
      ]),
    ).toEqual(['p1', 'p6']);
  });

  it('dedupes a project that stands on two lines', () => {
    expect(
      pinnedProjectIdsFromRoster([
        line('e1', 'Action with you', 'p2'),
        line('e2', 'Action with you', 'p1'),
        line('e3', 'Action with you', 'p2'),
      ]),
    ).toEqual(['p2', 'p1']);
  });

  it('skips a pen line with no project (a lead)', () => {
    expect(
      pinnedProjectIdsFromRoster([
        line('e1', 'Action with you', null),
        line('e2', 'Action with you'),
        line('e3', 'Action with you', 'p3'),
      ]),
    ).toEqual(['p3']);
  });

  it('returns nothing for an empty roster', () => {
    expect(pinnedProjectIdsFromRoster([])).toEqual([]);
  });
});
