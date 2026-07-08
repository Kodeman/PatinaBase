/**
 * Pure grouping/labeling logic for the client Documents hub — mirrors
 * ../../budget/__tests__/rollup.test.ts (pure functions, no hooks/mocks).
 */

import { visibleDocuments, groupDocumentsByProject, documentKindLabel } from '../group';
import type { ClientDocument } from '@/hooks/use-documents-client';

function makeDocument(overrides: Partial<ClientDocument> = {}): ClientDocument {
  return {
    id: 'doc-1',
    project_id: 'proj-1',
    title: 'Service Agreement.pdf',
    doc_type: 'pdf',
    category: null,
    storage_path: 'proj-1/123-service-agreement.pdf',
    size_bytes: 128000,
    client_visible: true,
    created_at: '2026-01-01T00:00:00Z',
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
