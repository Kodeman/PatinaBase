import { lastMovementAt, pickActiveProjectId } from '../active-project';

describe('lastMovementAt', () => {
  it('reports the greatest readable timestamp', () => {
    expect(
      lastMovementAt([
        '2026-08-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        '2026-07-01T00:00:00.000Z',
      ]),
    ).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
  });

  it('reads past nulls and unparseable strings rather than stopping at them', () => {
    expect(
      lastMovementAt([null, 'not a date', undefined, '2026-09-01T00:00:00.000Z', '']),
    ).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
  });

  it('reports nothing when nothing can be read', () => {
    expect(lastMovementAt([])).toBeNull();
    expect(lastMovementAt([null, undefined, 'whenever'])).toBeNull();
  });
});

describe('pickActiveProjectId', () => {
  it('reports nothing when the client keeps no house', () => {
    expect(pickActiveProjectId([])).toBeNull();
  });

  it('opens the only house a solo client keeps', () => {
    expect(
      pickActiveProjectId([{ projectId: 'p1', movedAt: ['2026-01-01T00:00:00.000Z'] }]),
    ).toBe('p1');
  });

  it('opens the house whose own record moved last', () => {
    expect(
      pickActiveProjectId([
        { projectId: 'p1', movedAt: ['2026-08-01T00:00:00.000Z'] },
        { projectId: 'p2', movedAt: ['2026-08-20T00:00:00.000Z'] },
      ]),
    ).toBe('p2');
  });

  it('lets a note outrank a fresher project record on another house', () => {
    expect(
      pickActiveProjectId([
        { projectId: 'p1', movedAt: ['2026-08-20T00:00:00.000Z'] },
        {
          projectId: 'p2',
          // the project row is stale, but the studio wrote yesterday
          movedAt: ['2026-06-01T00:00:00.000Z', '2026-08-25T00:00:00.000Z'],
        },
      ]),
    ).toBe('p2');
  });

  it('lets an invoice movement carry the house', () => {
    expect(
      pickActiveProjectId([
        { projectId: 'p1', movedAt: ['2026-08-20T00:00:00.000Z', null] },
        {
          projectId: 'p2',
          movedAt: ['2026-06-01T00:00:00.000Z', null, '2026-09-02T00:00:00.000Z'],
        },
      ]),
    ).toBe('p2');
  });

  it('keeps the first house on an exact tie', () => {
    expect(
      pickActiveProjectId([
        { projectId: 'p1', movedAt: ['2026-08-20T00:00:00.000Z'] },
        { projectId: 'p2', movedAt: ['2026-08-20T00:00:00.000Z'] },
      ]),
    ).toBe('p1');
  });

  it('never prefers a house whose clocks cannot be read', () => {
    expect(
      pickActiveProjectId([
        { projectId: 'p1', movedAt: ['2026-08-20T00:00:00.000Z'] },
        { projectId: 'p2', movedAt: [] },
      ]),
    ).toBe('p1');
  });

  it('falls back to the first house when no clock anywhere can be read', () => {
    expect(
      pickActiveProjectId([
        { projectId: 'p1', movedAt: [null] },
        { projectId: 'p2', movedAt: [undefined] },
      ]),
    ).toBe('p1');
  });

  it('prefers a readable house over an unreadable one standing first', () => {
    expect(
      pickActiveProjectId([
        { projectId: 'p1', movedAt: [null] },
        { projectId: 'p2', movedAt: ['2026-08-20T00:00:00.000Z'] },
      ]),
    ).toBe('p2');
  });
});
