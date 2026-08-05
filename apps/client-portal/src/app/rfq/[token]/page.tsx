/**
 * Trade RFQ guest page (Trade Scope RFQ dispatch, Phase 2).
 *
 * A login-less, mobile-first page a sub or installer opens from the link a
 * studio sends when it asks for a number. No session: the token is resolved
 * SERVER-SIDE through resolve_trade_rfq_link() using the service client, per
 * the proven apps/client-portal/src/app/field/[token]/page.tsx pattern —
 * force-dynamic, service client, single RPC read, 404 on any miss.
 *
 * resolve_trade_rfq_link answers NULL for every non-answerable state — an
 * invalid/garbage token, a revoked or expired one, a still-draft ask (never
 * sent), and an ask that has moved to 'closed' after execution (the
 * post-signature delta revokes this ask's token in the same transaction that
 * closes it, so a closed ask has no live token left to resolve through). A
 * dead link therefore never confirms it once existed, and this page never
 * renders a closed-state sentence itself — that sentence belongs to the
 * ACTION's bid_window_closed outcome (see rfq-response-form.tsx), reached
 * only via a still-live token whose ask closed AFTER the page already loaded
 * and the party then tried to submit.
 *
 * The RPC's own DTO never carries the client's price, another party's bid, or
 * any client identity — this page renders exactly the keys types.ts types and
 * nothing a stray extra field on the response object could add (pinned in
 * page.test.tsx).
 *
 * Submitting is a use-server action in ./actions.ts that calls
 * submit_trade_rfq_response directly — the token, not a session, is the
 * authority for the whole flow, exactly like the field guest page's actions.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@patina/supabase/server';
import { RfqResponseForm } from './rfq-response-form';
import { isLikelyTradeRfqToken, type TradeRfqLinkDTO } from './types';

// The RFQ's status and any existing response are read fresh every request —
// never static.
export const dynamic = 'force-dynamic';

// A bearer-token guest URL must never be indexed or followed out to a search
// engine (mirrors field/spec-book/[token]/page.tsx).
export const metadata: Metadata = {
  title: 'Request for a number · Patina',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function TradeRfqLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Cheap format gate before any DB round-trip — an obviously malformed
  // token was never a real link.
  if (!isLikelyTradeRfqToken(token)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;
  const { data, error } = await admin.rpc('resolve_trade_rfq_link', { p_token: token });
  const dto = error ? null : ((Array.isArray(data) ? data[0] : data) as TradeRfqLinkDTO | null);

  // NULL on any non-answerable state (invalid/revoked/expired token, still a
  // draft, or closed-after-execution) — never distinguish which, so a dead
  // link reads identically to one that never existed.
  if (!dto) notFound();

  const studioLabel = dto.studioName ?? 'Patina';

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-primary)] px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="type-meta">{studioLabel} · Request for a number</p>
        <h1 className="type-page-title mt-1" style={{ fontSize: 'clamp(1.5rem, 6vw, 2.1rem)' }}>
          {dto.scopeTitle ?? 'Trade scope'}
        </h1>
        {dto.partyDisplayName && (
          <p className="type-body-small mt-2 text-[var(--text-muted)]">{dto.partyDisplayName}</p>
        )}
      </header>

      {(dto.timeline || dto.message) && (
        <section className="mb-6 space-y-2">
          {dto.timeline && (
            <p className="type-body-small text-[var(--text-muted)]">Timeline: {dto.timeline}</p>
          )}
          {dto.message && <p className="type-body whitespace-pre-line">{dto.message}</p>}
        </section>
      )}

      <section className="mb-8" aria-label="Scope of work">
        <h2 className="type-section-head mb-3" style={{ fontSize: '1.05rem' }}>
          The work
        </h2>
        {dto.sections.length === 0 ? (
          <p className="type-body-small text-[var(--text-muted)]">
            No scope detail was included with this request.
          </p>
        ) : (
          <ul className="space-y-4">
            {dto.sections.map((section, index) => (
              <li key={`${section.roomName ?? 'throughout'}-${index}`}>
                <p className="type-item-name">{section.roomName || 'Throughout'}</p>
                <p className="type-body-small mt-1 whitespace-pre-line text-[var(--text-muted)]">
                  {section.prose}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RfqResponseForm token={token} existingResponse={dto.existingResponse} />
    </div>
  );
}
