import {
  groupByCourt,
  courtSummary,
  isHotCourt,
  blocksText,
  isBlocked,
  dueState,
  COURT_ORDER,
  type CoordinationItemLike,
  type CoordinationTaskLike,
} from '../coordination-derivation';

const NOW = new Date('2026-06-11T12:00:00Z'); // Thursday

function mkItem(partial: Partial<CoordinationItemLike>): CoordinationItemLike {
  return {
    id: 'i1',
    project_id: 'p1',
    title: 'Living-room rug',
    coordination_kind: 'selection',
    court: 'client',
    blocks_kind: 'none',
    status: 'pending',
    due_date: null,
    ...partial,
  };
}

function mkTask(partial: Partial<CoordinationTaskLike>): CoordinationTaskLike {
  return {
    id: 't1',
    title: 'Order the rug',
    status: 'todo',
    blocked_by_item_id: null,
    seq_after_task_id: null,
    ...partial,
  };
}

describe('groupByCourt', () => {
  it('buckets open items by court in COURT_ORDER (designer first), dropping empty courts', () => {
    const items = [
      mkItem({ id: 'a', court: 'vendor' }),
      mkItem({ id: 'b', court: 'designer' }),
      mkItem({ id: 'c', court: 'client' }),
    ];
    const groups = groupByCourt(items);
    expect(groups.map((g) => g.court)).toEqual(['designer', 'client', 'vendor']);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['b'], ['c'], ['a']]);
  });

  it('drops non-open (responded/draft/expired) items', () => {
    const items = [
      mkItem({ id: 'open', court: 'client', status: 'pending' }),
      mkItem({ id: 'done', court: 'client', status: 'responded' }),
      mkItem({ id: 'draft', court: 'client', status: 'draft' }),
      mkItem({ id: 'gone', court: 'client', status: 'expired' }),
    ];
    const groups = groupByCourt(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(['open']);
  });

  it('orders within a court by soonest due (nulls last), then title', () => {
    const items = [
      mkItem({ id: 'noDue', court: 'client', title: 'Zeta', due_date: null }),
      mkItem({ id: 'late', court: 'client', title: 'Beta', due_date: '2026-06-20T00:00:00Z' }),
      mkItem({ id: 'soon', court: 'client', title: 'Alpha', due_date: '2026-06-12T00:00:00Z' }),
    ];
    const [group] = groupByCourt(items);
    expect(group.items.map((i) => i.id)).toEqual(['soon', 'late', 'noDue']);
  });

  it('returns an empty array when nothing is open', () => {
    expect(groupByCourt([mkItem({ status: 'responded' })])).toEqual([]);
  });
});

describe('courtSummary', () => {
  it('counts open / overdue / next-due per court, in COURT_ORDER, including empty courts', () => {
    const items = [
      mkItem({ id: 'a', court: 'designer', due_date: '2026-06-01T00:00:00Z' }), // overdue
      mkItem({ id: 'b', court: 'designer', due_date: '2026-06-20T00:00:00Z' }),
      mkItem({ id: 'c', court: 'client', due_date: null }),
      mkItem({ id: 'r', court: 'gc', status: 'responded' }), // not open
    ];
    const summary = courtSummary(items, NOW);
    expect(summary.map((s) => s.court)).toEqual([...COURT_ORDER]);

    const designer = summary.find((s) => s.court === 'designer')!;
    expect(designer.open).toBe(2);
    expect(designer.overdue).toBe(1);
    expect(designer.nextDue).toBe(new Date('2026-06-01T00:00:00Z').toISOString());

    const client = summary.find((s) => s.court === 'client')!;
    expect(client).toMatchObject({ open: 1, overdue: 0, nextDue: null });

    const gc = summary.find((s) => s.court === 'gc')!;
    expect(gc).toMatchObject({ open: 0, overdue: 0, nextDue: null });
  });

  it('isHotCourt is true only for a designer court carrying open items', () => {
    const [designer, client] = courtSummary(
      [mkItem({ court: 'designer' }), mkItem({ court: 'client' })],
      NOW,
    );
    expect(isHotCourt(designer)).toBe(true);
    expect(isHotCourt(client)).toBe(false);
    expect(isHotCourt({ court: 'designer', open: 0, overdue: 0, nextDue: null })).toBe(false);
  });
});

describe('blocksText', () => {
  it('counts dependent tasks naming this item (singular/plural)', () => {
    const item = mkItem({ id: 'rfi1', coordination_kind: 'rfi', court: 'gc' });
    const oneTask = [mkTask({ id: 't1', blocked_by_item_id: 'rfi1' })];
    const twoTasks = [
      mkTask({ id: 't1', blocked_by_item_id: 'rfi1' }),
      mkTask({ id: 't2', blocked_by_item_id: 'rfi1' }),
      mkTask({ id: 't3', blocked_by_item_id: 'other' }),
    ];
    expect(blocksText(item, oneTask)).toBe('blocks 1 task');
    expect(blocksText(item, twoTasks)).toBe('blocks 2 tasks');
  });

  it('falls back to blocks_kind copy when no task rows are wired', () => {
    expect(blocksText(mkItem({ blocks_kind: 'ffe' }), [])).toBe('blocks an FF&E line');
    expect(blocksText(mkItem({ blocks_kind: 'task' }), [])).toBe('blocks downstream work');
    expect(blocksText(mkItem({ blocks_kind: 'phase' }), [])).toBe('blocks this phase');
  });

  it('returns null when there is nothing to block', () => {
    expect(blocksText(mkItem({ blocks_kind: 'none' }), [])).toBeNull();
  });

  it('a resolved item blocks nothing', () => {
    const item = mkItem({ id: 'r', status: 'responded', blocks_kind: 'phase' });
    expect(blocksText(item, [mkTask({ blocked_by_item_id: 'r' })])).toBeNull();
  });

  it('prefers the real task count over the blocks_kind fallback', () => {
    const item = mkItem({ id: 'i', blocks_kind: 'phase' });
    expect(blocksText(item, [mkTask({ blocked_by_item_id: 'i' })])).toBe('blocks 1 task');
  });
});

describe('isBlocked', () => {
  it('blocked by an open coordination item carries its id + court', () => {
    const items = [mkItem({ id: 'rfi1', court: 'gc', status: 'pending' })];
    const task = mkTask({ id: 't', status: 'blocked', blocked_by_item_id: 'rfi1' });
    const state = isBlocked(task, items, [task]);
    expect(state).toMatchObject({
      byItem: true,
      bySeq: false,
      any: true,
      blockingItemId: 'rfi1',
      blockingItemCourt: 'gc',
      waitingOnTaskId: null,
    });
  });

  it('a resolved blocker no longer blocks (recomputes to unblocked)', () => {
    const items = [mkItem({ id: 'rfi1', status: 'responded' })];
    const task = mkTask({ id: 't', status: 'todo', blocked_by_item_id: 'rfi1' });
    const state = isBlocked(task, items, [task]);
    expect(state.byItem).toBe(false);
    expect(state.any).toBe(false);
    expect(state.blockingItemId).toBeNull();
  });

  it('blocked by an unfinished trade-sequence predecessor', () => {
    const pre = mkTask({ id: 'demo', title: 'Demo', status: 'todo' });
    const task = mkTask({ id: 'install', title: 'Install', seq_after_task_id: 'demo' });
    const state = isBlocked(task, [], [pre, task]);
    expect(state).toMatchObject({
      byItem: false,
      bySeq: true,
      any: true,
      waitingOnTaskId: 'demo',
    });
  });

  it('a done predecessor frees the sequenced task', () => {
    const pre = mkTask({ id: 'demo', status: 'done' });
    const task = mkTask({ id: 'install', seq_after_task_id: 'demo' });
    const state = isBlocked(task, [], [pre, task]);
    expect(state.bySeq).toBe(false);
    expect(state.any).toBe(false);
    expect(state.waitingOnTaskId).toBeNull();
  });

  it('both reasons can hold at once (any = true)', () => {
    const items = [mkItem({ id: 'rfi1', status: 'pending', court: 'gc' })];
    const pre = mkTask({ id: 'demo', status: 'todo' });
    const task = mkTask({
      id: 'install',
      status: 'blocked',
      blocked_by_item_id: 'rfi1',
      seq_after_task_id: 'demo',
    });
    const state = isBlocked(task, items, [pre, task]);
    expect(state.byItem).toBe(true);
    expect(state.bySeq).toBe(true);
    expect(state.any).toBe(true);
  });

  it('a task with no dependencies is never blocked', () => {
    const state = isBlocked(mkTask({}), [], []);
    expect(state.any).toBe(false);
  });
});

describe('dueState', () => {
  it('soon when due today, in the past, or within the next 2 days', () => {
    expect(dueState('2026-06-01', NOW)).toBe('soon'); // past
    expect(dueState('2026-06-11', NOW)).toBe('soon'); // today
    expect(dueState('2026-06-13', NOW)).toBe('soon'); // +2 days
  });

  it('ok when comfortably in the future', () => {
    expect(dueState('2026-06-20', NOW)).toBe('ok');
  });

  it('ok when there is no due date', () => {
    expect(dueState(null, NOW)).toBe('ok');
    expect(dueState(undefined, NOW)).toBe('ok');
  });

  it('parses bare YYYY-MM-DD as local midnight (no timezone day-slip)', () => {
    // A bare date 2 days out is still "soon" regardless of offset.
    expect(dueState('2026-06-13', NOW)).toBe('soon');
  });
});
