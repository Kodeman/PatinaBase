import {
  EXPECTED_DOC_TYPES,
  UPLOAD_ONLY_DOC_TYPES,
  blockWords,
  blocksSentence,
  buildPaperworkRows,
  documentTitle,
  expiryRequired,
  formatPaperDate,
  isUploadOnly,
  joinWords,
  rowSentence,
  type PaperworkContext,
  type PaperworkDocument,
} from '../paperwork-model';

function doc(overrides: Partial<PaperworkDocument> = {}): PaperworkDocument {
  return {
    doc_type: 'coi_gl',
    doc_label: null,
    expires_on: '2027-04-03',
    blocks: ['site_access'],
    state: 'current',
    awaiting_check: false,
    ...overrides,
  };
}

function context(documents: PaperworkDocument[]): PaperworkContext {
  return {
    studio_name: 'Local Dev Studio',
    company_name: 'Twin Cities Drywall & Plaster',
    expires_at: '2026-10-15T19:03:15.870504+00:00',
    documents,
  };
}

describe('formatPaperDate', () => {
  it('speaks a date the way the studio does', () => {
    expect(formatPaperDate('2027-04-03')).toBe('3 April 2027');
    expect(formatPaperDate('2026-12-31T00:00:00Z')).toBe('31 December 2026');
  });

  it('returns null rather than guessing at an absent or unreadable date', () => {
    expect(formatPaperDate(null)).toBeNull();
    expect(formatPaperDate(undefined)).toBeNull();
    expect(formatPaperDate('not a date')).toBeNull();
    expect(formatPaperDate('2027-13-03')).toBeNull();
  });
});

describe('rowSentence, the two states spec \u00a73 gained', () => {
  it('prints the awaiting-check and refused sentences', () => {
    expect(rowSentence('awaiting_check', 'Licence', '2027-03-31')).toBe(
      'Licence, not yet checked.',
    );
    expect(rowSentence('refused', 'W-9', null)).toBe('W-9 was not accepted.');
  });
});

describe('joinWords', () => {
  it('joins one, two and three gates', () => {
    expect(joinWords([])).toBe('');
    expect(joinWords(['site access'])).toBe('site access');
    expect(joinWords(['site access', 'payment'])).toBe('site access and payment');
    expect(joinWords(['site access', 'payment', 'the draw'])).toBe(
      'site access, payment and the draw',
    );
  });
});

describe('documentTitle', () => {
  it('uses the studio vocabulary for a typed paper', () => {
    expect(documentTitle('coi_gl', null)).toBe('COI, general liability');
    expect(documentTitle('w9', null)).toBe('W-9');
    expect(documentTitle('license', null)).toBe('Licence');
  });

  it('calls an other_named paper what the studio called it', () => {
    expect(documentTitle('other_named', 'MN asbestos permit')).toBe(
      'MN asbestos permit',
    );
    expect(documentTitle('other_named', '   ')).toBe('Other');
    expect(documentTitle('other_named', null)).toBe('Other');
  });

  it('falls back to the raw type rather than printing nothing', () => {
    expect(documentTitle('something_new', null)).toBe('something_new');
  });
});

describe('blockWords / expiryRequired / isUploadOnly', () => {
  it('prints gates in the studio words', () => {
    expect(blockWords(['site_access', 'payment', 'draw'])).toEqual([
      'site access',
      'payment',
      'the draw',
    ]);
    expect(blockWords(null)).toEqual([]);
    expect(blockWords(['unmapped_gate'])).toEqual(['unmapped_gate']);
  });

  it('knows which papers 00623 refuses without an expiry', () => {
    expect(expiryRequired('coi_gl')).toBe(true);
    expect(expiryRequired('license')).toBe(true);
    expect(expiryRequired('bond')).toBe(true);
    expect(expiryRequired('w9')).toBe(false);
    expect(expiryRequired('lien_waiver_conditional')).toBe(false);
  });

  it('treats both waivers as upload only', () => {
    for (const type of UPLOAD_ONLY_DOC_TYPES) expect(isUploadOnly(type)).toBe(true);
    expect(isUploadOnly('coi_gl')).toBe(false);
  });
});

describe('rowSentence', () => {
  it('is the spec §3 copy table, verbatim', () => {
    expect(rowSentence('current', 'W-9', null)).toBe('W-9, current.');
    expect(rowSentence('lapses_soon', 'COI, general liability', '2026-10-01')).toBe(
      'COI, general liability, lapses 1 October 2026.',
    );
    expect(rowSentence('lapsed', 'Licence', '2026-03-31')).toBe(
      'Licence, lapsed 31 March 2026.',
    );
    expect(rowSentence('not_on_file', 'W-9', null)).toBe('W-9 is not on file.');
  });

  it('still says the word when the paper carries no readable date', () => {
    expect(rowSentence('lapsed', 'Licence', null)).toBe('Licence, lapsed.');
    expect(rowSentence('lapses_soon', 'Bond', null)).toBe('Bond, lapses soon.');
  });
});

describe('blocksSentence', () => {
  it('names the gates only where a lapse is actually holding something up', () => {
    expect(blocksSentence('lapsed', ['site_access', 'payment', 'draw'])).toBe(
      'Blocks site access, payment and the draw.',
    );
    expect(blocksSentence('current', ['site_access'])).toBeNull();
    expect(blocksSentence('lapses_soon', ['site_access'])).toBeNull();
    expect(blocksSentence('not_on_file', [])).toBeNull();
    expect(blocksSentence('lapsed', [])).toBeNull();
    expect(blocksSentence('lapsed', null)).toBeNull();
  });
});

describe('buildPaperworkRows', () => {
  it('opens the three expected papers as not on file when the studio holds none', () => {
    const rows = buildPaperworkRows(context([]));
    expect(rows.map((row) => row.docType).sort()).toEqual(
      [...EXPECTED_DOC_TYPES].sort(),
    );
    for (const row of rows) {
      expect(row.state).toBe('not_on_file');
      expect(row.openByDefault).toBe(true);
      expect(row.sentence).toContain('is not on file.');
    }
  });

  it('orders the worst paper first: lapsed, then owed, then lapsing, then current', () => {
    const rows = buildPaperworkRows(
      context([
        doc({ doc_type: 'coi_gl', state: 'lapsed', expires_on: '2026-03-31' }),
        doc({ doc_type: 'w9', state: 'current', blocks: [], expires_on: null }),
        doc({ doc_type: 'bond', state: 'lapses_soon', expires_on: '2026-10-01' }),
      ]),
    );
    expect(rows.map((row) => row.state)).toEqual([
      'lapsed',
      'not_on_file',
      'lapses_soon',
      'current',
    ]);
    expect(rows[1]?.docType).toBe('license');
  });

  it('prints what a lapse blocks and nothing else', () => {
    const [row] = buildPaperworkRows(
      context([
        doc({
          doc_type: 'coi_gl',
          state: 'lapsed',
          expires_on: '2026-03-31',
          blocks: ['site_access', 'draw'],
        }),
      ]),
    );
    expect(row?.sentence).toBe('COI, general liability, lapsed 31 March 2026.');
    expect(row?.blocksSentence).toBe('Blocks site access and the draw.');
    expect(row?.openByDefault).toBe(false);
  });

  it('folds a verified paper and its unchecked renewal into one row, worst word first', () => {
    const rows = buildPaperworkRows(
      context([
        doc({ doc_type: 'coi_gl', state: 'lapsed', expires_on: '2026-03-31' }),
        doc({
          doc_type: 'coi_gl',
          state: 'current',
          expires_on: '2027-03-31',
          awaiting_check: true,
        }),
      ]),
    );
    const coi = rows.find((row) => row.docType === 'coi_gl');
    expect(coi?.state).toBe('lapsed');
    expect(coi?.awaitingCheck).toBe(true);
    expect(rows.filter((row) => row.docType === 'coi_gl')).toHaveLength(1);
  });

  it('carries the pending flag when the unchecked renewal is read first', () => {
    const rows = buildPaperworkRows(
      context([
        doc({
          doc_type: 'coi_gl',
          state: 'current',
          expires_on: '2027-03-31',
          awaiting_check: true,
        }),
        doc({ doc_type: 'coi_gl', state: 'lapsed', expires_on: '2026-03-31' }),
      ]),
    );
    const coi = rows.find((row) => row.docType === 'coi_gl');
    expect(coi?.state).toBe('lapsed');
    expect(coi?.awaitingCheck).toBe(true);
  });

  // W4 round-1 review QA-B1, then R-BU: an upload nobody has opened is not
  // paper the studio holds, and the firm's own page may not say it is — nor
  // may it say "is not on file" one line above its own receipt (W4 r7 MAJOR-2).
  it('reads not yet checked when the only paper of a type is waiting for the check', () => {
    const rows = buildPaperworkRows(
      context([
        doc({
          doc_type: 'license',
          state: 'awaiting_check',
          expires_on: '2027-03-31',
          awaiting_check: true,
        }),
      ]),
    );
    const licence = rows.find((row) => row.docType === 'license');
    expect(licence?.state).toBe('awaiting_check');
    expect(licence?.awaitingCheck).toBe(true);
    expect(licence?.sentence).toBe('Licence, not yet checked.');
    // The word does not disagree with the receipt printed under it.
    expect(licence?.sentence).not.toMatch(/not on file/i);
    expect(licence?.sentence).not.toMatch(/current/i);
    // Something has been sent, so the form does not open itself at her.
    expect(licence?.openByDefault).toBe(false);
  });

  // W4 r7 M-4: a refusal reaches the firm here or nowhere.
  it('says a refused paper was not accepted, in the studio\u2019s own words', () => {
    const rows = buildPaperworkRows(
      context([
        doc({
          doc_type: 'coi_gl',
          state: 'refused',
          expires_on: null,
          blocks: ['site_access'],
          awaiting_check: false,
          refusal_reason: 'The certificate names the wrong job address',
        }),
      ]),
    );
    const coi = rows.find((row) => row.docType === 'coi_gl');
    expect(coi?.state).toBe('refused');
    expect(coi?.sentence).toBe('COI, general liability was not accepted.');
    expect(coi?.reasonSentence).toBe('The certificate names the wrong job address.');
    expect(coi?.awaitingCheck).toBe(false);
    // Nothing is waiting, and paper is owed again, so the form opens.
    expect(coi?.openByDefault).toBe(true);
  });

  it('keeps a refusal from outranking paper the studio now holds', () => {
    const rows = buildPaperworkRows(
      context([
        doc({
          doc_type: 'w9',
          state: 'current',
          blocks: [],
          expires_on: null,
        }),
      ]),
    );
    const w9 = rows.find((row) => row.docType === 'w9');
    expect(w9?.state).toBe('current');
    expect(w9?.reasonSentence).toBeNull();
  });

  it('lets the paper the studio HOLDS speak the word when a renewal is pending beside it', () => {
    const rows = buildPaperworkRows(
      context([
        doc({ doc_type: 'w9', state: 'current', blocks: [], expires_on: null }),
        doc({
          doc_type: 'w9',
          state: 'current',
          blocks: [],
          expires_on: null,
          awaiting_check: true,
        }),
      ]),
    );
    const w9 = rows.filter((row) => row.docType === 'w9');
    expect(w9).toHaveLength(1);
    expect(w9[0]?.state).toBe('current');
    expect(w9[0]?.awaitingCheck).toBe(true);
  });

  it('keeps two differently-named other papers apart', () => {
    const rows = buildPaperworkRows(
      context([
        doc({ doc_type: 'other_named', doc_label: 'MN asbestos permit', blocks: [] }),
        doc({ doc_type: 'other_named', doc_label: 'Roof warranty', blocks: [] }),
      ]),
    );
    const others = rows.filter((row) => row.docType === 'other_named');
    expect(others.map((row) => row.title).sort()).toEqual([
      'MN asbestos permit',
      'Roof warranty',
    ]);
  });

  it('marks a waiver upload only and never asks it for a term', () => {
    const rows = buildPaperworkRows(
      context([
        doc({
          doc_type: 'lien_waiver_unconditional',
          blocks: [],
          expires_on: null,
        }),
      ]),
    );
    const waiver = rows.find((row) => row.docType === 'lien_waiver_unconditional');
    expect(waiver?.uploadOnly).toBe(true);
    expect(waiver?.expiryRequired).toBe(false);
  });

  it('does not open a form by default for a type whose renewal is already in', () => {
    const rows = buildPaperworkRows(
      context([
        doc({ doc_type: 'w9', state: 'current', blocks: [], expires_on: null, awaiting_check: true }),
      ]),
    );
    const w9 = rows.find((row) => row.docType === 'w9');
    expect(w9?.openByDefault).toBe(false);
    expect(w9?.awaitingCheck).toBe(true);
  });

  it('ignores a malformed document row rather than drawing a nameless one', () => {
    const rows = buildPaperworkRows(
      context([doc({ doc_type: '' as unknown as string })]),
    );
    expect(rows.every((row) => row.docType !== '')).toBe(true);
  });
});
