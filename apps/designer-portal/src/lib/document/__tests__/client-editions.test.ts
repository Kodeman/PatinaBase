/**
 * US-49 Phase 2 — the editions read as the server acts on it: the hook's
 * normaliser over list_client_editions' own rows (00845), the open job's live
 * query options (R2), a pre-project read that never runs (R6), published
 * provenance and the edition Undo restores (R5), and a closed job (R12).
 */
import { useQuery } from '@tanstack/react-query';
import {
  createBrowserClient,
  CLIENT_EDITIONS_LIVE_MS,
  clientEditionsQueryOptions,
  normalizeClientEditions,
  type ClientEdition,
} from '@patina/supabase';
import {
  CURRENT_ROW,
  EARLIER_ROW,
  PENDING_ROW,
  editionRow,
  listEnvelope,
  imageRow,
} from '@/components/document/__fixtures__/client-editions';
import {
  currentEdition,
  editionUndoRestores,
  editionsFrozen,
  pendingEdition,
  wasPublished,
  projectMakerNames,
  useProjectMakerNames,
  readerImageContent,
} from '../client-editions';

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn(),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  createBrowserClient: jest.fn(),
}));

describe('useProjectMakerNames', () => {
  const queryOptions = () => {
    useProjectMakerNames('p-1');
    return (useQuery as jest.Mock).mock.calls[0][0];
  };

  const mockRead = () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn(),
      in: jest.fn(),
    };
    const from = jest.fn().mockReturnValue(query);
    jest.mocked(createBrowserClient).mockReturnValue({ from } as never);
    return { query, from };
  };

  it('reads removed-item and direct-vendor names across every page without the active-list filter', async () => {
    const { query, from } = mockRead();
    query.range
      .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ vendor_name: 'Active', vendor_id: `v-${i}` })), error: null })
      .mockResolvedValueOnce({ data: [
        { vendor_name: ' Retired Atelier ', vendor_id: 'v-500' },
        { vendor_name: null, vendor_id: 'v-0' },
        { vendor_name: null, vendor_id: null },
      ], error: null });
    query.in
      .mockResolvedValueOnce({ data: [{ id: 'v-0', name: 'Joined Maker' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'v-500', name: 'Second Batch Maker' }], error: null });
    const options = queryOptions();
    expect(options.queryKey).toEqual(['project-ffe-items', 'p-1', 'mirror-maker-names']);
    expect(options.enabled).toBe(true);
    expect([...await options.queryFn()]).toEqual(['active', 'retired atelier', 'joined maker', 'second batch maker']);
    expect(from.mock.calls).toEqual([['project_ffe_items'], ['project_ffe_items'], ['vendors'], ['vendors']]);
    expect(query.select).toHaveBeenCalledWith('vendor_name, vendor_id');
    expect(query.select).toHaveBeenCalledWith('id, name');
    expect(query.eq).toHaveBeenCalledWith('project_id', 'p-1');
    expect(query.is).not.toHaveBeenCalled();
    expect(query.order).toHaveBeenCalledWith('id');
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(query.in.mock.calls).toEqual([
      ['id', Array.from({ length: 500 }, (_, i) => `v-${i}`)],
      ['id', ['v-500']],
    ]);
  });

  it('rejects a later page error instead of publishing a partial maker-name set', async () => {
    const { query } = mockRead();
    const error = new Error('read denied');
    query.range
      .mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ vendor_name: 'Active', vendor: null })), error: null })
      .mockResolvedValueOnce({ data: null, error });
    await expect(queryOptions().queryFn()).rejects.toBe(error);
  });

  it('skips the vendors read when no item has a vendor id', async () => {
    const { query, from } = mockRead();
    query.range.mockResolvedValueOnce({ data: [{ vendor_name: ' Retired Atelier ', vendor_id: null }], error: null });
    expect([...await queryOptions().queryFn()]).toEqual(['retired atelier']);
    expect(from.mock.calls).toEqual([['project_ffe_items']]);
    expect(query.in).not.toHaveBeenCalled();
  });

  it('rejects a vendor read error instead of publishing only item names', async () => {
    const { query } = mockRead();
    const error = new Error('vendor read denied');
    query.range.mockResolvedValueOnce({ data: [{ vendor_name: 'Active', vendor_id: 'v-1' }], error: null });
    query.in.mockResolvedValueOnce({ data: null, error });
    await expect(queryOptions().queryFn()).rejects.toBe(error);
  });

  it('disables the name read without a project', () => {
    useProjectMakerNames('');
    expect((useQuery as jest.Mock).mock.calls[0][0].enabled).toBe(false);
  });
});

const read = (rows: Record<string, unknown>[], showMakers = false) =>
  normalizeClientEditions(listEnvelope(rows, showMakers) as never);

describe('normalizeClientEditions over the SQL’s rows', () => {
  it('keeps the envelope’s fields, newest first', () => {
    const { showMakers, editions } = read([EARLIER_ROW, PENDING_ROW, CURRENT_ROW], true);
    expect(showMakers).toBe(true);
    expect(editions.map((edition) => edition.seq)).toEqual([5, 4, 3]);
    const [pending, current, earlier] = editions;
    expect(pending.status).toBe('awaiting_review');
    expect(current.reviewedBy).toEqual({ id: 'u-maren', name: 'Maren Holt' });
    expect(earlier.supersededBy).toBe('e-4');
    expect(earlier.autoPublished).toBe(true);
    expect(pending.composition?.hero?.assetId).toBe('a-hero');
    expect(pending.composition?.chapters?.[0]).toEqual({
      key: 'room-living',
      headline: 'The living room',
      standing: 'The sofa leaves the workshop on Friday.',
    });
    expect(pending.images[0]).toMatchObject({
      assetId: 'a-hero',
      plateRole: 'hero',
      cropKey: 'none',
      sourceKind: 'upload',
      focal: [0.5, 0.45],
      subjectBox: null,
    });
  });

  it('reads an empty or malformed result as no editions', () => {
    expect(normalizeClientEditions(null)).toEqual({ showMakers: false, projectClosed: false, editions: [] });
    expect(normalizeClientEditions([] as never)).toEqual({ showMakers: false, projectClosed: false, editions: [] });
    const bare = read([{ id: 'e-1', seq: 1, status: 'drafting' }]).editions[0];
    expect(bare).toMatchObject({ autoPublished: false, held: false, supersededBy: null, images: [] });
  });
});

describe('clientEditionsQueryOptions', () => {
  it('the open job polls every minute and on every focus (R2)', () => {
    const live = clientEditionsQueryOptions('p-1', { live: true });
    expect(CLIENT_EDITIONS_LIVE_MS).toBe(60_000);
    expect(live).toMatchObject({
      queryKey: ['client-editions', 'p-1'],
      enabled: true,
      refetchInterval: 60_000,
      refetchOnWindowFocus: 'always',
    });
  });

  it('the Desk line shares the key and does not poll (R2)', () => {
    const desk = clientEditionsQueryOptions('p-1');
    expect(desk.queryKey).toEqual(['client-editions', 'p-1']);
    expect(desk).not.toHaveProperty('refetchInterval');
    expect(desk).not.toHaveProperty('refetchOnWindowFocus');
  });

  it('a pre-project job reads nothing (R6)', () => {
    expect(clientEditionsQueryOptions(null).enabled).toBe(false);
    expect(clientEditionsQueryOptions(undefined, { live: true }).enabled).toBe(false);
  });
});

describe('which editions were published, and what Undo restores (R5)', () => {
  const five = editionRow({ id: 'e-5', seq: 5, status: 'approved', approvedAt: '2026-10-22T09:00:00+00:00' });
  const fourDraft = editionRow({ id: 'e-4', seq: 4, status: 'superseded', supersededBy: 'e-5' });
  const three = editionRow({
    id: 'e-3',
    seq: 3,
    status: 'superseded',
    approvedAt: '2026-10-20T09:00:00+00:00',
    supersededBy: 'e-5',
  });

  it('approved #5, never-approved superseded #4, approved #3 → published 5 and 3; Undo #5 restores #3', () => {
    const { editions } = read([five, fourDraft, three]);
    expect(editions.filter(wasPublished).map((edition) => edition.seq)).toEqual([5, 3]);
    const undone = currentEdition(editions) as ClientEdition;
    expect(editionUndoRestores(editions, undone)?.seq).toBe(3);
  });

  it('an earlier approved edition the undone one did not supersede is not restored', () => {
    const unlinked = editionRow({ id: 'e-2', seq: 2, status: 'superseded', approvedAt: '2026-10-19T09:00:00+00:00' });
    const { editions } = read([five, unlinked]);
    expect(editionUndoRestores(editions, editions[0])).toBeNull();
  });

  it('an auto-published plates-only edition counts as published', () => {
    const { editions } = read([EARLIER_ROW]);
    expect(wasPublished(editions[0])).toBe(true);
  });
});

describe('pending, current and a closed job', () => {
  it('names the waiting and the approved editions', () => {
    const { editions } = read([PENDING_ROW, CURRENT_ROW]);
    expect(pendingEdition(editions)?.seq).toBe(5);
    expect(currentEdition(editions)?.seq).toBe(4);
    expect(editionsFrozen(editions)).toBe(false);
  });

  it('a frozen current edition closes the job (R12)', () => {
    const { editions } = read([PENDING_ROW, { ...CURRENT_ROW, frozenAt: '2026-10-22T12:00:00+00:00' }]);
    expect(editionsFrozen(editions)).toBe(true);
  });

  it('a closed job with no frozen edition is closed too (00848 projectClosed)', () => {
    const { editions } = read([PENDING_ROW]);
    expect(editionsFrozen(editions, true)).toBe(true);
    expect(editionsFrozen(read([CURRENT_ROW]).editions, true)).toBe(true);
    expect(editionsFrozen(editions, false)).toBe(false);
  });
});


describe('the reader image content policy (seq 53/59)', () => {
  const policy = {
    showMakers: false, studioName: 'Nord Studio',
    makerNames: projectMakerNames(['  HERMAN MILLER ', 'Nord', 'Studio', 'Art', 'AB', '', null, 'Nord']),
  };
  const image = (over = {}) => read([{ ...CURRENT_ROW, images: [imageRow('a-old', over)] }]).editions[0].images[0];

  it('normalises and deduplicates project maker names with a three-character floor', () => {
    expect([...policy.makerNames]).toEqual(['herman miller', 'nord', 'studio', 'art']);
  });

  it('strips every case-insensitive maker occurrence and trims separators', () => {
    const shown = readerImageContent(image({ captionWhat: 'Herman Miller chair · HERMAN MILLER', sourceKind: 'maker' }), undefined, policy);
    expect(shown.caption.what).toBe('chair');
    expect(shown.alt).toBe('chair · Nord Studio · product photograph');
  });

  it('strips overlapping maker names longest first', () => {
    const shown = readerImageContent(image({ captionWhat: 'Nord Studio chair', sourceKind: 'maker' }), undefined, {
      ...policy, makerNames: projectMakerNames(['Nord', 'Nord Studio']),
    });
    expect(shown.caption.what).toBe('chair');
  });

  it('uses trusted kind words when stripping leaves no what', () => {
    const shown = readerImageContent(image({ captionWhat: ' · Nord — ', sourceKind: 'maker' }), undefined, policy);
    expect(shown.caption.what).toBe('product photograph');
    expect(shown.caption.whose).toBe('Nord Studio');
    expect(shown.alt).toBe('product photograph · Nord Studio · product photograph');
  });

  it('accepts fail-safe substring over-masking', () => {
    expect(readerImageContent(image({ captionWhat: 'cart', sourceKind: 'scan' }), undefined, policy).caption.what).toBe('c');
  });

  it.each(['scan', 'installed', 'board', 'sheet', 'concept'] as const)('preserves neutral %s alts, but rebuilds maker-bearing alts', (kind) => {
    const neutral = image({ sourceKind: kind, alt: '  Morning light along the restored oak stair  ' });
    expect(readerImageContent(neutral, { whose: 'June' }, policy).alt).toBe(neutral.alt);
    expect(readerImageContent({ ...neutral, alt: 'Herman Miller chair' }, { whose: 'Herman Miller' }, policy).alt).not.toContain('Herman Miller');
  });

  it('uses attributionKind before sourceKind for item-picture rebuilding', () => {
    const shown = readerImageContent(image({ sourceKind: 'scan', attributionKind: 'upload', alt: 'Neutral original' }), undefined, policy);
    expect(shown.alt).toBe('What a-old · Nord Studio · studio photograph');
  });
});
