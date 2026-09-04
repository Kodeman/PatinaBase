/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { ClientPlanSheet } from '@patina/supabase';

import type { ClientDocument } from '@/hooks/use-documents-client';
import {
  documentKindLabel as oldDocumentKindLabel,
  groupClientPlanSet as oldGroupClientPlanSet,
  looseDocuments as oldLooseDocuments,
  visibleDocuments as oldVisibleDocuments,
} from '@/app/documents/group';

import {
  documentKindLabel,
  groupClientPlanSet,
  looseDocuments,
  visibleDocuments,
} from '../papers';

// ── The drift guard ─────────────────────────────────────────────────────────
// lib/threshold/papers.ts is a COPY of the Documents hub's register, and
// room-capture.tsx / use-my-designers.ts copy the /scans acts. While the old
// files still stand, hold the copies to them: behaviour against group.ts, and
// every carried string read off disk. When a source changes this fails and the
// copy is updated FROM the source — never the other way round. The retirement
// plan deletes these sources; it deletes this guard with them.

const SRC = join(__dirname, '..', '..', '..');
const DOCUMENTS_PAGE = readFileSync(join(SRC, 'app/documents/page.tsx'), 'utf8');
const SHARE_DIALOG = readFileSync(join(SRC, 'components/scans/ShareScanDialog.tsx'), 'utf8');
const SHARE_STATUS = readFileSync(
  join(SRC, 'components/scans/RoomScanShareStatus.tsx'),
  'utf8',
);
const SCAN_VIEWER = readFileSync(
  join(SRC, 'components/scans/ClientRoomScanViewer.tsx'),
  'utf8',
);
const MY_DESIGNERS = readFileSync(join(SRC, 'hooks/use-my-designers.ts'), 'utf8');
const ROOM_CAPTURE = readFileSync(join(SRC, 'components/threshold/room-capture.tsx'), 'utf8');
const PAPERS_SHEET = readFileSync(join(SRC, 'components/threshold/papers-sheet.tsx'), 'utf8');

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

describe('the papers register is the hub’s, behaviour for behaviour', () => {
  const sheets = [
    sheet({ sheetId: 's1', discipline: 'interior_design' }),
    sheet({ sheetId: 's2', number: 'ID-201', discipline: '   ' }),
    sheet({ sheetId: 's3', number: '101', discipline: null }),
  ];

  it('groups the plan set exactly as group.ts groups it', () => {
    expect(groupClientPlanSet(sheets)).toEqual(oldGroupClientPlanSet(sheets));
  });

  const documents = [
    filed(),
    filed({ id: 'f2', client_visible: false }),
    filed({ id: 'f3', section_key: 'plan-room' }),
  ];

  it('filters the visible and the loose rows exactly as group.ts filters them', () => {
    expect(visibleDocuments(documents)).toEqual(oldVisibleDocuments(documents));
    expect(looseDocuments(documents)).toEqual(oldLooseDocuments(documents));
  });

  it.each([
    { category: 'site_photo', doc_type: 'png' },
    { category: null, doc_type: 'xlsx' },
    { category: null, doc_type: 'dwg' },
    { category: '  ', doc_type: 'heic' },
  ])('labels %o exactly as group.ts labels it', (doc) => {
    expect(documentKindLabel(doc)).toBe(oldDocumentKindLabel(doc));
  });
});

describe('the carried strings are the old surfaces’, verbatim', () => {
  it.each([
    ['Couldn’t open this file.', () => DOCUMENTS_PAGE],
    ['Couldn’t share. Please try again.', () => SHARE_DIALOG],
    ['Couldn’t revoke. Please try again.', () => SHARE_STATUS],
  ])('“%s” still stands in its source', (line, source) => {
    expect(source()).toContain(line.replace('’', '&rsquo;'));
  });

  it('the pending-model lines are the /scans viewer’s own', () => {
    for (const line of [
      '3D model not yet available.',
      'Your scan may still be processing. Check back shortly.',
    ]) {
      expect(SCAN_VIEWER).toContain(line);
      expect(ROOM_CAPTURE).toContain(line);
    }
  });
});

describe('the absorbed reads are the absorbed reads', () => {
  it('the share list is designer_clients for the signed-in client, as the dialog read it', () => {
    expect(SHARE_DIALOG).toContain("from('designer_clients')");
    expect(SHARE_DIALOG).toContain(".eq('client_id', user.id)");
    expect(MY_DESIGNERS).toContain("from('designer_clients')");
    expect(MY_DESIGNERS).toContain(".eq('client_id', user.id)");
    // The seat list is NOT the share list: it carries vendors, bookkeepers and
    // rotated-off leads, and share_room_scan does not check the target.
    expect(ROOM_CAPTURE).not.toContain('useProjectTeamMembers');
  });

  it('the share payload is the dialog’s payload', () => {
    // The plate's own payload is asserted key-for-key in room-capture.test.tsx;
    // this holds the shape the copy was taken from.
    expect(SHARE_DIALOG).toContain("{ scanId, designerId, accessLevel: 'full' }");
  });

  it('“Other papers” still reads the client-visible leg of project_documents', () => {
    expect(DOCUMENTS_PAGE).toContain('useClientDocuments');
    expect(PAPERS_SHEET).toContain('useClientDocuments');
  });
});
