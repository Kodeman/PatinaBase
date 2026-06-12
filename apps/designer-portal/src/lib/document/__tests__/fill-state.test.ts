import { deriveFillState, fillStateForDesk } from '../fill-state';
import type { SpineSection, SectionState } from '../section-derivation';
import type { DocumentStateRow, SectionKey } from '../desk-derivation';

const KEYS: SectionKey[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
  'care',
];

function mk(states: SectionState[]): SpineSection[] {
  return KEYS.map((key, i) => ({ key, label: key, state: states[i], sub: '' }));
}

describe('deriveFillState (R15)', () => {
  it('signed project mid-delivery: shaping full, committed, delivery partial', () => {
    const s = mk(['settled', 'settled', 'settled', 'settled', 'active', 'future', 'future']);
    expect(deriveFillState(s)).toEqual([1, 1, 0.5 / 3]);
  });

  it('fresh lead: only shaping has begun', () => {
    const s = mk(['active', 'future', 'future', 'future', 'future', 'future', 'future']);
    expect(deriveFillState(s)).toEqual([0.5 / 3, 0, 0]);
  });

  it('sent proposal: shaping full, commitment half', () => {
    const s = mk(['settled', 'settled', 'settled', 'active', 'future', 'future', 'future']);
    expect(deriveFillState(s)).toEqual([1, 0.5, 0]);
  });

  it('completed project: everything full except Care never settles (active forever)', () => {
    const s = mk(['settled', 'settled', 'settled', 'settled', 'settled', 'settled', 'active']);
    expect(deriveFillState(s)).toEqual([1, 1, 2.5 / 3]);
  });

  it('manual project ghosts do not fill shaping', () => {
    const s = mk(['future', 'future', 'future', 'future', 'active', 'future', 'future']);
    expect(deriveFillState(s)).toEqual([0, 0, 0.5 / 3]);
  });
});

describe('fillStateForDesk', () => {
  it('approximates from active_section alone', () => {
    const row = { active_section: 'project' } as DocumentStateRow;
    expect(fillStateForDesk(row)).toEqual([1, 1, 0.5 / 3]);
  });

  it('lead-shaped rows barely fill line one', () => {
    const row = { active_section: 'brief' } as DocumentStateRow;
    expect(fillStateForDesk(row)).toEqual([0.5 / 3, 0, 0]);
  });
});
