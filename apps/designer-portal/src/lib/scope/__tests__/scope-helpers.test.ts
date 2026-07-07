import {
  DOC_CODE_PREFIX_MAP,
  consonantPrefix,
  suggestDocCodePrefix,
  suggestDocCode,
  resolveDocCode,
} from '../doc-code';
import { LEAD_TIME_BUCKETS, leadTimeLabel, isKnownLeadTimeBucket } from '../lead-time';
import { findScheduleTwins, type TwinCandidate } from '../duplicates';

// ─── S1 · doc-code suggester ─────────────────────────────────────────────────

describe('doc-code prefix', () => {
  it('maps canonical taxonomy slugs to the curated prefixes', () => {
    expect(suggestDocCodePrefix('seating')).toBe('CH');
    expect(suggestDocCodePrefix('tables')).toBe('TB');
    expect(suggestDocCodePrefix('lighting')).toBe('LT');
    expect(suggestDocCodePrefix('rugs')).toBe('RG');
    expect(suggestDocCodePrefix('storage')).toBe('CS');
    expect(suggestDocCodePrefix('soft_goods')).toBe('TX');
    expect(suggestDocCodePrefix('art')).toBe('AR');
    expect(suggestDocCodePrefix('accessories')).toBe('AC');
    expect(suggestDocCodePrefix('plumbing_fixtures')).toBe('PL');
    expect(suggestDocCodePrefix('appliances')).toBe('AP');
  });

  it('aliases the interior-design terms to the same prefixes', () => {
    expect(suggestDocCodePrefix('casegoods')).toBe(DOC_CODE_PREFIX_MAP.storage);
    expect(suggestDocCodePrefix('textiles')).toBe(DOC_CODE_PREFIX_MAP.soft_goods);
    expect(suggestDocCodePrefix('plumbing')).toBe(DOC_CODE_PREFIX_MAP.plumbing_fixtures);
  });

  it('is case-insensitive on the category key', () => {
    expect(suggestDocCodePrefix('Seating')).toBe('CH');
    expect(suggestDocCodePrefix('  LIGHTING ')).toBe('LT');
  });

  it('falls back to the first two consonants for unmapped categories', () => {
    expect(consonantPrefix('window_treatments')).toBe('WN');
    expect(consonantPrefix('outdoor')).toBe('TD');
    expect(consonantPrefix('hardware')).toBe('HR');
    expect(suggestDocCodePrefix('window_treatments')).toBe('WN');
  });

  it('uses the fallback text (item name) when no category is set', () => {
    expect(suggestDocCodePrefix(null, 'Brass Sconce')).toBe(consonantPrefix('Brass Sconce'));
    expect(suggestDocCodePrefix('', 'Marble')).toBe('MR');
  });

  it('degrades to XX when there is nothing to derive from', () => {
    expect(consonantPrefix('')).toBe('XX');
    expect(consonantPrefix('   ')).toBe('XX');
  });
});

describe('doc-code sequencing', () => {
  it('starts at 01 within the document', () => {
    expect(suggestDocCode('seating', [])).toBe('CH-01');
  });

  it('advances past the highest existing sequence for that prefix', () => {
    expect(suggestDocCode('seating', ['CH-01', 'CH-02'])).toBe('CH-03');
  });

  it('zero-pads to two digits and rolls into three past 09', () => {
    expect(suggestDocCode('seating', ['CH-08'])).toBe('CH-09');
    expect(suggestDocCode('seating', ['CH-09'])).toBe('CH-10');
  });

  it('only counts codes for the same prefix (ignores other prefixes)', () => {
    expect(suggestDocCode('seating', ['TB-05', 'LT-02', 'CH-01'])).toBe('CH-02');
  });

  it('matches existing codes case-insensitively', () => {
    expect(suggestDocCode('seating', ['ch-04'])).toBe('CH-05');
  });
});

describe('resolveDocCode — never overwrites a manual code', () => {
  it('keeps a designer-entered code verbatim', () => {
    expect(resolveDocCode('MY-99', 'seating', ['CH-01'])).toBe('MY-99');
  });

  it('suggests only when the current code is blank', () => {
    expect(resolveDocCode('', 'seating', ['CH-01'])).toBe('CH-02');
    expect(resolveDocCode('   ', 'seating', [])).toBe('CH-01');
    expect(resolveDocCode(null, 'tables', [])).toBe('TB-01');
  });
});

// ─── S2 · lead-time buckets ──────────────────────────────────────────────────

describe('lead-time bucket mapping', () => {
  it('stores the bucket upper bound and shows its label', () => {
    expect(leadTimeLabel(0)).toBe('In stock');
    expect(leadTimeLabel(2)).toBe('1–2 wks');
    expect(leadTimeLabel(4)).toBe('3–4 wks');
    expect(leadTimeLabel(12)).toBe('9–12 wks');
    expect(leadTimeLabel(26)).toBe('21–26 wks');
  });

  it('shows "N wks" for a non-bucket int (legacy free-form data)', () => {
    expect(leadTimeLabel(3)).toBe('3 wks');
    expect(leadTimeLabel(52)).toBe('52 wks');
  });

  it('renders nothing for null/undefined', () => {
    expect(leadTimeLabel(null)).toBeNull();
    expect(leadTimeLabel(undefined)).toBeNull();
  });

  it('recognises canonical bucket values', () => {
    expect(isKnownLeadTimeBucket(6)).toBe(true);
    expect(isKnownLeadTimeBucket(7)).toBe(false);
    expect(isKnownLeadTimeBucket(null)).toBe(false);
  });

  it('exposes a 9-bucket vocabulary in ascending order', () => {
    expect(LEAD_TIME_BUCKETS.map((b) => b.value)).toEqual([0, 2, 4, 6, 8, 12, 16, 20, 26]);
  });
});

// ─── S7 · duplicate detection ────────────────────────────────────────────────

describe('findScheduleTwins', () => {
  const roomName = (id: string | null | undefined) =>
    id === 'room-lr' ? 'Living Room' : id === 'room-br' ? 'Bedroom' : null;

  it('flags two lines sharing a doc_code as twins on both sides', () => {
    const items: TwinCandidate[] = [
      { id: 'a', doc_code: 'CH-01', scope_room_id: 'room-lr', name: 'Sofa' },
      { id: 'b', doc_code: 'ch-01', scope_room_id: 'room-br', name: 'Loveseat' },
      { id: 'c', doc_code: 'TB-01', scope_room_id: 'room-lr', name: 'Table' },
    ];
    const twins = findScheduleTwins(items, roomName);
    expect(twins.get('a')).toEqual([
      { id: 'b', docCode: 'ch-01', roomName: 'Bedroom', name: 'Loveseat', reason: 'doc_code' },
    ]);
    expect(twins.get('b')?.[0].id).toBe('a');
    expect(twins.has('c')).toBe(false);
  });

  it('flags two lines sharing a product_id as twins', () => {
    const items: TwinCandidate[] = [
      { id: 'a', product_id: 'p1', scope_room_id: 'room-lr', name: 'Chair' },
      { id: 'b', product_id: 'p1', scope_room_id: null, name: 'Chair' },
    ];
    const twins = findScheduleTwins(items, roomName);
    expect(twins.get('a')?.[0]).toMatchObject({ id: 'b', reason: 'product', roomName: null });
  });

  it('does not flag singletons or empty codes', () => {
    const items: TwinCandidate[] = [
      { id: 'a', doc_code: '', product_id: null },
      { id: 'b', doc_code: '   ', product_id: null },
      { id: 'c', doc_code: 'RG-01', product_id: null },
    ];
    expect(findScheduleTwins(items, roomName).size).toBe(0);
  });

  it('prefers the doc_code reason when a pair matches on both signals', () => {
    const items: TwinCandidate[] = [
      { id: 'a', product_id: 'p1', doc_code: 'CH-01', name: 'A' },
      { id: 'b', product_id: 'p1', doc_code: 'CH-01', name: 'B' },
    ];
    const twins = findScheduleTwins(items, roomName);
    expect(twins.get('a')?.[0].reason).toBe('doc_code');
  });
});
