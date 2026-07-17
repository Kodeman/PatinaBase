import { describe, it, expect } from 'vitest';
import { resolveDragOutcome, type DragLineState } from '../drag';

const mapped = (over: Partial<DragLineState> = {}): DragLineState => ({
  vendorId: 'v-A',
  unitCostCents: 100_000,
  mappingState: 'mapped',
  poId: null,
  ...over,
});
const unmapped = (over: Partial<DragLineState> = {}): DragLineState => ({
  vendorId: null,
  unitCostCents: null,
  mappingState: 'unmapped',
  poId: null,
  ...over,
});

describe('resolveDragOutcome', () => {
  it('no target → noop', () => {
    expect(resolveDragOutcome(null, mapped())).toEqual({ action: 'noop' });
    expect(resolveDragOutcome(undefined, mapped())).toEqual({ action: 'noop' });
  });

  it('drop on a different real PO → move', () => {
    expect(resolveDragOutcome('po:X', mapped({ poId: 'A' }))).toEqual({
      action: 'move',
      poId: 'X',
    });
  });

  it('drop on the line’s own real PO → noop', () => {
    expect(resolveDragOutcome('po:A', mapped({ poId: 'A' }))).toEqual({ action: 'noop' });
  });

  it('drop on the new-PO target → popover (no default vendor)', () => {
    expect(resolveDragOutcome('new', mapped())).toEqual({ action: 'popover' });
  });

  it('mapped line onto a different vendor group → reassign, carrying its cost', () => {
    expect(resolveDragOutcome('vendor:v-B', mapped({ vendorId: 'v-A', unitCostCents: 336_000 }))).toEqual({
      action: 'assign',
      vendorId: 'v-B',
      unitCostCents: 336_000,
    });
  });

  it('mapped line dropped on its own vendor group → noop', () => {
    expect(resolveDragOutcome('vendor:v-A', mapped({ vendorId: 'v-A' }))).toEqual({ action: 'noop' });
  });

  it('unmapped line onto a vendor group → popover prefilled with that vendor', () => {
    expect(resolveDragOutcome('vendor:v-B', unmapped())).toEqual({
      action: 'popover',
      defaultVendorId: 'v-B',
    });
  });

  it('mapped-but-costless line onto a vendor → popover (needs a real cost)', () => {
    expect(
      resolveDragOutcome('vendor:v-B', mapped({ vendorId: 'v-A', unitCostCents: null })),
    ).toEqual({ action: 'popover', defaultVendorId: 'v-B' });
  });

  it('unknown target → noop', () => {
    expect(resolveDragOutcome('garbage', mapped())).toEqual({ action: 'noop' });
  });
});
