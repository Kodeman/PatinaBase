import snapshot from './teaching-releases.snapshot.json';
import {
  TEACHING_RELEASES,
  initialCursorFor,
  releaseSinceCursor,
  resolveCursor,
} from './teaching-releases';

const ids = TEACHING_RELEASES.map((r) => r.id);

describe('TEACHING_RELEASES manifest', () => {
  it('has unique ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only known size classes', () => {
    for (const r of TEACHING_RELEASES) {
      expect(['minor', 'useful', 'workflow_changing']).toContain(r.sizeClass);
    }
  });

  it('is append-only: the committed snapshot is a prefix of the manifest ids', () => {
    expect(snapshot.length).toBeLessThanOrEqual(ids.length);
    expect(ids.slice(0, snapshot.length)).toEqual(snapshot);
  });

  it('uses YYYY-MM-DD-slug ids', () => {
    for (const id of ids) expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
  });
});

describe('cursor', () => {
  it('resolves an unknown id to head, flagged unknown so the caller writes nothing', () => {
    expect(resolveCursor('2099-01-01-from-a-newer-deploy', TEACHING_RELEASES)).toEqual({
      index: TEACHING_RELEASES.length - 1,
      unknown: true,
    });
  });

  it('teaches nothing since an unknown cursor', () => {
    for (const id of ids) {
      expect(releaseSinceCursor(id, '2099-01-01-from-a-newer-deploy', TEACHING_RELEASES)).toBe(false);
    }
  });

  it('resolves a known id to its index and null to before the first release', () => {
    expect(resolveCursor(ids[1], TEACHING_RELEASES)).toEqual({ index: 1, unknown: false });
    expect(resolveCursor(null, TEACHING_RELEASES)).toEqual({ index: -1, unknown: false });
    expect(releaseSinceCursor(ids[2], ids[1], TEACHING_RELEASES)).toBe(true);
    expect(releaseSinceCursor(ids[1], ids[1], TEACHING_RELEASES)).toBe(false);
  });

  it('starts before the first release for an account older than every release', () => {
    expect(initialCursorFor('2026-01-01T00:00:00Z', TEACHING_RELEASES)).toBeNull();
  });

  it('starts at the newest release shipped on or before account creation', () => {
    expect(initialCursorFor('2026-09-10T12:00:00Z', TEACHING_RELEASES)).toBe('2026-09-10-galley-parts');
    expect(initialCursorFor('2026-09-20T00:00:00Z', TEACHING_RELEASES)).toBe('2026-09-11-invoice-print');
  });
});
