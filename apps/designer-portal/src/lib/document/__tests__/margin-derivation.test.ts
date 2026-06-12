import {
  deriveKindLine,
  isResolved,
  marginAccent,
  orderMarginItems,
  type MarginItemRow,
} from '../margin-derivation';

const NOW = new Date('2026-06-11T12:00:00Z');

function mkItem(partial: Partial<MarginItemRow>): MarginItemRow {
  return {
    kind: 'decision',
    item_id: 'm1',
    project_id: 'p1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'pending',
    title: 'Rug · 3 options',
    detail: '',
    ts: '2026-06-10T12:00:00Z',
    payload: {},
    ...partial,
  };
}

describe('marginAccent', () => {
  it('maps the five kinds to the prototype palette', () => {
    expect(marginAccent('decision').border).toBe('var(--color-golden-hour)');
    expect(marginAccent('message').border).toBe('var(--color-dusty-blue)');
    expect(marginAccent('invoice').border).toBe('var(--color-clay)');
    expect(marginAccent('pulse').border).toBe('var(--color-sage)');
    expect(marginAccent('time').border).toBe('var(--color-mocha)');
  });
});

describe('deriveKindLine', () => {
  it('decision states', () => {
    expect(
      deriveKindLine(mkItem({ state: 'pending', payload: { due_date: '2026-06-14T12:00:00Z' } })),
    ).toBe('Decision · due Jun 14');
    expect(deriveKindLine(mkItem({ state: 'pending' }))).toBe('Decision');
    expect(deriveKindLine(mkItem({ state: 'overdue' }))).toBe('Decision · overdue');
    expect(deriveKindLine(mkItem({ state: 'responded' }))).toBe('Decision · responded');
    expect(deriveKindLine(mkItem({ state: 'expired' }))).toBe('Decision · expired');
  });

  it('message states carry the sender', () => {
    expect(
      deriveKindLine(
        mkItem({ kind: 'message', state: 'unread', payload: { sender_name: 'Sarah W' } }),
      ),
    ).toBe('Message · Sarah W');
    expect(deriveKindLine(mkItem({ kind: 'message', state: 'read', payload: {} }))).toBe('Message');
  });

  it('invoice states read as Money', () => {
    expect(deriveKindLine(mkItem({ kind: 'invoice', state: 'draft' }))).toBe('Money · draft');
    expect(deriveKindLine(mkItem({ kind: 'invoice', state: 'sent' }))).toBe('Money · sent');
    expect(deriveKindLine(mkItem({ kind: 'invoice', state: 'partially_paid' }))).toBe(
      'Money · partially paid',
    );
  });

  it('pulse states', () => {
    expect(deriveKindLine(mkItem({ kind: 'pulse', state: 'due' }))).toBe(
      'Friday Pulse · draft ready',
    );
    expect(deriveKindLine(mkItem({ kind: 'pulse', state: 'sent' }))).toBe('Friday Pulse · sent');
    expect(deriveKindLine(mkItem({ kind: 'pulse', state: 'draft' }))).toBe('Friday Pulse · draft');
  });

  it('time uses its title verbatim', () => {
    expect(deriveKindLine(mkItem({ kind: 'time', title: 'Time · Jun 10' }))).toBe('Time · Jun 10');
  });
});

describe('isResolved', () => {
  it('responded decisions and sent pulses sink; unread messages and sent invoices do not', () => {
    expect(isResolved(mkItem({ state: 'responded' }))).toBe(true);
    expect(isResolved(mkItem({ kind: 'pulse', state: 'sent' }))).toBe(true);
    expect(isResolved(mkItem({ kind: 'message', state: 'unread' }))).toBe(false);
    expect(isResolved(mkItem({ kind: 'invoice', state: 'sent' }))).toBe(false);
    expect(isResolved(mkItem({ state: 'expired' }))).toBe(false);
  });
});

describe('orderMarginItems', () => {
  it('pins overdue decisions, sorts active by ts desc, sinks resolved', () => {
    const overdue = mkItem({ item_id: 'a', state: 'overdue', ts: '2026-06-01T00:00:00Z' });
    const newest = mkItem({
      item_id: 'b',
      kind: 'message',
      state: 'unread',
      ts: '2026-06-11T09:00:00Z',
    });
    const older = mkItem({
      item_id: 'c',
      kind: 'invoice',
      state: 'draft',
      ts: '2026-06-09T09:00:00Z',
    });
    const resolved = mkItem({ item_id: 'd', state: 'responded', ts: '2026-06-11T11:00:00Z' });

    const ordered = orderMarginItems([resolved, older, newest, overdue], NOW);
    expect(ordered.map((i) => i.item_id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
