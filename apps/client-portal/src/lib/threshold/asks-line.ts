import { formatCurrency } from '@patina/shared';

import { countInWords } from '@/components/threshold/instruments/standing-sentence';
import type { ClientProjectEditorial } from '@/lib/editorial/types';
import type { InvoiceProjection, InvoiceRow } from './invoice-rollup';

function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dueWords(row: InvoiceRow): string {
  if (row.dueState === 'past_due') return 'past due';
  return row.dueState === 'due_today' ? 'due today' : 'to pay';
}

function moneyPhrase(invoices: InvoiceProjection): string | null {
  const urgent = urgentInvoice(invoices);
  if (!urgent) return null;
  const amount = formatCurrency(urgent.balanceCents, urgent.currency);
  const overdue = invoices.payable.filter((row) => row.dueState === 'past_due');
  return overdue.length > 1
    ? `${sentenceStart(countInWords(overdue.length))} invoices past due, ${amount}`
    : `${amount} ${dueWords(urgent)}`;
}

function askPhrase(asks: readonly string[]): string | null {
  const waiting = asks.map((ask) => ask.trim()).filter(Boolean);
  if (!waiting.length) return null;
  if (waiting.length === 1) return waiting[0];
  const noun = waiting.length === 2 ? 'ask' : 'asks';
  return `${waiting[0]}, and ${countInWords(waiting.length - 1)} more ${noun}`;
}

function joinAsks(money: string | null, ask: string | null, quiet: string): string {
  if (money) return `${money}${ask ? `, and ${ask}` : ''}.`;
  return ask ? `${sentenceStart(ask)}.` : quiet;
}

function noAsksLine(invoices: InvoiceProjection, designer: string | null): string {
  if (invoices.outstanding.length > 0) return 'Your invoices are in progress or need review.';
  return `Nothing from ${designer?.trim() || 'your designer'} today`;
}

/** The band never speaks for another house, or invents an all-clear before reads settle. */
export function asksLine(
  invoices: InvoiceProjection,
  asks: readonly string[],
  designerGivenName: string | null,
  asksReady = true,
): string | null {
  if (invoices.read === 'loading' || !asksReady) return null;
  if (invoices.withheld || invoices.read !== 'complete') return 'Please check your invoices and asks.';
  return joinAsks(moneyPhrase(invoices), askPhrase(asks), noAsksLine(invoices, designerGivenName));
}

export function urgentInvoice(invoices: InvoiceProjection): InvoiceRow | null {
  return invoices.payable.find((row) => row.dueState === 'past_due') ?? invoices.payable[0] ?? null;
}

/** Existing editions remain readable; an oversized cover line yields to the house name. */
export function galleryHeadline(editorial: ClientProjectEditorial | null | undefined, houseName: string): string {
  const headline = editorial?.edition && editorial.composition?.chapters.find((chapter) => chapter.key === 'cover')?.headline?.trim();
  return headline && headline.length <= 40 && headline.split(/\s+/).length <= 6 ? headline : houseName;
}
