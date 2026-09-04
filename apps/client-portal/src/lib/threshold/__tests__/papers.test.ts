import type { ClientPlanSheet, ProjectDocument } from '@patina/supabase';

import {
  groupClientPlanSet,
  isExecutedInstrument,
  paperKindLabel,
  PAPERS_TAB_LABEL,
} from '../papers';

function sheet(overrides: Partial<ClientPlanSheet> = {}): ClientPlanSheet {
  return {
    sheetId: 'sheet-1',
    projectId: 'project-1',
    number: 'A-101',
    title: 'Ground plan',
    discipline: null,
    revLetter: 'B',
    revDate: '2026-06-19',
    projectDocumentId: 'doc-1',
    storagePath: 'plans/a-101.pdf',
    sizeBytes: 1024,
    ...overrides,
  };
}

function paper(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    id: 'paper-1',
    kind: 'proposal',
    title: 'Furnishings authorization No. 7',
    signed_at: '2026-06-19',
    status: 'accepted',
    total_amount_cents: 912500,
    url: '/proposals/paper-1',
    ...overrides,
  };
}

describe('groupClientPlanSet — the drawing set, by discipline', () => {
  it('groups by the sheet discipline, title-cased', () => {
    const groups = groupClientPlanSet([
      sheet({ sheetId: 's1', discipline: 'interior_design' }),
      sheet({ sheetId: 's2', discipline: 'interior design', number: 'A-102' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.discipline).toBe('Interior Design');
    expect(groups[0]!.sheets.map((s) => s.sheetId)).toEqual(['s1', 's2']);
  });

  it('falls back to the letters before the dash in the sheet number', () => {
    const groups = groupClientPlanSet([
      sheet({ sheetId: 's1', number: 'A-101', discipline: null }),
      sheet({ sheetId: 's2', number: 'ID-201', discipline: '   ' }),
    ]);

    expect(groups.map((group) => group.discipline)).toEqual(['A', 'ID']);
  });

  it('files a sheet whose number encodes nothing under Drawings', () => {
    const groups = groupClientPlanSet([sheet({ number: '101', discipline: null })]);

    expect(groups[0]!.discipline).toBe('Drawings');
  });

  it('keeps the hook order inside a group and returns nothing for nothing', () => {
    expect(groupClientPlanSet([])).toEqual([]);
  });
});

describe('the papers, named', () => {
  it('puts a word in front of every kind', () => {
    expect(paperKindLabel('proposal')).toBe('Instrument');
    expect(paperKindLabel('scope_change')).toBe('Change request');
    expect(paperKindLabel('contract')).toBe('Contract');
    expect(paperKindLabel('other')).toBe('Paper');
  });

  it('reads a signed proposal as an executed instrument, and nothing else', () => {
    expect(isExecutedInstrument(paper())).toBe(true);
    expect(isExecutedInstrument(paper({ signed_at: null }))).toBe(false);
    expect(isExecutedInstrument(paper({ kind: 'scope_change' }))).toBe(false);
  });

  it('names the tab once, for the mat and the sheet both', () => {
    expect(PAPERS_TAB_LABEL).toBe('The papers, in full');
  });
});
