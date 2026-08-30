import {
  DOCUMENT_INDEX_KEYS,
  DOCUMENT_INDEX_LABELS,
  PREWORK_PAPER_REGIONS,
  PROJECT_PAPER_ORDER,
  paperRegionFor,
  paperRegionsForSection,
  regionAnchorSelector,
  regionHeadingId,
  type DocumentIndexKey,
} from '../document-index';
import type { SectionKey } from '../desk-derivation';

const keysOf = (section: SectionKey) =>
  paperRegionsForSection(section).map((region) => region.key);

describe('the paper order', () => {
  it('states the six project stops in the order the paper mounts them', () => {
    expect(PROJECT_PAPER_ORDER.map((region) => region.key)).toEqual([
      'approvals',
      'schedule',
      'ffe',
      'money',
      'care',
      'record',
    ]);
  });

  it('gives the closeout band and the record their names and their heading ids', () => {
    expect(DOCUMENT_INDEX_LABELS.care).toBe('Closing the book');
    expect(DOCUMENT_INDEX_LABELS.record).toBe('The record');
    expect(regionHeadingId('care', 'proj-1')).toBe('care-region-heading');
    expect(regionHeadingId('record', 'proj-1')).toBe('previous-work-heading');
  });

  it('labels every key exactly once — the union and the arrays cannot drift', () => {
    expect(DOCUMENT_INDEX_KEYS).toEqual(
      PROJECT_PAPER_ORDER.map((region) => region.key),
    );
    // Every key the union carries is declared in exactly one of the two
    // arrays, and every declared key is labelled.
    const declared = [
      ...PROJECT_PAPER_ORDER.map((region) => region.key),
      ...PREWORK_PAPER_REGIONS.map((region) => region.key),
    ];
    expect(new Set(declared).size).toBe(declared.length);
    expect(Object.keys(DOCUMENT_INDEX_LABELS).sort()).toEqual(
      [...declared].sort(),
    );
  });

  // OD-2/DL-02 — the pre-work stops' printed names, ruled by the design lead.
  it('names the pre-work stops', () => {
    expect(DOCUMENT_INDEX_LABELS.brief).toBe('The brief');
    expect(DOCUMENT_INDEX_LABELS.discovery).toBe('Discovery');
    expect(DOCUMENT_INDEX_LABELS.direction).toBe('Direction');
    expect(DOCUMENT_INDEX_LABELS.proposal).toBe('The proposal');
    expect(DOCUMENT_INDEX_LABELS.scope).toBe('Scope & engagement');
    expect(DOCUMENT_INDEX_LABELS.vision).toBe('Design vision');
    expect(DOCUMENT_INDEX_LABELS.investment).toBe('The investment');
  });
});

describe('paperRegionsForSection', () => {
  it('prints all six on the project spread', () => {
    expect(keysOf('project')).toEqual([
      'approvals',
      'schedule',
      'ffe',
      'money',
      'care',
      'record',
    ]);
  });

  // Money and Schedule mount only under `spreadSection === 'project'`, so a row
  // for either on install or care would be a scroll-spy target with nothing
  // behind it.
  it.each(['install', 'care'] as const)(
    'prints four on the %s spread — no money row, no schedule row',
    (section) => {
      expect(keysOf(section)).toEqual(['approvals', 'ffe', 'care', 'record']);
    },
  );

  // Wave 5 (OD-2) — the four spreads before the work starts now mount their
  // own stops, so the ladder has something to index and the lens something to
  // observe. `record` closes every one of them: `PreviousWork` mounts at the
  // foot of every spread.
  it.each([
    ['brief', ['brief', 'record']],
    ['discovery', ['discovery', 'record']],
    ['direction', ['direction', 'record']],
    ['proposal', ['proposal', 'scope', 'vision', 'investment', 'record']],
  ] as const)('prints the pre-work stops on the %s spread', (section, keys) => {
    expect(keysOf(section)).toEqual([...keys]);
  });

  it('never states an order the project spread does not print', () => {
    const paperOrder = PROJECT_PAPER_ORDER.map((region) => region.key);
    for (const section of ['project', 'install', 'care'] as const) {
      const subset = keysOf(section);
      expect(subset).toEqual(paperOrder.filter((key) => subset.includes(key)));
    }
  });
});

describe('regionHeadingId', () => {
  it('answers for every declared key', () => {
    for (const key of [
      ...PROJECT_PAPER_ORDER,
      ...PREWORK_PAPER_REGIONS,
    ].map((region) => region.key)) {
      expect(regionHeadingId(key, 'proj-1')).toBeTruthy();
    }
    expect(regionHeadingId('ffe', 'proj-1')).toBe('ffe-region-heading-proj-1');
  });

  // A brief, a discovery and a proposal all exist before a project does, so a
  // pre-work heading keyed on one would be keyed on ''.
  it('keys no pre-work heading on a project id', () => {
    for (const region of PREWORK_PAPER_REGIONS) {
      expect(regionHeadingId(region.key, 'proj-1')).toBe(
        regionHeadingId(region.key, ''),
      );
    }
    expect(regionHeadingId('proposal', '')).toBe('proposal-region-heading');
  });

  // The guard that keeps the union and the array one declaration: widen
  // `DocumentIndexKey` without adding the entry and this is what says so.
  it('throws on a key with no region declared', () => {
    expect(() =>
      regionHeadingId('accounts' as DocumentIndexKey, 'proj-1'),
    ).toThrow('no paper region declared for "accounts"');
    expect(() => paperRegionFor('accounts' as DocumentIndexKey)).toThrow(
      'no paper region declared for "accounts"',
    );
  });
});

describe('regionAnchorSelector', () => {
  it('addresses the root the scrollspy observes', () => {
    expect(regionAnchorSelector('record')).toBe('[data-index-region="record"]');
  });
});
