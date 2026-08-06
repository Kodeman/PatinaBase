/**
 * The Plan Room's pure model.
 *
 * The holder/log/changed cases are built on the Current Set deck's canonical
 * fixture (docs/design/the-current-set/README.md — the Whitlock residence): its
 * ten events, verbatim, and the holder lines the deck claims they produce. If
 * the derivation ever drifts, the deck's amber band ("Boone Millwork holds
 * Rev B") stops being true, which is the whole wound this room closes.
 */

import type { PlanRoomBundle } from '@patina/supabase';
import {
  changedSinceLastIssue,
  confirmSummary,
  deriveCurrentSet,
  deriveDrawingLog,
  deriveHolders,
  guessSheetTitle,
  nearMissMatch,
  normalizeSheetNumber,
  normalizeTextLayer,
  planFileEntries,
  previewRevLetter,
  proposeMatches,
  scoreSheetNumberCandidates,
  SHEET_NUMBER_RE,
  type LightTableProposal,
  type StagedPage,
  type TextItemLite,
} from '../model';

// ── Parsing ─────────────────────────────────────────────────────────────────

describe('sheet numbers', () => {
  it('parses the shapes a drawing actually writes', () => {
    expect(normalizeSheetNumber('ID-401')).toBe('ID-401');
    expect(normalizeSheetNumber('A-101')).toBe('A-101');
    expect(normalizeSheetNumber('ID 401')).toBe('ID-401');
    expect(normalizeSheetNumber('EL-1.02')).toBe('EL-1.02');
    expect(normalizeSheetNumber('id401')).toBe('ID-401');
    expect(normalizeSheetNumber('  ID-501  ')).toBe('ID-501');
  });

  it('refuses what is not a sheet number', () => {
    expect(normalizeSheetNumber('')).toBeNull();
    expect(normalizeSheetNumber(null)).toBeNull();
    expect(normalizeSheetNumber('Millwork Elevations')).toBeNull();
    expect(normalizeSheetNumber('34 1/2"')).toBeNull();
  });

  it('exports the regex the scanner and the title stripper share', () => {
    expect(SHEET_NUMBER_RE.test('ID-401')).toBe(true);
    expect(SHEET_NUMBER_RE.test('nothing here')).toBe(false);
  });
});

describe('scoreSheetNumberCandidates', () => {
  it('lets the title block beat a number set in the body', () => {
    const items: TextItemLite[] = [
      { str: 'see ID-101 for the plan', x: 0.2, y: 0.3 },
      { str: 'ID-401', x: 0.85, y: 0.9 },
    ];
    expect(scoreSheetNumberCandidates(items)).toBe('ID-401');
  });

  it('reads the number out of a full title-block run', () => {
    const items: TextItemLite[] = [
      { str: 'ID-401 Millwork Elevations — Study', x: 0.78, y: 0.92 },
    ];
    expect(scoreSheetNumberCandidates(items)).toBe('ID-401');
  });

  it('says nothing when the page carries no number', () => {
    expect(
      scoreSheetNumberCandidates([{ str: 'General Notes', x: 0.5, y: 0.5 }]),
    ).toBeNull();
    expect(scoreSheetNumberCandidates([])).toBeNull();
  });

  it('does not read a title block’s prose as a sheet number', () => {
    expect(
      scoreSheetNumberCandidates([{ str: 'Sheet 1 of 7', x: 0.85, y: 0.95 }]),
    ).toBeNull();
  });
});

describe('nearMissMatch', () => {
  it('catches a letter O read as a zero', () => {
    expect(nearMissMatch('ID-4O2', ['ID-401', 'ID-402'])).toEqual({
      canonical: 'ID-402',
    });
  });

  it('catches an I read as a one', () => {
    expect(nearMissMatch('ID-4I1', ['ID-411'])).toEqual({ canonical: 'ID-411' });
  });

  it('never guesses across a real difference', () => {
    expect(nearMissMatch('ID-403', ['ID-402'])).toBeNull();
    expect(nearMissMatch('ID-4O3', ['ID-402'])).toBeNull();
    expect(nearMissMatch('ID-401', ['ID-401'])).toBeNull();
    expect(nearMissMatch(null, ['ID-402'])).toBeNull();
  });
});

describe('guessSheetTitle', () => {
  it('strips the number off the run that carried it', () => {
    const items: TextItemLite[] = [
      { str: 'ID-401 Millwork Elevations — Study', x: 0.78, y: 0.92 },
    ];
    expect(guessSheetTitle(items, 'ID-401')).toBe('Millwork Elevations — Study');
  });

  it('falls to the nearest wordy run when the number stands alone', () => {
    const items: TextItemLite[] = [
      { str: 'ID-501', x: 0.85, y: 0.92 },
      { str: 'Millwork Details — Study Shelving', x: 0.84, y: 0.88 },
      { str: 'Adair Studio', x: 0.1, y: 0.1 },
    ];
    expect(guessSheetTitle(items, 'ID-501')).toBe(
      'Millwork Details — Study Shelving',
    );
  });
});

describe('normalizeTextLayer', () => {
  it('folds case and whitespace so two plots of one drawing hash alike', () => {
    expect(normalizeTextLayer('  ID-401   Millwork \n Elevations ')).toBe(
      'ID-401 MILLWORK ELEVATIONS',
    );
  });
});

// ── Proposals ───────────────────────────────────────────────────────────────

const page = (
  pageIndex: number,
  str: string,
  textSha256: string | null = null,
): StagedPage => ({
  pageIndex,
  items: [{ str, x: 0.8, y: 0.92 }],
  text: str,
  textSha256,
});

const KNOWN = [
  { id: 's401', sheet_number: 'ID-401', title: 'Millwork Elevations — Study' },
  { id: 's402', sheet_number: 'ID-402', title: 'Millwork Elevations — Banquette' },
];

describe('proposeMatches', () => {
  it('confirms a page whose text layer is byte-for-byte the filed print', () => {
    const [proposal] = proposeMatches([page(0, 'ID-401 Study', 'sha-401')], KNOWN, {
      s401: 'sha-401',
    });
    expect(proposal.kind).toBe('confirm_current');
    expect(proposal.sheetId).toBe('s401');
    expect(proposal.requiresFork).toBe(false);
  });

  it('errs toward a revision when the number matches and the text differs', () => {
    const [proposal] = proposeMatches([page(0, 'ID-401 Study', 'sha-new')], KNOWN, {
      s401: 'sha-401',
    });
    expect(proposal.kind).toBe('revision');
    expect(proposal.sheetId).toBe('s401');
    expect(proposal.requiresFork).toBe(false);
  });

  it('errs toward a revision on a near miss, and leaves the fork open', () => {
    const [proposal] = proposeMatches([page(0, 'ID-4O2 Banquette', 'x')], KNOWN, {});
    expect(proposal.kind).toBe('revision');
    expect(proposal.sheetId).toBe('s402');
    expect(proposal.nearMiss).toEqual({ parsed: 'ID-4O2', canonical: 'ID-402' });
    expect(proposal.requiresFork).toBe(true);
    expect(proposal.fork).toBeNull();
  });

  it('proposes a new sheet for a number the room has never held', () => {
    const [proposal] = proposeMatches([page(0, 'ID-501 Details', 'x')], KNOWN, {});
    expect(proposal.kind).toBe('new_sheet');
    expect(proposal.sheetNumber).toBe('ID-501');
    expect(proposal.sheetTitle).toBe('Details');
    expect(proposal.discipline).toBe('ID');
    expect(proposal.requiresFork).toBe(false);
  });

  it('leaves a page with no number unmatched rather than guessing', () => {
    const [proposal] = proposeMatches([page(0, 'General Notes', 'x')], KNOWN, {});
    expect(proposal.kind).toBe('unmatched');
    expect(proposal.sheetId).toBeNull();
    expect(proposal.sheetNumber).toBeNull();
  });
});

describe('previewRevLetter', () => {
  it('starts at A and never reads a letter off a filename', () => {
    expect(previewRevLetter(null)).toBe('A');
    expect(previewRevLetter('')).toBe('A');
    expect(previewRevLetter('_FINAL2')).toBe('A');
  });

  it('walks the alphabet and doubles past Z', () => {
    expect(previewRevLetter('A')).toBe('B');
    expect(previewRevLetter('B')).toBe('C');
    expect(previewRevLetter('Z')).toBe('AA');
    expect(previewRevLetter('AA')).toBe('AB');
    expect(previewRevLetter('AZ')).toBe('BA');
  });
});

const proposal = (
  over: Partial<LightTableProposal> & Pick<LightTableProposal, 'pageIndex' | 'kind'>,
): LightTableProposal => ({
  parsedNumber: null,
  textSha256: null,
  sheetId: null,
  sheetNumber: null,
  sheetTitle: null,
  discipline: null,
  nearMiss: null,
  fork: null,
  requiresFork: false,
  ...over,
});

describe('confirmSummary', () => {
  it('states the 1 Aug filing exactly as the deck does', () => {
    const proposals: LightTableProposal[] = [
      proposal({ pageIndex: 0, kind: 'revision', sheetId: 's401', fork: 'revision' }),
      proposal({ pageIndex: 1, kind: 'revision', sheetId: 's501', fork: 'revision' }),
      proposal({ pageIndex: 2, kind: 'confirm_current', sheetId: 's001', fork: 'confirm_current' }),
      proposal({ pageIndex: 3, kind: 'confirm_current', sheetId: 's101', fork: 'confirm_current' }),
      proposal({ pageIndex: 4, kind: 'confirm_current', sheetId: 's301', fork: 'confirm_current' }),
      proposal({ pageIndex: 5, kind: 'confirm_current', sheetId: 's402', fork: 'confirm_current' }),
    ];
    const summary = confirmSummary(proposals);
    expect(summary.sentence).toBe(
      'File 6 sheets · 2 pointers move · 4 confirmed current · one transaction',
    );
    expect(summary.fileCount).toBe(6);
    expect(summary.ready).toBe(true);
  });

  it('shuts the gate while any card still asks a question', () => {
    const summary = confirmSummary([
      proposal({
        pageIndex: 0,
        kind: 'revision',
        sheetId: 's402',
        requiresFork: true,
        nearMiss: { parsed: 'ID-4O2', canonical: 'ID-402' },
      }),
    ]);
    expect(summary.ready).toBe(false);
  });

  it('shuts the gate on a new sheet with no number', () => {
    const summary = confirmSummary([
      proposal({ pageIndex: 0, kind: 'new_sheet', fork: 'new_sheet' }),
    ]);
    expect(summary.ready).toBe(false);
  });

  it('counts loose pages without filing them', () => {
    const summary = confirmSummary([
      proposal({
        pageIndex: 0,
        kind: 'new_sheet',
        sheetNumber: 'ID-401',
        fork: 'new_sheet',
      }),
      proposal({ pageIndex: 1, kind: 'unmatched' }),
    ]);
    expect(summary.sentence).toBe(
      'File 1 sheet · 1 new sheet · 1 loose page · one transaction',
    );
    expect(summary.looseCount).toBe(1);
  });
});

describe('planFileEntries', () => {
  const upload = {
    storage_path: 'p/plans/k/0-ID-401.pdf',
    sha256: 'a'.repeat(64),
    text_sha256: 'b'.repeat(64),
    size_bytes: 10,
    page_index: 0,
    source_filename: 'Whitlock.pdf',
    doc_type: 'pdf',
  };

  it('builds one entry per resolved card and skips loose pages', () => {
    const entries = planFileEntries(
      [
        proposal({
          pageIndex: 0,
          kind: 'new_sheet',
          sheetNumber: 'ID-401',
          sheetTitle: 'Millwork Elevations — Study',
          discipline: 'ID',
          fork: 'new_sheet',
        }),
        proposal({ pageIndex: 1, kind: 'revision', sheetId: 's402', fork: 'revision' }),
        proposal({
          pageIndex: 2,
          kind: 'confirm_current',
          sheetId: 's001',
          fork: 'confirm_current',
        }),
        proposal({ pageIndex: 3, kind: 'unmatched' }),
      ],
      { 0: upload, 1: { ...upload, storage_path: 'p/plans/k/1-ID-402.pdf' } },
    );

    expect(entries).toEqual([
      {
        kind: 'new_sheet',
        sheet: {
          number: 'ID-401',
          title: 'Millwork Elevations — Study',
          discipline: 'ID',
        },
        print: upload,
      },
      {
        kind: 'revision',
        sheet_id: 's402',
        print: { ...upload, storage_path: 'p/plans/k/1-ID-402.pdf' },
      },
      { kind: 'confirm_current', sheet_id: 's001' },
    ]);
  });

  it('writes nothing for a card whose fork is still open', () => {
    const entries = planFileEntries(
      [
        proposal({
          pageIndex: 0,
          kind: 'revision',
          sheetId: 's402',
          requiresFork: true,
        }),
      ],
      { 0: upload },
    );
    expect(entries).toEqual([]);
  });
});

// ── The Whitlock fixture (docs/design/the-current-set/README.md) ─────────────

const SHEETS = [
  { id: 's001', number: 'ID-001', title: 'Cover & Sheet Index', rev: 'B' },
  { id: 's101', number: 'ID-101', title: 'Furniture Plan — Main Floor', rev: 'B' },
  { id: 's201', number: 'ID-201', title: 'Reflected Ceiling Plan — Main Floor', rev: 'A' },
  { id: 's301', number: 'ID-301', title: 'Finish Plan — Main Floor', rev: 'B' },
  { id: 's401', number: 'ID-401', title: 'Millwork Elevations — Study', rev: 'C' },
  { id: 's402', number: 'ID-402', title: 'Millwork Elevations — Banquette', rev: 'B' },
  { id: 's501', number: 'ID-501', title: 'Millwork Details — Study Shelving', rev: 'C' },
];

/** The revision each sheet stood at after each of the three filings. */
const REV_AT_22_JUL: Record<string, string> = {
  s001: 'B',
  s101: 'B',
  s201: 'A',
  s301: 'B',
  s401: 'B',
  s402: 'B',
  s501: 'B',
};

const sha = (sheetId: string, rev: string) => `${rev.toLowerCase()}-${sheetId}`;

function whitlock(): PlanRoomBundle {
  const prints: PlanRoomBundle['prints'] = [];
  const push = (
    sheetId: string,
    rev: string,
    printNumber: number,
    batchId: string,
    createdAt: string,
  ) =>
    prints.push({
      id: `p-${sheetId}-${rev}`,
      batch_id: batchId,
      sheet_id: sheetId,
      project_document_id: `d-${sheetId}-${rev}`,
      print_number: printNumber,
      rev_letter: rev,
      sha256: sha(sheetId, rev),
      text_sha256: `t-${sheetId}-${rev}`,
      source: 'upload',
      source_filename: 'Whitlock.pdf',
      page_index: 0,
      created_at: createdAt,
      created_by: null,
    });

  // 8 Jul — 7 prints filed at Rev A.
  for (const sheet of SHEETS) push(sheet.id, 'A', 1, 'b1', '2026-07-08T09:00:00Z');
  // 22 Jul — 6 prints filed at Rev B; ID-201 is unchanged and never revises.
  for (const sheet of SHEETS.filter((s) => s.id !== 's201'))
    push(sheet.id, 'B', 2, 'b2', '2026-07-22T09:00:00Z');
  // 1 Aug — ID-401 and ID-501 flip to Rev C; the other four are confirmed current.
  push('s401', 'C', 3, 'b3', '2026-08-01T09:00:00Z');
  push('s501', 'C', 3, 'b3', '2026-08-01T09:00:00Z');

  const sheets: PlanRoomBundle['sheets'] = SHEETS.map((sheet, index) => ({
    id: sheet.id,
    project_id: 'proj',
    sheet_number: sheet.number,
    title: sheet.title,
    discipline: 'ID',
    state: 'draft',
    current_print_id: `p-${sheet.id}-${sheet.rev}`,
    current_print_number: sheet.rev === 'C' ? 3 : sheet.rev === 'B' ? 2 : 1,
    sort_order: index,
    created_at: '2026-07-08T09:00:00Z',
    updated_at: '2026-08-01T09:00:00Z',
    created_by: null,
  }));

  const issuePrint = (
    issueId: string,
    sheetId: string,
    rev: string,
  ): PlanRoomBundle['issuePrints'][number] => {
    const sheet = SHEETS.find((entry) => entry.id === sheetId)!;
    return {
      id: `ip-${issueId}-${sheetId}`,
      issue_id: issueId,
      print_id: `p-${sheetId}-${rev}`,
      sheet_id: sheetId,
      sheet_number: sheet.number,
      sheet_title: sheet.title,
      rev_letter: rev,
      sha256: sha(sheetId, rev),
      created_at: '2026-07-08T10:00:00Z',
    };
  };

  return {
    sheets,
    prints,
    batches: [
      {
        id: 'b1',
        project_id: 'proj',
        idempotency_key: 'k1',
        request_hash: 'h1',
        item_count: 7,
        created_sheet_ids: SHEETS.map((s) => s.id),
        flipped_sheet_ids: [],
        confirmed_sheet_ids: [],
        source_filename: 'Whitlock_Pricing.pdf',
        created_at: '2026-07-08T09:00:00Z',
        created_by: null,
      },
      {
        id: 'b2',
        project_id: 'proj',
        idempotency_key: 'k2',
        request_hash: 'h2',
        item_count: 6,
        created_sheet_ids: [],
        flipped_sheet_ids: SHEETS.filter((s) => s.id !== 's201').map((s) => s.id),
        confirmed_sheet_ids: [],
        source_filename: 'Whitlock_Production.pdf',
        created_at: '2026-07-22T09:00:00Z',
        created_by: null,
      },
      {
        id: 'b3',
        project_id: 'proj',
        idempotency_key: 'k3',
        request_hash: 'h3',
        item_count: 6,
        created_sheet_ids: [],
        flipped_sheet_ids: ['s401', 's501'],
        confirmed_sheet_ids: ['s001', 's101', 's301', 's402'],
        source_filename: 'Whitlock_FINAL2.pdf',
        created_at: '2026-08-01T09:00:00Z',
        created_by: null,
      },
    ],
    issues: [
      {
        id: 'i1',
        project_id: 'proj',
        issue_number: 1,
        name: 'Pricing Set — 8 Jul 2026',
        idempotency_key: 'ik1',
        request_hash: 'ih1',
        issued_at: '2026-07-08T10:00:00Z',
        set_checksum: 'c1',
        sheet_count: 7,
        prior_issue_id: null,
        created_at: '2026-07-08T10:00:00Z',
        created_by: null,
      },
      {
        id: 'i2',
        project_id: 'proj',
        issue_number: 2,
        name: 'Production Set — 22 Jul 2026',
        idempotency_key: 'ik2',
        request_hash: 'ih2',
        issued_at: '2026-07-22T10:00:00Z',
        set_checksum: 'c2',
        sheet_count: 7,
        prior_issue_id: 'i1',
        created_at: '2026-07-22T10:00:00Z',
        created_by: null,
      },
    ],
    issuePrints: [
      ...SHEETS.map((sheet) => issuePrint('i1', sheet.id, 'A')),
      ...SHEETS.map((sheet) => issuePrint('i2', sheet.id, REV_AT_22_JUL[sheet.id])),
    ],
    transmittals: [
      {
        id: 't1',
        project_id: 'proj',
        issue_id: 'i1',
        party_id: null,
        party_display_name: 'Boone Millwork',
        party_company: 'Boone Millwork',
        party_email: null,
        purpose: 'pricing',
        message: null,
        sent_at: '2026-07-08T11:00:00Z',
        created_at: '2026-07-08T11:00:00Z',
        created_by: null,
      },
      {
        id: 't2',
        project_id: 'proj',
        issue_id: 'i1',
        party_id: null,
        party_display_name: 'Fenn Metalworks',
        party_company: 'Fenn Metalworks',
        party_email: null,
        purpose: 'pricing',
        message: null,
        sent_at: '2026-07-08T11:00:00Z',
        created_at: '2026-07-08T11:00:00Z',
        created_by: null,
      },
      {
        id: 't3',
        project_id: 'proj',
        issue_id: 'i1',
        party_id: null,
        party_display_name: 'Lindqvist Upholstery',
        party_company: 'Lindqvist Upholstery',
        party_email: null,
        purpose: 'pricing',
        message: null,
        sent_at: '2026-07-08T11:00:00Z',
        created_at: '2026-07-08T11:00:00Z',
        created_by: null,
      },
      {
        id: 't4',
        project_id: 'proj',
        issue_id: 'i2',
        party_id: null,
        party_display_name: 'Boone Millwork',
        party_company: 'Boone Millwork',
        party_email: null,
        purpose: 'production',
        message: null,
        sent_at: '2026-07-22T11:00:00Z',
        created_at: '2026-07-22T11:00:00Z',
        created_by: null,
      },
      {
        id: 't5',
        project_id: 'proj',
        issue_id: 'i2',
        party_id: null,
        party_display_name: 'Merrill Bros. Construction',
        party_company: 'Merrill Bros. Construction',
        party_email: null,
        purpose: 'information',
        message: null,
        sent_at: '2026-07-22T11:00:00Z',
        created_at: '2026-07-22T11:00:00Z',
        created_by: null,
      },
    ],
    tokens: [],
  };
}

describe('the Whitlock fixture', () => {
  const bundle = whitlock();

  it('reads the current set the deck states', () => {
    expect(
      deriveCurrentSet(bundle).map((row) => `${row.sheetNumber} ${row.revLetter}`),
    ).toEqual([
      'ID-001 B',
      'ID-101 B',
      'ID-201 A',
      'ID-301 B',
      'ID-401 C',
      'ID-402 B',
      'ID-501 C',
    ]);
  });

  it('reproduces every holder line off the transmittals alone', () => {
    const holders = deriveHolders(bundle);
    expect(holders.map((holder) => holder.partyDisplayName)).toEqual([
      'Boone Millwork',
      'Fenn Metalworks',
      'Lindqvist Upholstery',
      'Merrill Bros. Construction',
    ]);

    // Boone and Merrill were last sent the 22 Jul Production Set: they hold
    // Rev B and are behind on the two sheets that flipped to C on 1 Aug.
    for (const name of ['Boone Millwork', 'Merrill Bros. Construction']) {
      const holder = holders.find((entry) => entry.partyDisplayName === name)!;
      expect(holder.issueName).toBe('Production Set — 22 Jul 2026');
      expect(holder.behindCount).toBe(2);
      expect(holder.behindNumbers).toEqual(['ID-401', 'ID-501']);
      expect(holder.behindRev).toBe('B');
      expect(holder.currentRev).toBe('C');
      // ID-201 never revised, so nobody is ever behind on it.
      expect(
        holder.holds.find((sheet) => sheet.sheetNumber === 'ID-201'),
      ).toMatchObject({ heldRev: 'A', currentRev: 'A', behind: false });
    }

    // Fenn and Lindqvist were last sent the 8 Jul Pricing Set: they hold Rev A
    // on everything, and are behind on all six sheets that ever revised.
    for (const name of ['Fenn Metalworks', 'Lindqvist Upholstery']) {
      const holder = holders.find((entry) => entry.partyDisplayName === name)!;
      expect(holder.issueName).toBe('Pricing Set — 8 Jul 2026');
      expect(holder.purpose).toBe('pricing');
      expect(holder.behindCount).toBe(6);
      expect(holder.behindNumbers).toEqual([
        'ID-001',
        'ID-101',
        'ID-301',
        'ID-401',
        'ID-402',
        'ID-501',
      ]);
      expect(holder.behindRev).toBe('A');
    }
  });

  it('logs the ten events oldest first, counting the 1 Aug filing the deck’s way', () => {
    const log = deriveDrawingLog(bundle);
    expect(log.map((row) => row.event)).toEqual([
      'filed',
      'issued',
      'transmitted',
      'transmitted',
      'transmitted',
      'filed',
      'flipped',
      'issued',
      'transmitted',
      'transmitted',
      'filed',
      'flipped',
    ]);
    expect(log.map((row) => row.at)).toEqual(
      [...log.map((row) => row.at)].sort((a, b) => a.localeCompare(b)),
    );

    const augustFiling = log.find((row) => row.key === 'filed:b3')!;
    expect(augustFiling.what).toContain('2 new prints, 4 confirmed current');
    const augustFlip = log.find((row) => row.key === 'flipped:b3')!;
    expect(augustFlip.what).toBe('ID-401, ID-501 flipped to Rev C');

    const transmittal = log.find((row) => row.key === 'transmitted:t4')!;
    expect(transmittal.what).toBe(
      'Production Set — 22 Jul 2026 · for production · not opened yet',
    );
    expect(transmittal.who).toBe('Boone Millwork · Boone Millwork');
  });

  it('marks exactly ID-401 and ID-501 as changed since the last issue', () => {
    const changed = changedSinceLastIssue(bundle);
    expect([...changed].sort()).toEqual(['s401', 's501']);
  });

  it('marks nothing when the room has never issued', () => {
    expect(changedSinceLastIssue({ ...bundle, issues: [], issuePrints: [] }).size).toBe(0);
  });
});
