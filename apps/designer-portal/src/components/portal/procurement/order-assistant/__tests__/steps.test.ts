/**
 * W3-T3b — Order Assistant v2 step machine + coverage-chip derivation.
 *
 * Pure-function tests: the machine (types.ts) and chip derivation
 * (step-coverage.tsx) are dependency-light by design so the flow contract is
 * pinned without rendering the panel (the full order-flow e2e spec lands in
 * W3-T5).
 */

import {
  nextStep,
  prevStep,
  stepSequence,
  type OrderAssistantStep,
} from '../types';
import { deriveCoverageChip, uncoveredItems } from '../step-coverage';
import type { FfeItemCoverage } from '@patina/supabase';

const external = { isCatalog: false };
const catalog = { isCatalog: true };

describe('Order Assistant step machine', () => {
  it('external flow: review → coverage → details → (submit)', () => {
    expect(nextStep('review', external)).toBe('coverage');
    expect(nextStep('coverage', external)).toBe('details');
    expect(nextStep('details', external)).toBeNull(); // details is the submit step
  });

  it('catalog flow skips details: review → coverage → (one-click submit)', () => {
    expect(nextStep('review', catalog)).toBe('coverage');
    expect(nextStep('coverage', catalog)).toBeNull(); // coverage is the submit step
  });

  it('back navigation mirrors the forward flow', () => {
    expect(prevStep('details', external)).toBe('coverage');
    expect(prevStep('coverage', external)).toBe('review');
    expect(prevStep('coverage', catalog)).toBe('review');
    expect(prevStep('review', external)).toBeNull();
  });

  it('created is terminal in both directions', () => {
    expect(nextStep('created', external)).toBeNull();
    expect(nextStep('created', catalog)).toBeNull();
    expect(prevStep('created', external)).toBeNull();
  });

  it('stepSequence drives the progress indicator', () => {
    expect(stepSequence(external)).toEqual<OrderAssistantStep[]>([
      'review',
      'coverage',
      'details',
    ]);
    expect(stepSequence(catalog)).toEqual<OrderAssistantStep[]>([
      'review',
      'coverage',
    ]);
  });
});

describe('deriveCoverageChip (00187 invoice coverage)', () => {
  const cov = (over: Partial<FfeItemCoverage>): FfeItemCoverage => ({
    coverage: 'uninvoiced',
    invoiceId: null,
    invoiceNumber: null,
    invoiceStatus: null,
    billedCents: null,
    ...over,
  });

  it('treats a MISSING coverage entry as Not invoiced (display only, never a hard gate)', () => {
    expect(deriveCoverageChip(undefined)).toEqual({
      kind: 'not_invoiced',
      label: 'Not invoiced',
    });
  });

  it('maps uninvoiced → Not invoiced', () => {
    expect(deriveCoverageChip(cov({ coverage: 'uninvoiced' }))?.kind).toBe(
      'not_invoiced'
    );
  });

  it('returns null (covered, no chip) for paid coverage', () => {
    expect(
      deriveCoverageChip(cov({ coverage: 'paid', invoiceStatus: 'paid' }))
    ).toBeNull();
  });

  it('refines invoiced coverage by invoice status', () => {
    expect(
      deriveCoverageChip(cov({ coverage: 'invoiced', invoiceStatus: 'draft' }))
    ).toEqual({ kind: 'draft', label: 'Draft invoice' });
    expect(
      deriveCoverageChip(cov({ coverage: 'invoiced', invoiceStatus: 'sent' }))
    ).toEqual({ kind: 'sent_unpaid', label: 'Invoice sent — unpaid' });
    expect(
      deriveCoverageChip(
        cov({ coverage: 'invoiced', invoiceStatus: 'partially_paid' })
      )
    ).toEqual({ kind: 'partially_paid', label: 'Partially paid' });
  });

  it('falls back to sent-unpaid when an invoiced row has an unexpected status', () => {
    expect(
      deriveCoverageChip(cov({ coverage: 'invoiced', invoiceStatus: null }))?.kind
    ).toBe('sent_unpaid');
  });
});

describe('uncoveredItems', () => {
  const item = (id: string) => ({ id, name: id, line_total_cents: 1000 });

  it('lists only items not covered by a paid invoice, preserving order', () => {
    const coverage = {
      a: {
        coverage: 'paid' as const,
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-1',
        invoiceStatus: 'paid' as const,
        billedCents: 1000,
      },
      b: {
        coverage: 'invoiced' as const,
        invoiceId: 'inv-2',
        invoiceNumber: 'INV-2',
        invoiceStatus: 'sent' as const,
        billedCents: 1000,
      },
    };
    const result = uncoveredItems([item('a'), item('b'), item('c')], coverage);
    expect(result.map((r) => r.item.id)).toEqual(['b', 'c']);
    expect(result[0].chip.kind).toBe('sent_unpaid');
    expect(result[1].chip.kind).toBe('not_invoiced'); // missing key
  });

  it('returns empty when everything is paid', () => {
    const coverage = {
      a: {
        coverage: 'paid' as const,
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-1',
        invoiceStatus: 'paid' as const,
        billedCents: 1000,
      },
    };
    expect(uncoveredItems([item('a')], coverage)).toEqual([]);
  });
});
