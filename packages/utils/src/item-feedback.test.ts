import {
  latestVerdictByLine,
  rollupVerdicts,
  formatVerdictRollup,
  type LineVerdict,
} from './item-feedback';

const at = (n: number) => new Date(2026, 0, 1, 0, 0, n).toISOString();

describe('latestVerdictByLine — append-only history folds to latest', () => {
  it('keeps the most recent verdict per line', () => {
    const v: LineVerdict[] = [
      { lineId: 'a', verdict: 'approved', createdAt: at(1) },
      { lineId: 'a', verdict: 'rejected', createdAt: at(3) }, // wins
      { lineId: 'a', verdict: 'comment', createdAt: at(2) },
      { lineId: 'b', verdict: 'approved', createdAt: at(1) },
    ];
    const latest = latestVerdictByLine(v);
    expect(latest.get('a')?.verdict).toBe('rejected');
    expect(latest.get('b')?.verdict).toBe('approved');
    expect(latest.size).toBe(2);
  });
});

describe('rollupVerdicts', () => {
  it('counts latest verdicts and pending remainder against the line total', () => {
    const v: LineVerdict[] = [
      { lineId: 'a', verdict: 'approved', createdAt: at(1) },
      { lineId: 'b', verdict: 'approved', createdAt: at(1) },
      { lineId: 'c', verdict: 'rejected', createdAt: at(1) },
      { lineId: 'd', verdict: 'comment', createdAt: at(1) },
    ];
    const r = rollupVerdicts(12, v);
    expect(r).toEqual({
      total: 12,
      approved: 2,
      flagged: 1,
      commented: 1,
      pending: 8, // 12 - 4 decided
      unresolvedFlags: 1,
    });
  });

  it('a resolved rejection still counts as flagged but not unresolved', () => {
    const v: LineVerdict[] = [
      { lineId: 'c', verdict: 'rejected', createdAt: at(1), resolvedAt: at(2) },
    ];
    const r = rollupVerdicts(3, v);
    expect(r.flagged).toBe(1);
    expect(r.unresolvedFlags).toBe(0);
  });

  it('a re-verdict (flag → approve) moves the line out of flagged', () => {
    const v: LineVerdict[] = [
      { lineId: 'a', verdict: 'rejected', createdAt: at(1) },
      { lineId: 'a', verdict: 'approved', createdAt: at(5) },
    ];
    const r = rollupVerdicts(1, v);
    expect(r.approved).toBe(1);
    expect(r.flagged).toBe(0);
    expect(r.unresolvedFlags).toBe(0);
  });

  it('never returns negative pending when more lines are decided than the given total', () => {
    const v: LineVerdict[] = [
      { lineId: 'a', verdict: 'approved', createdAt: at(1) },
      { lineId: 'b', verdict: 'approved', createdAt: at(1) },
    ];
    const r = rollupVerdicts(1, v); // total lower than decided
    expect(r.total).toBe(2);
    expect(r.pending).toBe(0);
  });
});

describe('formatVerdictRollup', () => {
  it('is empty when nothing has happened', () => {
    expect(formatVerdictRollup(rollupVerdicts(12, []))).toBe('');
  });

  it('reads "4 of 12 approved · 1 flagged · 2 noted"', () => {
    const v: LineVerdict[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ lineId: `a${i}`, verdict: 'approved' as const, createdAt: at(1) })),
      { lineId: 'f', verdict: 'rejected', createdAt: at(1) },
      { lineId: 'n1', verdict: 'comment', createdAt: at(1) },
      { lineId: 'n2', verdict: 'comment', createdAt: at(1) },
    ];
    expect(formatVerdictRollup(rollupVerdicts(12, v))).toBe('4 of 12 approved · 1 flagged · 2 noted');
  });

  it('omits flagged / noted when zero', () => {
    const v: LineVerdict[] = [{ lineId: 'a', verdict: 'approved', createdAt: at(1) }];
    expect(formatVerdictRollup(rollupVerdicts(5, v))).toBe('1 of 5 approved');
  });
});
