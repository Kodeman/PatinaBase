import {
  deriveKindLine,
  isResolved,
  marginAccent,
  partitionMargin,
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
    expect(marginAccent('note').border).toBe('var(--color-aged-oak)');
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

  it('note states (R14)', () => {
    expect(deriveKindLine(mkItem({ kind: 'note', state: 'open' }))).toBe('Note');
    expect(
      deriveKindLine(
        mkItem({ kind: 'note', state: 'open', payload: { due_date: '2026-06-14T12:00:00Z' } }),
      ),
    ).toBe('Note · due Jun 14');
    expect(deriveKindLine(mkItem({ kind: 'note', state: 'escalated' }))).toBe('Note · escalated');
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
    expect(isResolved(mkItem({ kind: 'note', state: 'escalated' }))).toBe(true);
    expect(isResolved(mkItem({ kind: 'note', state: 'open' }))).toBe(false);
  });

  it('R33 F1: a studio-authored latest post (own_voice) is pre-settled', () => {
    expect(
      isResolved(mkItem({ kind: 'message', state: 'read', payload: { own_voice: true } })),
    ).toBe(true);
    expect(
      isResolved(mkItem({ kind: 'message', state: 'read', payload: { own_voice: false } })),
    ).toBe(false);
    expect(isResolved(mkItem({ kind: 'message', state: 'read', payload: {} }))).toBe(false);
  });
});

describe('partitionMargin — own voice (R33 F1)', () => {
  it('sinks a studio-authored thread into the Settled fold, never needs-action', () => {
    const ownPulseMirror = mkItem({
      item_id: 'own',
      kind: 'message',
      state: 'read',
      payload: { own_voice: true, sender_name: 'Leah Hartwell' },
      ts: '2026-06-11T10:00:00Z',
    });
    const clientMsg = mkItem({
      item_id: 'client',
      kind: 'message',
      state: 'unread',
      payload: { own_voice: false, sender_name: 'Sarah Whitfield' },
      ts: '2026-06-11T09:00:00Z',
    });
    const { raised, settled } = partitionMargin([ownPulseMirror, clientMsg], NOW);
    expect(settled.map((i) => i.item_id)).toEqual(['own']);
    expect(raised.map((i) => i.item_id)).toEqual(['client']);
  });
});

describe('partitionMargin (R12)', () => {
  it('floats needs-action, folds resolved into settled', () => {
    const overdue = mkItem({ item_id: 'a', state: 'overdue', ts: '2026-06-01T00:00:00Z' });
    const activeMsg = mkItem({
      item_id: 'b',
      kind: 'message',
      state: 'unread',
      ts: '2026-06-11T09:00:00Z',
    });
    const resolved = mkItem({ item_id: 'd', state: 'responded', ts: '2026-06-11T11:00:00Z' });

    const { raised, settled } = partitionMargin([resolved, activeMsg, overdue], NOW);
    expect(raised.map((i) => i.item_id)).toEqual(['a', 'b']);
    expect(settled.map((i) => i.item_id)).toEqual(['d']);
  });

  it('ranks needs-action like the Desk: overdue decision → dued note, most overdue first', () => {
    const duedNote = mkItem({
      item_id: 'n1',
      kind: 'note',
      state: 'due',
      ts: '2026-06-02T00:00:00Z',
    });
    const overdueOld = mkItem({ item_id: 'a1', state: 'overdue', ts: '2026-06-01T00:00:00Z' });
    const overdueNew = mkItem({ item_id: 'a2', state: 'overdue', ts: '2026-06-08T00:00:00Z' });

    const { raised } = partitionMargin([duedNote, overdueNew, overdueOld], NOW);
    expect(raised.map((i) => i.item_id)).toEqual(['a1', 'a2', 'n1']);
  });

  it('orders active items by anchor position down the paper: letterhead → section → lines in rendered order', () => {
    const onLine2 = mkItem({
      item_id: 'l2',
      state: 'pending',
      anchor_kind: 'line',
      anchor_id: 'ffe-2',
      ts: '2026-06-11T09:00:00Z',
    });
    const onLine0 = mkItem({
      item_id: 'l0',
      state: 'pending',
      anchor_kind: 'line',
      anchor_id: 'ffe-0',
      ts: '2026-06-01T09:00:00Z',
    });
    const onSection = mkItem({
      item_id: 's',
      kind: 'pulse',
      state: 'draft',
      anchor_kind: 'section',
      ts: '2026-06-10T09:00:00Z',
    });
    const onLetterhead = mkItem({
      item_id: 'h',
      kind: 'message',
      state: 'unread',
      anchor_kind: 'letterhead',
      ts: '2026-06-02T09:00:00Z',
    });

    const lineRank = new Map([
      ['ffe-0', 0],
      ['ffe-2', 2],
    ]);
    const { raised } = partitionMargin([onLine2, onLetterhead, onLine0, onSection], NOW, {
      lineRank,
    });
    expect(raised.map((i) => i.item_id)).toEqual(['h', 's', 'l0', 'l2']);
  });

  it('within one anchor, newest first; unknown line anchors sink in the line band', () => {
    const newer = mkItem({
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
    const unknownLine = mkItem({
      item_id: 'x',
      state: 'pending',
      anchor_kind: 'line',
      anchor_id: 'ffe-missing',
      ts: '2026-06-11T10:00:00Z',
    });
    const knownLine = mkItem({
      item_id: 'k',
      state: 'pending',
      anchor_kind: 'line',
      anchor_id: 'ffe-0',
      ts: '2026-06-01T10:00:00Z',
    });

    const { raised } = partitionMargin([unknownLine, older, newer, knownLine], NOW, {
      lineRank: new Map([['ffe-0', 0]]),
    });
    expect(raised.map((i) => i.item_id)).toEqual(['b', 'c', 'k', 'x']);
  });

  it('the Pulse floats only Friday onward, like the Desk (D5)', () => {
    // NOW is Thursday 2026-06-11; week_of Monday 2026-06-08 → Friday Jun 12.
    const pulse = mkItem({
      item_id: 'p',
      kind: 'pulse',
      state: 'due',
      anchor_kind: 'section',
      ts: '2026-06-08T00:00:00Z',
      payload: { week_of: '2026-06-08' },
    });
    const letterheadMsg = mkItem({
      item_id: 'b',
      kind: 'message',
      state: 'unread',
      anchor_kind: 'letterhead',
      ts: '2026-06-11T09:00:00Z',
    });

    const thursday = partitionMargin([pulse, letterheadMsg], NOW);
    expect(thursday.raised.map((i) => i.item_id)).toEqual(['b', 'p']);

    const friday = partitionMargin([pulse, letterheadMsg], new Date('2026-06-12T14:00:00Z'));
    expect(friday.raised.map((i) => i.item_id)).toEqual(['p', 'b']);
  });

  it('settled orders newest first', () => {
    const oldResolved = mkItem({ item_id: 'r1', state: 'responded', ts: '2026-06-01T00:00:00Z' });
    const newResolved = mkItem({
      item_id: 'r2',
      kind: 'note',
      state: 'escalated',
      ts: '2026-06-10T00:00:00Z',
    });
    const { settled } = partitionMargin([oldResolved, newResolved], NOW);
    expect(settled.map((i) => i.item_id)).toEqual(['r2', 'r1']);
  });
});
