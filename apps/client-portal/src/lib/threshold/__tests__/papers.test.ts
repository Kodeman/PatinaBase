import type { ClientPlanSheet, ProjectDocument } from '@patina/supabase';

import type { ClientDocument } from '@/hooks/use-documents-client';

import {
  documentKindLabel,
  groupClientPlanSet,
  isExecutedInstrument,
  looseDocuments,
  paperKindLabel,
  papersForProject,
  PAPERS_TAB_LABEL,
  visibleDocuments,
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


function filed(overrides: Partial<ClientDocument> = {}): ClientDocument {
  return {
    id: 'file-1',
    project_id: 'project-1',
    proposal_id: null,
    title: 'Signed design agreement',
    doc_type: 'pdf',
    category: null,
    section_key: null,
    storage_path: 'folio/agreement.pdf',
    size_bytes: 4096,
    client_visible: true,
    created_at: '2026-06-19T10:00:00Z',
    ...overrides,
  };
}

describe('the studio\u2019s filed papers', () => {
  it('keeps only the client-visible rows', () => {
    expect(
      visibleDocuments([filed(), filed({ id: 'file-2', client_visible: false })]),
    ).toHaveLength(1);
  });

  it('leaves the plan-room rows to the drawing set', () => {
    expect(
      looseDocuments([filed(), filed({ id: 'file-2', section_key: 'plan-room' })]).map(
        (doc) => doc.id,
      ),
    ).toEqual(['file-1']);
  });

  it('prefers the semantic category, and falls back to the file format', () => {
    expect(documentKindLabel({ category: 'site_photo', doc_type: 'png' })).toBe('Site Photo');
    expect(documentKindLabel({ category: '  ', doc_type: 'xlsx' })).toBe('XLSX');
    expect(documentKindLabel({ category: null, doc_type: 'heic' })).toBe('HEIC');
  });

  it('files this house\u2019s papers newest first, plan-room rows excluded', () => {
    const { papers } = papersForProject(
      [
        filed({ id: 'old', created_at: '2026-05-01T00:00:00Z' }),
        filed({ id: 'new', created_at: '2026-07-01T00:00:00Z' }),
        filed({ id: 'drawing', section_key: 'plan-room' }),
        filed({ id: 'hidden', client_visible: false }),
        filed({ id: 'elsewhere', project_id: 'project-2' }),
      ],
      'project-1',
    );

    expect(papers.map((doc) => doc.id)).toEqual(['new', 'old']);
  });

  it('folds a proposal-anchored row into the house that proposal became', () => {
    const { papers, earlier } = papersForProject(
      [filed({ id: 'anchored', project_id: null, proposal_id: 'prop-1' })],
      'project-1',
      { 'prop-1': 'project-1' },
    );

    expect(papers.map((doc) => doc.id)).toEqual(['anchored']);
    expect(earlier).toEqual([]);
  });

  it('keeps a row no house can claim rather than losing it', () => {
    const { papers, earlier } = papersForProject(
      [filed({ id: 'unactivated', project_id: null, proposal_id: 'prop-9' })],
      'project-1',
      { 'prop-9': null },
    );

    expect(papers).toEqual([]);
    expect(earlier.map((doc) => doc.id)).toEqual(['unactivated']);
  });
});
