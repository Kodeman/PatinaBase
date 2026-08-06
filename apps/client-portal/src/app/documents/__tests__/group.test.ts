/**
 * Pure grouping/labeling logic for the client Documents hub — mirrors
 * ../../budget/__tests__/rollup.test.ts (pure functions, no hooks/mocks).
 */

import type { ClientPlanSheet } from '@patina/supabase';

import {
  visibleDocuments,
  groupDocumentsByProject,
  documentKindLabel,
  looseDocuments,
  groupClientPlanSet,
  EARLIER_PAPERS_GROUP_ID,
} from '../group';
import type { ClientDocument } from '@/hooks/use-documents-client';

function makeDocument(overrides: Partial<ClientDocument> = {}): ClientDocument {
  return {
    id: 'doc-1',
    project_id: 'proj-1',
    proposal_id: null,
    title: 'Service Agreement.pdf',
    doc_type: 'pdf',
    category: null,
    section_key: null,
    storage_path: 'proj-1/123-service-agreement.pdf',
    size_bytes: 128000,
    client_visible: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSheet(overrides: Partial<ClientPlanSheet> = {}): ClientPlanSheet {
  return {
    sheetId: 'sheet-1',
    projectId: 'proj-1',
    number: 'A-101',
    title: 'First Floor Plan',
    discipline: null,
    revLetter: 'B',
    revDate: '2026-07-30T00:00:00Z',
    projectDocumentId: 'doc-plan-1',
    storagePath: 'proj-1/plans/a-101.pdf',
    sizeBytes: 204800,
    ...overrides,
  };
}

describe('visibleDocuments', () => {
  it('keeps only documents flagged client_visible', () => {
    const documents = [
      makeDocument({ id: 'a', client_visible: true }),
      makeDocument({ id: 'b', client_visible: false }),
    ];

    expect(visibleDocuments(documents).map((d) => d.id)).toEqual(['a']);
  });

  it('returns an empty array when nothing is visible', () => {
    const documents = [makeDocument({ id: 'a', client_visible: false })];
    expect(visibleDocuments(documents)).toEqual([]);
  });
});

describe('groupDocumentsByProject', () => {
  const projects = [
    { id: 'proj-1', name: 'Lakeside Retreat' },
    { id: 'proj-2', name: 'Downtown Loft' },
  ];

  it('groups documents under their project, preserving project order', () => {
    const documents = [
      makeDocument({ id: 'a', project_id: 'proj-2' }),
      makeDocument({ id: 'b', project_id: 'proj-1' }),
    ];

    const groups = groupDocumentsByProject(documents, projects);

    expect(groups.map((g) => g.projectId)).toEqual(['proj-1', 'proj-2']);
    expect(groups[0].documents.map((d) => d.id)).toEqual(['b']);
    expect(groups[1].documents.map((d) => d.id)).toEqual(['a']);
  });

  it('omits projects with no visible documents', () => {
    const documents = [makeDocument({ id: 'a', project_id: 'proj-1' })];

    const groups = groupDocumentsByProject(documents, projects);

    expect(groups.map((g) => g.projectId)).toEqual(['proj-1']);
  });

  it('excludes documents that are not client_visible even if present in the input', () => {
    const documents = [
      makeDocument({ id: 'a', project_id: 'proj-1', client_visible: true }),
      makeDocument({ id: 'b', project_id: 'proj-1', client_visible: false }),
    ];

    const groups = groupDocumentsByProject(documents, projects);

    expect(groups[0].documents.map((d) => d.id)).toEqual(['a']);
  });

  it('sorts each project group newest-first by created_at', () => {
    const documents = [
      makeDocument({ id: 'older', project_id: 'proj-1', created_at: '2026-01-01T00:00:00Z' }),
      makeDocument({ id: 'newer', project_id: 'proj-1', created_at: '2026-03-01T00:00:00Z' }),
    ];

    const groups = groupDocumentsByProject(documents, projects);

    expect(groups[0].documents.map((d) => d.id)).toEqual(['newer', 'older']);
  });

  it('returns an empty array when there are no visible documents at all', () => {
    expect(groupDocumentsByProject([], projects)).toEqual([]);
  });

  it('folds a proposal-anchored row into its activated project via the map', () => {
    const documents = [
      makeDocument({ id: 'agreement', project_id: null, proposal_id: 'prop-1' }),
      makeDocument({ id: 'plain', project_id: 'proj-1' }),
    ];

    const groups = groupDocumentsByProject(documents, projects, {
      'prop-1': 'proj-1',
    });

    expect(groups.map((g) => g.projectId)).toEqual(['proj-1']);
    expect(groups[0].documents.map((d) => d.id).sort()).toEqual(['agreement', 'plain']);
  });

  it('sends a proposal-anchored row with no project to a trailing Earlier papers group', () => {
    const documents = [
      makeDocument({ id: 'plain', project_id: 'proj-1' }),
      makeDocument({ id: 'orphan', project_id: null, proposal_id: 'prop-unactivated' }),
    ];

    const groups = groupDocumentsByProject(documents, projects, {
      'prop-unactivated': null,
    });

    expect(groups.map((g) => g.projectId)).toEqual(['proj-1', EARLIER_PAPERS_GROUP_ID]);
    expect(groups[1].projectName).toBe('Earlier papers');
    expect(groups[1].documents.map((d) => d.id)).toEqual(['orphan']);
  });

  it('sends a proposal-anchored row missing from the map to Earlier papers too', () => {
    const documents = [
      makeDocument({ id: 'orphan', project_id: null, proposal_id: 'prop-unknown' }),
    ];

    const groups = groupDocumentsByProject(documents, projects, {});

    expect(groups.map((g) => g.projectId)).toEqual([EARLIER_PAPERS_GROUP_ID]);
  });

  it('never emits an Earlier papers group when every row has a home', () => {
    const documents = [makeDocument({ id: 'a', project_id: 'proj-1' })];

    const groups = groupDocumentsByProject(documents, projects, {});

    expect(groups.map((g) => g.projectId)).toEqual(['proj-1']);
  });
});

describe('looseDocuments', () => {
  it('excludes plan-room rows — those render as drawings, not papers', () => {
    const documents = [
      makeDocument({ id: 'paper', section_key: null }),
      makeDocument({ id: 'print', section_key: 'plan-room', category: 'drawing' }),
      makeDocument({ id: 'care', section_key: 'care' }),
    ];

    expect(looseDocuments(documents).map((d) => d.id)).toEqual(['paper', 'care']);
  });

  it('passes an empty list through', () => {
    expect(looseDocuments([])).toEqual([]);
  });
});

describe('groupClientPlanSet', () => {
  it('groups sheets by discipline with a title-cased heading', () => {
    const sheets = [
      makeSheet({ sheetId: 's1', number: 'A-101', discipline: 'architectural' }),
      makeSheet({ sheetId: 's2', number: 'A-102', discipline: 'architectural' }),
      makeSheet({ sheetId: 's3', number: 'E-201', discipline: 'electrical' }),
    ];

    const groups = groupClientPlanSet(sheets);

    expect(groups.map((g) => g.discipline)).toEqual(['Architectural', 'Electrical']);
    expect(groups[0].sheets.map((s) => s.sheetId)).toEqual(['s1', 's2']);
    expect(groups[1].sheets.map((s) => s.sheetId)).toEqual(['s3']);
  });

  it('falls back to the sheet-number prefix before the dash when discipline is null', () => {
    const sheets = [
      makeSheet({ sheetId: 's1', number: 'A-101', discipline: null }),
      makeSheet({ sheetId: 's2', number: 'ID-301', discipline: null }),
    ];

    const groups = groupClientPlanSet(sheets);

    expect(groups.map((g) => g.discipline)).toEqual(['A', 'ID']);
  });

  it('title-cases multi-word disciplines', () => {
    const sheets = [makeSheet({ discipline: 'interior design' })];

    expect(groupClientPlanSet(sheets)[0].discipline).toBe('Interior Design');
  });

  it('falls back to a generic Drawings heading when a number has no prefix', () => {
    const sheets = [makeSheet({ number: '101', discipline: null })];

    expect(groupClientPlanSet(sheets)[0].discipline).toBe('Drawings');
  });

  it('preserves the incoming (number-sorted) order within a group', () => {
    const sheets = [
      makeSheet({ sheetId: 's1', number: 'A-101' }),
      makeSheet({ sheetId: 's2', number: 'A-102' }),
    ];

    expect(groupClientPlanSet(sheets)[0].sheets.map((s) => s.sheetId)).toEqual([
      's1',
      's2',
    ]);
  });

  it('returns an empty array for an empty set', () => {
    expect(groupClientPlanSet([])).toEqual([]);
  });
});

describe('documentKindLabel', () => {
  it('humanizes a snake_case category when one is set', () => {
    expect(documentKindLabel({ category: 'scope_change', doc_type: 'pdf' })).toBe('Scope Change');
  });

  it('title-cases a single-word category', () => {
    expect(documentKindLabel({ category: 'contract', doc_type: 'pdf' })).toBe('Contract');
  });

  it('falls back to the file format label when category is null', () => {
    expect(documentKindLabel({ category: null, doc_type: 'pdf' })).toBe('PDF');
  });

  it('falls back to the file format label when category is an empty string', () => {
    expect(documentKindLabel({ category: '', doc_type: 'img' })).toBe('IMG');
  });

  it('uppercases an unmapped file format instead of dropping it', () => {
    expect(documentKindLabel({ category: null, doc_type: 'heic' })).toBe('HEIC');
  });
});
