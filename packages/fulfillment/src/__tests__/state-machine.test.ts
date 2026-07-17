import { describe, it, expect } from 'vitest';
import {
  LINE_CHAIN,
  PO_CHAIN,
  LINE_TRANSITIONS,
  PO_TRANSITIONS,
  canLineTransition,
  canPoTransition,
} from '../state-machine';

describe('fulfillment line state machine', () => {
  it('has exactly the 9-state chain (8 forward + cancelled)', () => {
    expect(LINE_CHAIN).toEqual([
      'intake', 'split', 'transmitted', 'acknowledged',
      'in_production', 'shipped', 'delivered', 'settled',
    ]);
    expect(Object.keys(LINE_TRANSITIONS)).toContain('cancelled');
    expect(Object.keys(LINE_TRANSITIONS).length).toBe(9);
  });

  it('permits exactly one forward step per state', () => {
    expect(canLineTransition('intake', 'split')).toBe(true);
    expect(canLineTransition('split', 'transmitted')).toBe(true);
    expect(canLineTransition('delivered', 'settled')).toBe(true);
    expect(canLineTransition('intake', 'transmitted')).toBe(false); // skip
    expect(canLineTransition('settled', 'intake')).toBe(false);     // backward
    expect(canLineTransition('settled', 'cancelled')).toBe(false);  // terminal
  });

  it('allows cancelled only from pre-shipped line states', () => {
    for (const s of ['intake', 'split', 'transmitted', 'acknowledged', 'in_production'] as const) {
      expect(canLineTransition(s, 'cancelled')).toBe(true);
    }
    for (const s of ['shipped', 'delivered', 'settled'] as const) {
      expect(canLineTransition(s, 'cancelled')).toBe(false);
    }
  });
});

describe('fulfillment PO state machine', () => {
  it('has the 7 forward states + cancelled', () => {
    expect(PO_CHAIN).toEqual([
      'draft', 'sent', 'acknowledged', 'in_production',
      'shipped', 'delivered', 'settled',
    ]);
    expect(Object.keys(PO_TRANSITIONS).length).toBe(8);
  });

  it('one step forward; cancelled only pre-shipped', () => {
    expect(canPoTransition('draft', 'sent')).toBe(true);
    expect(canPoTransition('sent', 'delivered')).toBe(false);
    expect(canPoTransition('draft', 'cancelled')).toBe(true);
    expect(canPoTransition('shipped', 'cancelled')).toBe(false);
  });
});
