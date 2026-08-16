/**
 * Stale-table pinning (R7): the paper never re-composes under the designer's
 * hands. These are the four things that must hold — it pins what it was given,
 * it says nothing while the derivation agrees, it arms (and does not re-compose)
 * when the derivation moves, and adopting re-arms for the next move.
 */
import { act, renderHook } from '@testing-library/react';

import { useTablePin } from '../use-table-pin';
import type { TableComposition } from '@/lib/document/table-derivation';

const SPECCING: TableComposition = { table: 'speccing', section: 'direction' };
const FINALIZE: TableComposition = { table: 'finalize', section: 'proposal' };
const DELIVERY: TableComposition = {
  table: 'delivery',
  section: 'project',
  setting: 'procurement',
};

describe('useTablePin', () => {
  it('pins the composition it is picked up with', () => {
    const { result } = renderHook(() => useTablePin(SPECCING));

    expect(result.current.composition).toEqual(SPECCING);
    expect(result.current.pending).toBeNull();
  });

  it('arms nothing while the derivation agrees', () => {
    const { result, rerender } = renderHook(
      ({ derived }: { derived: TableComposition }) => useTablePin(derived),
      { initialProps: { derived: SPECCING } },
    );

    // A NEW object with the same answer is the ordinary case — the page
    // re-derives on every dependency change, not only on real ones.
    rerender({ derived: { ...SPECCING } });

    expect(result.current.pending).toBeNull();
    expect(result.current.composition).toEqual(SPECCING);
  });

  it('arms a turn — and holds the composition — when the derivation moves', () => {
    const { result, rerender } = renderHook(
      ({ derived }: { derived: TableComposition }) => useTablePin(derived),
      { initialProps: { derived: SPECCING } },
    );

    rerender({ derived: FINALIZE });

    expect(result.current.pending).toEqual(FINALIZE);
    expect(result.current.composition).toEqual(SPECCING);
  });

  it('adopts the pending composition when the table is turned', () => {
    const { result, rerender } = renderHook(
      ({ derived }: { derived: TableComposition }) => useTablePin(derived),
      { initialProps: { derived: SPECCING } },
    );
    rerender({ derived: FINALIZE });

    act(() => result.current.turn());

    expect(result.current.composition).toEqual(FINALIZE);
    expect(result.current.pending).toBeNull();
  });

  it('re-arms for the next move after a turn', () => {
    const { result, rerender } = renderHook(
      ({ derived }: { derived: TableComposition }) => useTablePin(derived),
      { initialProps: { derived: SPECCING } },
    );
    rerender({ derived: FINALIZE });
    act(() => result.current.turn());

    rerender({ derived: DELIVERY });

    expect(result.current.pending).toEqual(DELIVERY);
    expect(result.current.composition).toEqual(FINALIZE);
  });

  it('takes no pin before the row has answered', () => {
    const { result, rerender } = renderHook(
      ({ derived }: { derived: TableComposition | null }) => useTablePin(derived),
      { initialProps: { derived: null as TableComposition | null } },
    );
    expect(result.current.composition).toBeNull();

    rerender({ derived: DELIVERY });

    // The first real composition is adopted, not treated as a turn.
    expect(result.current.composition).toEqual(DELIVERY);
    expect(result.current.pending).toBeNull();
  });
});
