/**
 * Trade Agreement guest page (P14, R16).
 *
 * A login-less, mobile-first page a subcontractor opens from the link their
 * studio sends. No session: the token is resolved SERVER-SIDE through
 * resolve_trade_agreement_link() using the service client, per the proven
 * apps/client-portal/src/app/rfq/[token]/page.tsx pattern — force-dynamic,
 * service client, single RPC read, 404 on any miss.
 *
 * resolve_trade_agreement_link answers NULL for every non-answerable state —
 * a garbage or unknown token, a revoked one (a signed agreement's link is
 * spent in the same transaction as the signature), an expired one, a still
 * draft agreement that was never sent, and a voided one. A dead link
 * therefore never confirms it once existed, and this page renders no
 * "this link was used" sentence of its own; the withdrawn sentence belongs to
 * the ACTION's agreement_void outcome (see trade-agreement-signature.tsx),
 * reached only through a still-live token whose agreement was withdrawn after
 * the page had already loaded.
 *
 * The DTO carries the sub's OWN price and nothing else that is money (R13):
 * no client price, no GMP, no schedule of values, no draw, no other sub, no
 * bid ledger, and no project name — a project name routinely carries the
 * client's surname. This page renders exactly the keys types.ts types and
 * nothing a stray extra field on the response object could add (pinned in
 * page.test.tsx).
 *
 * Route shape: /trade/[token] is NOT the authenticated client surface R135/V8
 * rules to one page. It is a seventh bearer-token GUEST prefix beside /share,
 * /field, /rfq, /evidence, /plans and /pay, and is exempt for the same reason
 * those six are.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@patina/supabase/server';
import { TradeAgreementSignature } from './trade-agreement-signature';
import {
  formatMoney,
  insuranceLine,
  isLikelyTradeAgreementToken,
  lienWaiverLine,
  paymentLine,
  retainageLine,
  scheduleLine,
  type TradeAgreementLinkDTO,
} from './types';

// The agreement's state and any existing signature are read fresh every
// request — never static.
export const dynamic = 'force-dynamic';

// A bearer-token guest URL must never be indexed or followed out to a search
// engine (mirrors rfq/[token]/page.tsx).
export const metadata: Metadata = {
  title: 'Trade Agreement · Patina',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="type-body mt-1 whitespace-pre-line">{children}</p>
    </div>
  );
}

export default async function TradeAgreementLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Cheap format gate before any DB round-trip — an obviously malformed
  // token was never a real link.
  if (!isLikelyTradeAgreementToken(token)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;
  const { data, error } = await admin.rpc('resolve_trade_agreement_link', { p_token: token });
  const dto = error ? null : ((Array.isArray(data) ? data[0] : data) as TradeAgreementLinkDTO | null);

  // NULL on any non-answerable state — never distinguish which, so a dead
  // link reads identically to one that never existed.
  if (!dto) notFound();

  const studioLabel = dto.studioName ?? 'Patina';
  const schedule = scheduleLine(dto.schedule);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-primary)] px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="type-meta">{studioLabel} · Trade Agreement</p>
        <h1 className="type-page-title mt-1" style={{ fontSize: 'clamp(1.5rem, 6vw, 2.1rem)' }}>
          {dto.agreementTitle ?? 'Trade Agreement'}
        </h1>
        {dto.contactDisplayName && (
          <p className="type-body-small mt-2 text-[var(--text-muted)]">{dto.contactDisplayName}</p>
        )}
      </header>

      <section className="mb-8 space-y-5" aria-label="The agreement">
        <Term label="Scope">{dto.scope}</Term>
        <Term label="Price">{formatMoney(dto.priceCents, dto.currency)}</Term>
        {(schedule || dto.schedule?.sequencing) && (
          <Term label="Schedule">
            {[schedule, dto.schedule?.sequencing].filter(Boolean).join('\n')}
          </Term>
        )}
        <Term label="Retainage">{retainageLine(dto.retainageBps)}</Term>
        <Term label="Payment">{paymentLine(dto.payWhenPaidDays)}</Term>
        <Term label="Insurance">{insuranceLine(dto.insuranceCertificateRequired)}</Term>
        <Term label="Lien waivers">{lienWaiverLine(dto.lienWaiverPolicy)}</Term>
      </section>

      <TradeAgreementSignature token={token} existingSignature={dto.existingSignature} />
    </div>
  );
}
