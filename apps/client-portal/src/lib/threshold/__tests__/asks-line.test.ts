import type { Invoice } from '@patina/supabase';
import { asksLine, galleryHeadline, urgentInvoice } from '../asks-line';
import { invoiceProjection } from '../invoice-rollup';
import type { ClientProjectEditorial } from '@/lib/editorial/types';

const today = new Date(2026, 9, 24, 12);
const invoice = (id: string, cents: number, due: string): Invoice => ({
  id, project_id: 'house', status: 'sent', total_cents: cents, amount_paid_cents: 0,
  currency: 'USD', due_date: due, payments: [],
} as unknown as Invoice);
const project = (rows: Invoice[] = []) => invoiceProjection(rows, { today, read: 'complete' });
const edition = (headline: string) => ({
  edition: { id: 'edition' }, composition: { chapters: [{ key: 'cover', headline }] },
} as unknown as ClientProjectEditorial);

describe('Gallery live asks line', () => {
  it('names only the most urgent balance and the sofa, not the open total', () => {
    const rows = project([invoice('soon', 77500, '2026-11-01'), invoice('late', 60000, '2026-10-20')]);
    expect(asksLine(rows, ['the sofa'], 'Maren')).toBe('$600.00 past due, and the sofa.');
    expect(urgentInvoice(rows)?.invoice.id).toBe('late');
  });
  it('counts several overdue invoices while naming only the first amount', () => {
    const rows = project([invoice('first', 70000, '2026-10-19'), invoice('second', 10000, '2026-10-20')]);
    expect(asksLine(rows, ['the sofa'], 'Maren')).toBe('Two invoices past due, $700.00, and the sofa.');
  });
  it('says due today only when no invoice is past due', () => {
    expect(asksLine(project([invoice('today', 10000, '2026-10-24')]), ['the sofa'], 'Maren'))
      .toBe('$100.00 due today, and the sofa.');
  });
  it('gives a personal all-clear only when every read is complete and nothing is owed', () => {
    expect(asksLine(project(), [], 'Maren')).toBe('Nothing from Maren today');
    expect(asksLine(project(), [], null)).toBe('Nothing from your designer today');
    expect(urgentInvoice(project())).toBeNull();
    expect(asksLine(invoiceProjection([], { today, read: 'loading' }), [], 'Maren')).toBeNull();
    expect(asksLine(project(), [], 'Maren', false)).toBeNull();
    expect(asksLine(invoiceProjection([], { today, read: 'failed' }), [], 'Maren'))
      .toBe('Please check your invoices and asks.');
  });
  it('keeps approval-only and additional asks visible without making up an amount', () => {
    expect(asksLine(project(), ['the sofa'], 'Maren')).toBe('The sofa.');
    expect(asksLine(project(), ['the sofa', 'the scope change'], 'Maren')).toContain('one more ask');
    expect(asksLine(project([invoice('later', 12000, '2026-11-01')]), [], 'Maren')).toBe('$120.00 to pay.');
  });
});

describe('Gallery band headline', () => {
  it('uses the approved cover headline, but falls back for oversized or absent editions', () => {
    expect(galleryHeadline(edition('Your sideboard, on the bench.'), 'Elm Street')).toBe('Your sideboard, on the bench.');
    expect(galleryHeadline(edition('One two three four five six seven'), 'Elm Street')).toBe('Elm Street');
    expect(galleryHeadline(edition('An extraordinarily long headline for home.'), 'Elm Street')).toBe('Elm Street');
    expect(galleryHeadline({ ...edition('A house'), edition: undefined }, 'Elm Street')).toBe('Elm Street');
    expect(galleryHeadline(null, 'Elm Street')).toBe('Elm Street');
  });
});
