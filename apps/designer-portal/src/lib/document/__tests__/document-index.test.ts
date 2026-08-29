import {
  DOCUMENT_INDEX_KEYS,
  DOCUMENT_INDEX_LABELS,
  PROJECT_PAPER_ORDER,
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

  it('labels every key exactly once — the union and the array cannot drift', () => {
    expect(DOCUMENT_INDEX_KEYS).toEqual(
      PROJECT_PAPER_ORDER.map((region) => region.key),
    );
    expect(Object.keys(DOCUMENT_INDEX_LABELS).sort()).toEqual(
      [...DOCUMENT_INDEX_KEYS].sort(),
    );
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

  // Wave 5 gives these spreads their own stops; until then the paper carries
  // no Project region at all and the ladder prints its empty track.
  it.each(['brief', 'discovery', 'direction', 'proposal'] as const)(
    'prints nothing on the %s spread',
    (section) => {
      expect(paperRegionsForSection(section)).toEqual([]);
    },
  );

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
    for (const key of DOCUMENT_INDEX_KEYS) {
      expect(regionHeadingId(key, 'proj-1')).toBeTruthy();
    }
    expect(regionHeadingId('ffe', 'proj-1')).toBe('ffe-region-heading-proj-1');
  });

  // The guard that keeps the union and the array one declaration: widen
  // `DocumentIndexKey` without adding the entry and this is what says so.
  it('throws on a key with no region declared', () => {
    expect(() =>
      regionHeadingId('accounts' as DocumentIndexKey, 'proj-1'),
    ).toThrow('no paper region declared for "accounts"');
  });
});

describe('regionAnchorSelector', () => {
  it('addresses the root the scrollspy observes', () => {
    expect(regionAnchorSelector('record')).toBe('[data-index-region="record"]');
  });
});
